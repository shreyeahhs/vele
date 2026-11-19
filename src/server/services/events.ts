import "server-only";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { RRule } from "@/lib/rrule";
import type { Calendar, CalendarEvent, EventAttendee, EventKind, EventShowAs, EventSource } from "@/generated/prisma/client";
import { errors } from "@/lib/errors";
import { classifyMeetingUrl, detectMeetingLink } from "@/lib/meeting-links";
import { describeRecurrence, expandRecurrence, type EngineEvent } from "@/scheduling";
import { db } from "../db";
import { audit, type ActorType } from "./audit";
import { notifyBookingCancelledByHost, notifyBookingRescheduledByHost } from "./booking-notices";
import { rememberContacts } from "./contacts";
import { sendInvitations, type InvitationResult } from "./invitations";
import { getPreferences } from "./preferences";

/**
 * Vele's calendar. Events live in PostgreSQL; recurring series are stored
 * once (RRULE on a master row) and expanded on read in the event's own zone.
 * A moved or cancelled occurrence becomes an exception row that points at its
 * series. Occurrences are addressed as `<masterId>~<originalStartMs>`.
 */
const OCC = "~";

export interface CalendarDTO {
  id: string;
  name: string;
  color: string | null;
  position: number;
  isDefault: boolean;
  isVisible: boolean;
  includeInAvailability: boolean;
  isPersonal: boolean;
}

export interface EventDTO {
  id: string;
  eventId: string;
  seriesId: string | null;
  occurrenceStart: string | null;
  calendarId: string;
  calendarName: string;
  calendarPosition: number;
  calendarIsPersonal: boolean;
  title: string;
  description: string | null;
  location: string | null;
  meetingUrl: string | null;
  meetingProvider: string;
  start: string;
  end: string;
  timezone: string;
  isAllDay: boolean;
  startDate: string | null;
  endDate: string | null;
  status: string;
  showAs: EventShowAs;
  kind: EventKind;
  isPrivate: boolean;
  attendees: Array<{ name: string | null; email: string | null }>;
  isRecurring: boolean;
  recurrenceText: string | null;
  /** RRULE lines of the series (for editing). */
  recurrence: string[];
  source: EventSource;
  bookingId: string | null;
}

type EventRow = CalendarEvent & { attendees: EventAttendee[]; calendar: Calendar };

function toCalendarDTO(c: Calendar): CalendarDTO {
  return {
    id: c.id,
    name: c.name,
    color: c.color,
    position: c.position,
    isDefault: c.isDefault,
    isVisible: c.isVisible,
    includeInAvailability: c.includeInAvailability,
    isPersonal: c.isPersonal,
  };
}

function toDTO(row: EventRow, occurrence?: { start: number; end: number; originalStart: number }, series?: EventRow): EventDTO {
  const master = series ?? (row.isRecurringMaster ? row : null);
  const start = occurrence ? new Date(occurrence.start) : row.startTime;
  const end = occurrence ? new Date(occurrence.end) : row.endTime;
  const dayOf = (d: Date) => DateTime.fromJSDate(d, { zone: row.timezone }).toISODate();
  return {
    id: occurrence ? `${row.id}${OCC}${occurrence.originalStart}` : row.id,
    eventId: row.id,
    seriesId: occurrence ? row.id : row.seriesId,
    occurrenceStart: occurrence ? new Date(occurrence.originalStart).toISOString() : (row.originalStartTime?.toISOString() ?? null),
    calendarId: row.calendarId,
    calendarName: row.calendar.name,
    calendarPosition: row.calendar.position,
    calendarIsPersonal: row.calendar.isPersonal,
    title: row.title,
    description: row.description,
    location: row.location,
    meetingUrl: row.meetingUrl,
    meetingProvider: row.meetingProvider,
    start: start.toISOString(),
    end: end.toISOString(),
    timezone: row.timezone,
    isAllDay: row.isAllDay,
    startDate: row.isAllDay ? (occurrence ? dayOf(start) : row.startDate) : null,
    endDate: row.isAllDay ? (occurrence ? dayOf(end) : row.endDate) : null,
    status: row.status,
    showAs: row.showAs,
    kind: row.kind,
    isPrivate: row.isPrivate,
    attendees: row.attendees.map((a) => ({ name: a.name, email: a.email })),
    isRecurring: Boolean(master) || Boolean(row.seriesId),
    recurrenceText: master ? describeRecurrence(master.recurrence) : null,
    recurrence: master?.recurrence ?? [],
    source: row.source,
    bookingId: row.bookingId,
  };
}

export async function listCalendars(userId: string): Promise<CalendarDTO[]> {
  const rows = await db.calendar.findMany({ where: { userId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return rows.map(toCalendarDTO);
}

export interface ListOptions {
  calendarIds?: string[];
  /** Only calendars shown in the UI. */
  visibleOnly?: boolean;
  /** Only calendars that count toward availability. */
  availabilityOnly?: boolean;
}

/** Every event overlapping [start, end), recurring series expanded, sorted by start. */
export async function listEvents(userId: string, range: { start: Date; end: Date }, opts: ListOptions = {}): Promise<EventDTO[]> {
  const calendarFilter = {
    userId,
    ...(opts.calendarIds?.length ? { id: { in: opts.calendarIds } } : {}),
    ...(opts.visibleOnly ? { isVisible: true } : {}),
    ...(opts.availabilityOnly ? { includeInAvailability: true } : {}),
  };
  const include = { attendees: true, calendar: true } as const;
  const [singles, masters] = await Promise.all([
    db.calendarEvent.findMany({
      where: { userId, calendar: calendarFilter, isRecurringMaster: false, status: { not: "CANCELLED" }, startTime: { lt: range.end }, endTime: { gt: range.start } },
      include,
      orderBy: { startTime: "asc" },
    }),
    db.calendarEvent.findMany({ where: { userId, calendar: calendarFilter, isRecurringMaster: true, startTime: { lt: range.end } }, include }),
  ]);
  const out: EventDTO[] = singles.map((row) => toDTO(row));
  if (masters.length) {
    const exceptions = await db.calendarEvent.findMany({
      where: { userId, seriesId: { in: masters.map((m) => m.id) }, originalStartTime: { not: null } },
      select: { seriesId: true, originalStartTime: true },
    });
    for (const master of masters) {
      const skip = exceptions.filter((e) => e.seriesId === master.id).map((e) => e.originalStartTime!.getTime());
      const occurrences = expandRecurrence(
        {
          start: master.startTime.getTime(),
          end: master.endTime.getTime(),
          timezone: master.timezone,
          recurrence: master.recurrence,
          isAllDay: master.isAllDay,
          startDate: master.startDate,
          endDate: master.endDate,
        },
        { start: range.start.getTime(), end: range.end.getTime() },
        skip,
      );
      for (const occ of occurrences) out.push(toDTO(master, occ, master));
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

/** The engine's view: only what affects availability, nothing else. */
export function toEngineEvents(events: EventDTO[], calendars: CalendarDTO[]): EngineEvent[] {
  const byId = new Map(calendars.map((c) => [c.id, c]));
  return events.map((e) => {
    const cal = byId.get(e.calendarId);
    const isMeetingKind = e.kind === "EVENT";
    return {
      id: e.id,
      calendarId: e.calendarId,
      start: Date.parse(e.start),
      end: Date.parse(e.end),
      isAllDay: e.isAllDay,
      status: e.status === "TENTATIVE" ? "tentative" : e.status === "CANCELLED" ? "cancelled" : "confirmed",
      showAs: e.showAs === "OUT_OF_OFFICE" ? "oof" : e.showAs === "FREE" ? "free" : e.showAs === "TENTATIVE" ? "tentative" : "busy",
      kind: e.kind === "FOCUS" ? "focus" : e.kind === "BLOCKED" ? "blocked" : e.kind === "OUT_OF_OFFICE" ? "oof" : "event",
      isMeeting: isMeetingKind && (!(cal?.isPersonal ?? false) || e.attendees.length > 0 || Boolean(e.meetingUrl) || e.source === "BOOKING"),
      countsForAvailability: cal?.includeInAvailability ?? true,
      title: e.title,
    };
  });
}

export async function engineEventsForUser(userId: string, range: { start: Date; end: Date }) {
  const [calendars, events] = await Promise.all([listCalendars(userId), listEvents(userId, range)]);
  return { calendars, events, engineEvents: toEngineEvents(events, calendars) };
}

function parseId(id: string): { eventId: string; originalStart: Date | null } {
  const idx = id.indexOf(OCC);
  if (idx === -1) return { eventId: id, originalStart: null };
  const ms = Number(id.slice(idx + 1));
  if (!Number.isFinite(ms)) throw errors.notFound("That event");
  return { eventId: id.slice(0, idx), originalStart: new Date(ms) };
}

async function loadOwned(userId: string, eventId: string): Promise<EventRow> {
  const row = await db.calendarEvent.findFirst({ where: { id: eventId, userId }, include: { attendees: true, calendar: true } });
  if (!row) throw errors.notFound("That event");
  return row;
}

interface Resolved {
  /** The row to act on (master for a series occurrence). */
  row: EventRow;
  /** For a series occurrence: the occurrence's original start and current times. */
  occurrence: { originalStart: Date; start: Date; end: Date } | null;
}

async function resolve(userId: string, id: string): Promise<Resolved> {
  const { eventId, originalStart } = parseId(id);
  const row = await loadOwned(userId, eventId);
  if (!originalStart) return { row, occurrence: null };
  if (!row.isRecurringMaster) throw errors.notFound("That occurrence");
  const [occ] = expandRecurrence(
    {
      start: row.startTime.getTime(),
      end: row.endTime.getTime(),
      timezone: row.timezone,
      recurrence: row.recurrence,
      isAllDay: row.isAllDay,
      startDate: row.startDate,
      endDate: row.endDate,
    },
    { start: originalStart.getTime(), end: originalStart.getTime() + 1 },
  ).filter((o) => o.originalStart === originalStart.getTime());
  if (!occ) throw errors.notFound("That occurrence");
  return { row, occurrence: { originalStart, start: new Date(occ.start), end: new Date(occ.end) } };
}

export async function getEvent(userId: string, id: string): Promise<EventDTO> {
  const { row, occurrence } = await resolve(userId, id);
  if (occurrence) return toDTO(row, { start: occurrence.start.getTime(), end: occurrence.end.getTime(), originalStart: occurrence.originalStart.getTime() }, row);
  return toDTO(row);
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

export interface EventFields {
  title: string;
  calendarId?: string | null;
  start: Date;
  end: Date;
  timezone?: string;
  isAllDay?: boolean;
  location?: string | null;
  description?: string | null;
  meetingUrl?: string | null;
  attendees?: Array<{ email: string; name?: string | null }>;
  /** RRULE lines, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO"]. */
  recurrence?: string[] | null;
  kind?: EventKind;
  showAs?: EventShowAs;
  isPrivate?: boolean;
}

export interface WriteResult {
  event: EventDTO;
  invitations: InvitationResult[];
}

const MAX_EVENT_MS = 14 * 86_400_000;

function validateTimes(start: Date, end: Date) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw errors.validation("The event needs a valid start and end.");
  if (end <= start) throw errors.validation("The event must end after it starts.");
  if (end.getTime() - start.getTime() > MAX_EVENT_MS) throw errors.validation("Events can be at most 14 days long.");
}

export function normaliseRecurrence(lines: string[] | null | undefined): string[] {
  if (!lines || lines.length === 0) return [];
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim().toUpperCase().startsWith("RRULE:") || raw.trim().toUpperCase().startsWith("EXDATE") ? raw.trim() : `RRULE:${raw.trim()}`;
    if (line.toUpperCase().startsWith("RRULE:")) {
      try {
        const opts = RRule.parseString(line.slice(6));
        if (opts.freq === undefined || ![RRule.DAILY, RRule.WEEKLY, RRule.MONTHLY, RRule.YEARLY].includes(opts.freq)) {
          throw new Error("unsupported");
        }
      } catch {
        throw errors.validation("That repeat rule isn't supported. Use daily, weekly, monthly or yearly repeats.");
      }
    }
    out.push(line);
  }
  return out;
}

function meetingFields(input: { meetingUrl?: string | null; location?: string | null; description?: string | null }) {
  if (input.meetingUrl) {
    if (!/^https:\/\//i.test(input.meetingUrl)) throw errors.validation("Meeting links must start with https://");
    return { meetingUrl: input.meetingUrl, meetingProvider: classifyMeetingUrl(input.meetingUrl) };
  }
  const found = detectMeetingLink([input.location, input.description]);
  return { meetingUrl: found.url, meetingProvider: found.provider };
}

async function resolveCalendar(userId: string, calendarId?: string | null) {
  if (calendarId) {
    const cal = await db.calendar.findFirst({ where: { id: calendarId, userId } });
    if (!cal) throw errors.validation("That calendar doesn't exist.");
    return cal;
  }
  const prefs = await getPreferences(userId);
  const cal =
    (prefs.defaultCalendarId && (await db.calendar.findFirst({ where: { id: prefs.defaultCalendarId, userId } }))) ||
    (await db.calendar.findFirst({ where: { userId }, orderBy: [{ isDefault: "desc" }, { position: "asc" }] }));
  if (!cal) throw errors.validation("You don't have a calendar yet.");
  return cal;
}

function allDayDates(start: Date, end: Date, zone: string) {
  const s = DateTime.fromJSDate(start, { zone }).startOf("day");
  let e = DateTime.fromJSDate(end, { zone }).startOf("day");
  if (e <= s) e = s.plus({ days: 1 });
  return { startTime: s.toJSDate(), endTime: e.toJSDate(), startDate: s.toISODate()!, endDate: e.toISODate()! };
}

export async function createEvent(userId: string, input: EventFields & { sendInvitations?: boolean; source: EventSource }, actor: ActorType): Promise<WriteResult> {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw errors.validation("The event needs a title.");
  validateTimes(input.start, input.end);
  const calendar = await resolveCalendar(userId, input.calendarId);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true, email: true } });
  const zone = input.timezone ?? user.timezone;
  const recurrence = normaliseRecurrence(input.recurrence);
  const attendees = dedupeAttendees(input.attendees ?? [], user.email);
  const times = input.isAllDay ? allDayDates(input.start, input.end, zone) : { startTime: input.start, endTime: input.end, startDate: null, endDate: null };

  const created = await db.calendarEvent.create({
    data: {
      userId,
      calendarId: calendar.id,
      iCalUid: `${randomUUID()}@vele`,
      title,
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      ...meetingFields(input),
      ...times,
      timezone: zone,
      isAllDay: Boolean(input.isAllDay),
      kind: input.kind ?? "EVENT",
      showAs: input.showAs ?? (input.isAllDay ? "FREE" : "BUSY"),
      isPrivate: Boolean(input.isPrivate),
      isRecurringMaster: recurrence.length > 0,
      recurrence,
      source: input.source,
      attendees: { create: attendees.map((a) => ({ userId, email: a.email, name: a.name ?? null })) },
    },
    include: { attendees: true, calendar: true },
  });
  await rememberContacts(userId, attendees, input.source === "ASSISTANT" ? "ASSISTANT" : "MANUAL", created.startTime);
  const invitations = attendees.length && input.sendInvitations !== false ? await sendInvitations({ userId, kind: "invite", event: created, attendees: created.attendees }) : [];
  await audit({
    userId,
    actorType: actor,
    action: "event.create",
    targetType: "event",
    targetId: created.id,
    metadata: { attendees: attendees.length, recurring: recurrence.length > 0 },
  });
  return { event: toDTO(created), invitations };
}

function dedupeAttendees(list: Array<{ email: string; name?: string | null }>, ownEmail: string) {
  const seen = new Set<string>([ownEmail.toLowerCase()]);
  const out: Array<{ email: string; name?: string | null }> = [];
  for (const a of list) {
    const email = a.email.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: a.name?.trim() || null });
  }
  return out;
}

export type EventChanges = Partial<Omit<EventFields, "recurrence">> & { recurrence?: string[] | null };

export interface ChangeOptions {
  /** For series: change just this occurrence or the whole series. */
  scope?: "occurrence" | "series";
  /** Email attendees about the change. */
  notify?: boolean;
}

export async function updateEvent(userId: string, id: string, changes: EventChanges, actor: ActorType, opts: ChangeOptions = {}): Promise<WriteResult> {
  const { row, occurrence } = await resolve(userId, id);
  const scope = occurrence ? (opts.scope ?? "occurrence") : "series";
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const calendar = changes.calendarId ? await resolveCalendar(userId, changes.calendarId) : null;
  const timeChanged = changes.start !== undefined || changes.end !== undefined;

  // Target times for the edited occurrence (or the single event).
  const baseStart = occurrence?.start ?? row.startTime;
  const baseEnd = occurrence?.end ?? row.endTime;
  const newStart = changes.start ?? baseStart;
  const newEnd = changes.end ?? (changes.start ? new Date(changes.start.getTime() + (baseEnd.getTime() - baseStart.getTime())) : baseEnd);
  if (timeChanged) validateTimes(newStart, newEnd);

  const fieldData = {
    ...(changes.title !== undefined ? { title: changes.title.trim().slice(0, 200) || row.title } : {}),
    ...(changes.description !== undefined ? { description: changes.description?.trim() || null } : {}),
    ...(changes.location !== undefined ? { location: changes.location?.trim() || null } : {}),
    ...(changes.meetingUrl !== undefined || changes.location !== undefined || changes.description !== undefined
      ? meetingFields({
          meetingUrl: changes.meetingUrl !== undefined ? changes.meetingUrl : row.meetingUrl,
          location: changes.location !== undefined ? changes.location : row.location,
          description: changes.description !== undefined ? changes.description : row.description,
        })
      : {}),
    ...(changes.kind ? { kind: changes.kind } : {}),
    ...(changes.showAs ? { showAs: changes.showAs } : {}),
    ...(changes.isPrivate !== undefined ? { isPrivate: changes.isPrivate } : {}),
    ...(calendar ? { calendarId: calendar.id } : {}),
  };
  const attendeeList = changes.attendees ? dedupeAttendees(changes.attendees, user.email) : null;

  let saved: EventRow;
  let recurrenceId: Date | null = null;
  let seriesUid: string | null = null;

  if (occurrence && scope === "occurrence") {
    const existing = await db.calendarEvent.findFirst({ where: { userId, seriesId: row.id, originalStartTime: occurrence.originalStart } });
    const data = {
      ...fieldData,
      startTime: newStart,
      endTime: newEnd,
      sequence: { increment: 1 },
      ...(attendeeList ? { attendees: { deleteMany: {}, create: attendeeList.map((a) => ({ userId, email: a.email, name: a.name ?? null })) } } : {}),
    };
    saved = existing
      ? await db.calendarEvent.update({ where: { id: existing.id }, data, include: { attendees: true, calendar: true } })
      : await db.calendarEvent.create({
          data: {
            userId,
            calendarId: calendar?.id ?? row.calendarId,
            iCalUid: `${row.iCalUid}#${occurrence.originalStart.getTime()}`,
            sequence: row.sequence + 1,
            title: row.title,
            description: row.description,
            location: row.location,
            meetingUrl: row.meetingUrl,
            meetingProvider: row.meetingProvider,
            timezone: row.timezone,
            isAllDay: row.isAllDay,
            kind: row.kind,
            showAs: row.showAs,
            isPrivate: row.isPrivate,
            source: row.source,
            seriesId: row.id,
            originalStartTime: occurrence.originalStart,
            ...fieldData,
            startTime: newStart,
            endTime: newEnd,
            attendees: {
              create: (attendeeList ?? row.attendees.map((a) => ({ email: a.email ?? "", name: a.name })))
                .filter((a) => a.email)
                .map((a) => ({ userId, email: a.email, name: a.name ?? null })),
            },
          },
          include: { attendees: true, calendar: true },
        });
    recurrenceId = occurrence.originalStart;
    seriesUid = row.iCalUid;
  } else {
    // Whole series (or a single event): shift the series by the same amount.
    const delta = newStart.getTime() - baseStart.getTime();
    const duration = newEnd.getTime() - newStart.getTime();
    const masterStart = new Date(row.startTime.getTime() + delta);
    const recurrence = changes.recurrence !== undefined ? normaliseRecurrence(changes.recurrence) : undefined;
    saved = await db.calendarEvent.update({
      where: { id: row.id },
      data: {
        ...fieldData,
        ...(timeChanged ? { startTime: masterStart, endTime: new Date(masterStart.getTime() + duration) } : {}),
        ...(recurrence !== undefined ? { recurrence, isRecurringMaster: recurrence.length > 0 } : {}),
        sequence: { increment: 1 },
        ...(attendeeList ? { attendees: { deleteMany: {}, create: attendeeList.map((a) => ({ userId, email: a.email, name: a.name ?? null })) } } : {}),
      },
      include: { attendees: true, calendar: true },
    });
    if (saved.seriesId) {
      const master = await db.calendarEvent.findUnique({ where: { id: saved.seriesId }, select: { iCalUid: true } });
      seriesUid = master?.iCalUid ?? null;
      recurrenceId = saved.originalStartTime;
    }
  }

  if (attendeeList) await rememberContacts(userId, attendeeList, actor === "assistant" ? "ASSISTANT" : "MANUAL");
  const shouldNotify = opts.notify ?? true;
  const invitations =
    shouldNotify && saved.attendees.length ? await sendInvitations({ userId, kind: "update", event: saved, attendees: saved.attendees, recurrenceId, seriesUid }) : [];
  if (saved.bookingId && timeChanged) await notifyBookingRescheduledByHost(saved.bookingId, { start: baseStart, end: baseEnd }, { start: saved.startTime, end: saved.endTime });
  await audit({ userId, actorType: actor, action: "event.update", targetType: "event", targetId: saved.id, metadata: { scope, timeChanged, notified: invitations.length } });

  const dto = saved.isRecurringMaster && occurrence ? toDTO(saved, { start: newStart.getTime(), end: newEnd.getTime(), originalStart: newStart.getTime() }, saved) : toDTO(saved);
  return { event: dto, invitations };
}

export interface CancelResult {
  title: string;
  start: string;
  end: string;
  invitations: InvitationResult[];
  bookingNotified: boolean;
}

export async function cancelEvent(userId: string, id: string, actor: ActorType, opts: ChangeOptions & { reason?: string | null } = {}): Promise<CancelResult> {
  const { row, occurrence } = await resolve(userId, id);
  const scope = occurrence ? (opts.scope ?? "occurrence") : "series";
  const notify = opts.notify ?? true;
  let invitations: InvitationResult[] = [];
  let bookingNotified = false;
  const start = occurrence?.start ?? row.startTime;
  const end = occurrence?.end ?? row.endTime;

  if (occurrence && scope === "occurrence") {
    const existing = await db.calendarEvent.findFirst({ where: { userId, seriesId: row.id, originalStartTime: occurrence.originalStart } });
    if (existing) {
      await db.calendarEvent.update({ where: { id: existing.id }, data: { status: "CANCELLED", sequence: { increment: 1 } } });
    } else {
      await db.calendarEvent.create({
        data: {
          userId,
          calendarId: row.calendarId,
          iCalUid: `${row.iCalUid}#${occurrence.originalStart.getTime()}`,
          sequence: row.sequence + 1,
          title: row.title,
          timezone: row.timezone,
          startTime: occurrence.start,
          endTime: occurrence.end,
          status: "CANCELLED",
          seriesId: row.id,
          originalStartTime: occurrence.originalStart,
          source: row.source,
        },
      });
    }
    if (notify && row.attendees.length) {
      invitations = await sendInvitations({
        userId,
        kind: "cancel",
        event: { ...row, startTime: occurrence.start, endTime: occurrence.end, sequence: row.sequence + 1 },
        attendees: row.attendees,
        recurrenceId: occurrence.originalStart,
        seriesUid: row.iCalUid,
      });
    }
  } else {
    if (notify && row.attendees.length) {
      invitations = await sendInvitations({ userId, kind: "cancel", event: { ...row, sequence: row.sequence + 1 }, attendees: row.attendees });
    }
    if (row.bookingId) bookingNotified = await notifyBookingCancelledByHost(row.bookingId, opts.reason ?? null);
    await db.calendarEvent.deleteMany({ where: { userId, OR: [{ id: row.id }, { seriesId: row.id }] } });
  }
  await audit({
    userId,
    actorType: actor,
    action: "event.cancel",
    targetType: "event",
    targetId: row.id,
    metadata: { scope, notified: invitations.length, booking: Boolean(row.bookingId) },
  });
  return { title: row.title, start: start.toISOString(), end: end.toISOString(), invitations, bookingNotified };
}

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Database search over titles, locations, descriptions and attendee names or
 * addresses ("meetings with Kevin", "when did I last meet Sarah"). Recurring
 * series are expanded within a window so matches return concrete dates.
 */
export async function searchEvents(userId: string, query: string, opts: { when?: "past" | "upcoming" | "any"; limit?: number; now?: Date } = {}): Promise<EventDTO[]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const now = opts.now ?? new Date();
  const when = opts.when ?? "any";
  const limit = Math.min(opts.limit ?? 15, 50);
  const text = { contains: q, mode: "insensitive" as const };
  const match = {
    OR: [{ title: text }, { location: text }, { description: text }, { attendees: { some: { OR: [{ name: text }, { email: text }] } } }],
  };
  const timeFilter = when === "past" ? { startTime: { lt: now } } : when === "upcoming" ? { endTime: { gte: now } } : {};
  const include = { attendees: true, calendar: true } as const;
  const [singles, masters] = await Promise.all([
    db.calendarEvent.findMany({
      where: { userId, isRecurringMaster: false, status: { not: "CANCELLED" }, ...timeFilter, ...match },
      include,
      orderBy: { startTime: when === "past" ? "desc" : "asc" },
      take: limit,
    }),
    db.calendarEvent.findMany({ where: { userId, isRecurringMaster: true, ...match }, include, take: 10 }),
  ]);
  const results = singles.map((r) => toDTO(r));
  const window = {
    start: new Date(when === "upcoming" ? now.getTime() : now.getTime() - 180 * 86_400_000),
    end: new Date(when === "past" ? now.getTime() : now.getTime() + 180 * 86_400_000),
  };
  for (const master of masters) {
    const occ = expandRecurrence(
      {
        start: master.startTime.getTime(),
        end: master.endTime.getTime(),
        timezone: master.timezone,
        recurrence: master.recurrence,
        isAllDay: master.isAllDay,
        startDate: master.startDate,
        endDate: master.endDate,
      },
      { start: window.start.getTime(), end: window.end.getTime() },
    );
    const pick = when === "past" ? occ.slice(-3).reverse() : occ.slice(0, 3);
    for (const o of pick) results.push(toDTO(master, o, master));
  }
  return results.sort((a, b) => (when === "past" ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start))).slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendars
// ─────────────────────────────────────────────────────────────────────────────

export async function createCalendar(userId: string, input: { name: string; isPersonal?: boolean; color?: string | null }): Promise<CalendarDTO> {
  const count = await db.calendar.count({ where: { userId } });
  if (count >= 20) throw errors.validation("You can have up to 20 calendars.");
  const cal = await db.calendar.create({
    data: { userId, name: input.name.trim().slice(0, 60) || "Calendar", isPersonal: Boolean(input.isPersonal), color: input.color ?? null, position: count },
  });
  return toCalendarDTO(cal);
}

export async function updateCalendar(
  userId: string,
  id: string,
  input: Partial<Pick<CalendarDTO, "name" | "color" | "isVisible" | "includeInAvailability" | "isPersonal">>,
): Promise<CalendarDTO> {
  const cal = await db.calendar.findFirst({ where: { id, userId } });
  if (!cal) throw errors.notFound("That calendar");
  const updated = await db.calendar.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim().slice(0, 60) || cal.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.isVisible !== undefined ? { isVisible: input.isVisible } : {}),
      ...(input.includeInAvailability !== undefined ? { includeInAvailability: input.includeInAvailability } : {}),
      ...(input.isPersonal !== undefined ? { isPersonal: input.isPersonal } : {}),
    },
  });
  return toCalendarDTO(updated);
}

export async function deleteCalendar(userId: string, id: string) {
  const cal = await db.calendar.findFirst({ where: { id, userId } });
  if (!cal) throw errors.notFound("That calendar");
  if (cal.isDefault) throw errors.validation("The default calendar can't be deleted. Make another calendar the default first.");
  const events = await db.calendarEvent.count({ where: { calendarId: id } });
  if (events > 0) throw errors.validation(`Move or delete the ${events} event${events === 1 ? "" : "s"} in this calendar first.`);
  await db.calendar.delete({ where: { id } });
}

export { OCC as OCCURRENCE_SEPARATOR };
