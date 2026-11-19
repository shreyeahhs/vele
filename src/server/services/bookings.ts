import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type BookingProfile, type LinkVisibility, type LocationType, type MeetingType } from "@/generated/prisma/client";
import { hashToken, randomToken } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { errors } from "@/lib/errors";
import { classifyMeetingUrl } from "@/lib/meeting-links";
import { DAY, findAvailableSlots, isValidTimeZone, localDateOf, minutesIntoLocalDay, type SchedulingRules, type WeeklyWindow } from "@/scheduling";
import { db } from "../db";
import { audit } from "./audit";
import { sendBookingCancellation, sendBookingConfirmations, sendBookingRescheduled } from "./booking-notices";
import { rememberContacts } from "./contacts";
import { listCalendars, listEvents, toEngineEvents } from "./events";
import { getPreferences, toRules, windowSchema } from "./preferences";
import { slugifyHandle } from "./provisioning";

// ─────────────────────────────────────────────────────────────────────────────
// Host side: profile, meeting types, invites, bookings list
// ─────────────────────────────────────────────────────────────────────────────

export const meetingTypeSchema = z.object({
  title: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes")
    .optional(),
  description: z.string().trim().max(500).nullable().optional(),
  durationMin: z.number().int().min(5).max(480),
  locationType: z.enum(["NONE", "IN_PERSON", "PHONE", "VIDEO_LINK"]).default("NONE"),
  locationValue: z.string().trim().max(500).nullable().optional(),
  bufferBeforeMin: z.number().int().min(0).max(120).nullable().optional(),
  bufferAfterMin: z.number().int().min(0).max(120).nullable().optional(),
  minimumNoticeMin: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 30)
    .nullable()
    .optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).nullable().optional(),
  maxPerDay: z.number().int().min(1).max(50).nullable().optional(),
  slotIntervalMin: z
    .union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60)])
    .nullable()
    .optional(),
  availabilityOverride: z.array(windowSchema).max(21).nullable().optional(),
  conflictCalendarIds: z.array(z.string()).max(20).optional(),
  destinationCalendarId: z.string().nullable().optional(),
  visibility: z.enum(["PUBLIC", "UNLISTED", "PRIVATE"]).default("PUBLIC"),
  isActive: z.boolean().default(true),
});

export type MeetingTypeInput = z.infer<typeof meetingTypeSchema>;

export interface MeetingTypeDTO {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  durationMin: number;
  locationType: LocationType;
  locationValue: string | null;
  bufferBeforeMin: number | null;
  bufferAfterMin: number | null;
  minimumNoticeMin: number | null;
  maxAdvanceDays: number | null;
  maxPerDay: number | null;
  slotIntervalMin: number | null;
  availabilityOverride: WeeklyWindow[] | null;
  conflictCalendarIds: string[];
  destinationCalendarId: string | null;
  visibility: LinkVisibility;
  isActive: boolean;
  position: number;
  url: string;
}

function typeUrl(handle: string, slug: string) {
  return appUrl(`/book/${handle}/${slug}`);
}

function toTypeDTO(t: MeetingType, handle: string): MeetingTypeDTO {
  return {
    id: t.id,
    slug: t.slug,
    title: t.title,
    description: t.description,
    durationMin: t.durationMin,
    locationType: t.locationType,
    locationValue: t.locationValue,
    bufferBeforeMin: t.bufferBeforeMin,
    bufferAfterMin: t.bufferAfterMin,
    minimumNoticeMin: t.minimumNoticeMin,
    maxAdvanceDays: t.maxAdvanceDays,
    maxPerDay: t.maxPerDay,
    slotIntervalMin: t.slotIntervalMin,
    availabilityOverride: (t.availabilityOverride as unknown as WeeklyWindow[] | null) ?? null,
    conflictCalendarIds: t.conflictCalendarIds,
    destinationCalendarId: t.destinationCalendarId,
    visibility: t.visibility,
    isActive: t.isActive,
    position: t.position,
    url: typeUrl(handle, t.slug),
  };
}

async function profileFor(userId: string): Promise<BookingProfile> {
  const p = await db.bookingProfile.findUnique({ where: { userId } });
  if (!p) throw errors.notFound("Your booking page");
  return p;
}

export async function getBookingSettings(userId: string) {
  const profile = await profileFor(userId);
  const types = await db.meetingType.findMany({ where: { userId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return {
    profile: {
      handle: profile.handle,
      displayName: profile.displayName,
      headline: profile.headline,
      welcomeMessage: profile.welcomeMessage,
      visibility: profile.visibility,
      url: appUrl(`/book/${profile.handle}`),
    },
    meetingTypes: types.map((t) => toTypeDTO(t, profile.handle)),
  };
}

export const bookingProfileSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes")
    .optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  headline: z.string().trim().max(120).nullable().optional(),
  welcomeMessage: z.string().trim().max(600).nullable().optional(),
  visibility: z.enum(["PUBLIC", "UNLISTED", "PRIVATE"]).optional(),
});

export async function updateBookingProfile(userId: string, input: z.infer<typeof bookingProfileSchema>) {
  if (input.handle) {
    const taken = await db.bookingProfile.findFirst({ where: { handle: input.handle, NOT: { userId } } });
    if (taken) throw errors.validation("That link name is taken.");
  }
  await db.bookingProfile.update({ where: { userId }, data: input });
  await audit({ userId, actorType: "user", action: "booking_profile.update" });
  return getBookingSettings(userId);
}

async function validateTypeInput(userId: string, input: Partial<MeetingTypeInput>) {
  if (input.locationType === "VIDEO_LINK" && input.locationValue && !/^https:\/\//i.test(input.locationValue)) {
    throw errors.validation("Video links must start with https://");
  }
  const ids = [...(input.conflictCalendarIds ?? []), ...(input.destinationCalendarId ? [input.destinationCalendarId] : [])];
  if (ids.length) {
    const owned = await db.calendar.count({ where: { userId, id: { in: ids } } });
    if (owned !== new Set(ids).size) throw errors.validation("One of those calendars doesn't exist.");
  }
}

export async function createMeetingType(userId: string, input: MeetingTypeInput): Promise<MeetingTypeDTO> {
  await validateTypeInput(userId, input);
  const profile = await profileFor(userId);
  let slug = input.slug ?? slugifyHandle(input.title);
  for (let i = 2; await db.meetingType.findUnique({ where: { userId_slug: { userId, slug } } }); i++) slug = `${input.slug ?? slugifyHandle(input.title)}-${i}`;
  const count = await db.meetingType.count({ where: { userId } });
  const t = await db.meetingType.create({
    data: {
      userId,
      ...input,
      slug,
      availabilityOverride: input.availabilityOverride ?? Prisma.DbNull,
      conflictCalendarIds: input.conflictCalendarIds ?? [],
      position: count,
    },
  });
  await audit({ userId, actorType: "user", action: "meeting_type.create", targetType: "meeting_type", targetId: t.id });
  return toTypeDTO(t, profile.handle);
}

export async function updateMeetingType(userId: string, id: string, input: Partial<MeetingTypeInput>): Promise<MeetingTypeDTO> {
  const existing = await db.meetingType.findFirst({ where: { id, userId } });
  if (!existing) throw errors.notFound("That meeting type");
  await validateTypeInput(userId, input);
  if (input.slug && input.slug !== existing.slug) {
    const clash = await db.meetingType.findUnique({ where: { userId_slug: { userId, slug: input.slug } } });
    if (clash) throw errors.validation("You already have a meeting type with that link.");
  }
  const profile = await profileFor(userId);
  const { availabilityOverride, ...rest } = input;
  const t = await db.meetingType.update({
    where: { id },
    data: {
      ...rest,
      ...(availabilityOverride !== undefined ? { availabilityOverride: availabilityOverride ?? Prisma.DbNull } : {}),
    },
  });
  await audit({ userId, actorType: "user", action: "meeting_type.update", targetType: "meeting_type", targetId: id });
  return toTypeDTO(t, profile.handle);
}

export async function deleteMeetingType(userId: string, id: string) {
  const existing = await db.meetingType.findFirst({ where: { id, userId } });
  if (!existing) throw errors.notFound("That meeting type");
  await db.meetingType.delete({ where: { id } });
  await audit({ userId, actorType: "user", action: "meeting_type.delete", targetType: "meeting_type", targetId: id });
}

/** A secret link that unlocks a private meeting type. The token is shown once. */
export async function createPrivateLink(userId: string, input: { meetingTypeId: string; singleUse?: boolean; label?: string | null; expiresInDays?: number | null }) {
  const type = await db.meetingType.findFirst({ where: { id: input.meetingTypeId, userId } });
  if (!type) throw errors.notFound("That meeting type");
  const profile = await profileFor(userId);
  const token = randomToken(18);
  await db.bookingInvite.create({
    data: {
      userId,
      meetingTypeId: type.id,
      tokenHash: hashToken(token),
      label: input.label ?? null,
      singleUse: Boolean(input.singleUse),
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * DAY) : null,
    },
  });
  await audit({ userId, actorType: "user", action: "booking_invite.create", targetType: "meeting_type", targetId: type.id, metadata: { singleUse: Boolean(input.singleUse) } });
  return { url: `${typeUrl(profile.handle, type.slug)}?invite=${token}`, singleUse: Boolean(input.singleUse), meetingType: type.title };
}

export interface BookingDTO {
  id: string;
  title: string;
  status: string;
  start: string;
  end: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteeTimezone: string;
  message: string | null;
  meetingUrl: string | null;
  locationValue: string | null;
  meetingType: string | null;
  eventId: string | null;
  createdAt: string;
}

export async function listBookings(userId: string, filter: "upcoming" | "past" | "cancelled" = "upcoming", limit = 50): Promise<BookingDTO[]> {
  const now = new Date();
  const where =
    filter === "upcoming"
      ? { userId, status: "CONFIRMED" as const, endTime: { gte: now } }
      : filter === "past"
        ? { userId, status: "CONFIRMED" as const, endTime: { lt: now } }
        : { userId, status: "CANCELLED" as const };
  const rows = await db.booking.findMany({
    where,
    orderBy: { startTime: filter === "upcoming" ? "asc" : "desc" },
    take: limit,
    include: { meetingType: { select: { title: true } }, event: { select: { id: true } } },
  });
  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    status: b.status,
    start: b.startTime.toISOString(),
    end: b.endTime.toISOString(),
    inviteeName: b.inviteeName,
    inviteeEmail: b.inviteeEmail,
    inviteeTimezone: b.inviteeTimezone,
    message: b.message,
    meetingUrl: b.meetingUrl,
    locationValue: b.locationValue,
    meetingType: b.meetingType?.title ?? null,
    eventId: b.event?.id ?? null,
    createdAt: b.createdAt.toISOString(),
  }));
}

export async function cancelBookingAsHost(userId: string, bookingId: string, reason: string | null) {
  const b = await db.booking.findFirst({ where: { id: bookingId, userId, status: "CONFIRMED" } });
  if (!b) throw errors.notFound("That booking");
  await db.$transaction([
    db.booking.update({ where: { id: b.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "host", cancelReason: reason } }),
    db.calendarEvent.deleteMany({ where: { bookingId: b.id, userId } }),
  ]);
  const email = await sendBookingCancellation(b.id, "host", reason);
  await audit({ userId, actorType: "user", action: "booking.cancel", targetType: "booking", targetId: b.id, metadata: { by: "host" } });
  return { emailStatus: email };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public side: what a visitor can see and do
// ─────────────────────────────────────────────────────────────────────────────

interface AccessContext {
  profile: BookingProfile & { user: { timezone: string } };
  type: MeetingType;
  inviteId: string | null;
}

/**
 * Resolves a public booking URL. Public types are listed; unlisted types are
 * reachable only by their direct link; private types need a valid invite.
 * Anything not accessible is a plain "not found", never a hint it exists.
 */
async function access(handle: string, slug: string, inviteToken?: string | null): Promise<AccessContext> {
  const profile = await db.bookingProfile.findUnique({ where: { handle }, include: { user: { select: { timezone: true, banned: true } } } });
  if (!profile || profile.user.banned) throw errors.notFound("This booking page");
  const type = await db.meetingType.findUnique({ where: { userId_slug: { userId: profile.userId, slug } } });
  if (!type || !type.isActive) throw errors.notFound("This booking page");
  let inviteId: string | null = null;
  if (type.visibility === "PRIVATE" || profile.visibility === "PRIVATE") {
    if (!inviteToken) throw errors.notFound("This booking page");
    const invite = await db.bookingInvite.findUnique({ where: { tokenHash: hashToken(inviteToken) } });
    const valid =
      invite &&
      invite.userId === profile.userId &&
      (!invite.meetingTypeId || invite.meetingTypeId === type.id) &&
      !invite.revokedAt &&
      (!invite.expiresAt || invite.expiresAt > new Date()) &&
      !(invite.singleUse && invite.usedAt);
    if (!valid) throw errors.notFound("This booking page");
    inviteId = invite.id;
  }
  return { profile, type, inviteId };
}

export async function getPublicProfile(handle: string) {
  const profile = await db.bookingProfile.findUnique({ where: { handle }, include: { user: { select: { timezone: true, banned: true } } } });
  if (!profile || profile.user.banned || profile.visibility === "PRIVATE") throw errors.notFound("This booking page");
  const types =
    profile.visibility === "UNLISTED"
      ? []
      : await db.meetingType.findMany({ where: { userId: profile.userId, isActive: true, visibility: "PUBLIC" }, orderBy: [{ position: "asc" }] });
  return {
    handle: profile.handle,
    displayName: profile.displayName,
    headline: profile.headline,
    welcomeMessage: profile.welcomeMessage,
    hostTimezone: profile.user.timezone,
    meetingTypes: types.map(publicType),
  };
}

function publicType(t: MeetingType) {
  return {
    slug: t.slug,
    title: t.title,
    description: t.description,
    durationMin: t.durationMin,
    locationType: t.locationType,
    // Addresses and phone numbers are shared after booking; the kind of video link is shown up front.
    locationHint:
      t.locationType === "VIDEO_LINK" ? classifyMeetingUrl(t.locationValue) : t.locationType === "IN_PERSON" ? "IN_PERSON" : t.locationType === "PHONE" ? "PHONE" : "NONE",
  };
}

export async function getPublicMeetingType(handle: string, slug: string, inviteToken?: string | null) {
  const { profile, type } = await access(handle, slug, inviteToken);
  return { host: { displayName: profile.displayName, headline: profile.headline, hostTimezone: profile.user.timezone }, meetingType: publicType(type) };
}

async function bookingInputs(ctx: AccessContext, range: { start: Date; end: Date }, ignoreEventIds: string[] = []) {
  const userId = ctx.profile.userId;
  const prefs = await getPreferences(userId);
  const base = toRules(prefs);
  const override = ctx.type.availabilityOverride as unknown as WeeklyWindow[] | null;
  const rules: SchedulingRules = {
    ...base,
    workingHours: override?.length ? override : base.workingHours,
    minimumNoticeMin: ctx.type.minimumNoticeMin ?? base.minimumNoticeMin,
    maxAdvanceDays: ctx.type.maxAdvanceDays ?? base.maxAdvanceDays,
    slotIntervalMin: ctx.type.slotIntervalMin ?? base.slotIntervalMin,
  };
  const calendars = await listCalendars(userId);
  const conflictIds = ctx.type.conflictCalendarIds.length ? ctx.type.conflictCalendarIds : calendars.filter((c) => c.includeInAvailability).map((c) => c.id);
  const padded = { start: new Date(range.start.getTime() - DAY), end: new Date(range.end.getTime() + DAY) };
  const events = await listEvents(userId, padded, { calendarIds: conflictIds });
  const engineEvents = toEngineEvents(
    events,
    calendars.map((c) => ({ ...c, includeInAvailability: true })),
  ).filter((e) => !ignoreEventIds.includes(e.id));
  return { rules, engineEvents, timezone: prefs.timezone };
}

/** Days on which this meeting type already reached its per-day limit (host's local dates). */
async function fullDays(ctx: AccessContext, range: { start: Date; end: Date }, timezone: string, excludeBookingId?: string) {
  if (!ctx.type.maxPerDay) return new Set<string>();
  const booked = await db.booking.findMany({
    where: {
      userId: ctx.profile.userId,
      meetingTypeId: ctx.type.id,
      status: "CONFIRMED",
      startTime: { gte: new Date(range.start.getTime() - DAY), lt: new Date(range.end.getTime() + DAY) },
      ...(excludeBookingId ? { NOT: { id: excludeBookingId } } : {}),
    },
    select: { startTime: true },
  });
  const counts = new Map<string, number>();
  for (const b of booked) {
    const d = localDateOf(b.startTime.getTime(), timezone);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n >= ctx.type.maxPerDay!).map(([d]) => d));
}

/** Bookable start times. Only times; never anything about existing events. */
export async function getPublicSlots(handle: string, slug: string, input: { from: Date; to: Date; inviteToken?: string | null }, now = new Date()) {
  const ctx = await access(handle, slug, input.inviteToken);
  return slotsFor(ctx, input, now);
}

/**
 * Times a booking can move to, from its manage link. Uses the booking's own
 * meeting type (so private-link bookings can be moved too) and leaves the
 * booking itself out, so neighbouring times it currently blocks are offered.
 */
export async function getRescheduleSlots(token: string, input: { from: Date; to: Date }, now = new Date()) {
  const b = await byManageToken(token);
  if (b.status !== "CONFIRMED" || !b.meetingType || b.startTime <= now) throw errors.validation("This booking can't be changed.");
  const profile = await db.bookingProfile.findUniqueOrThrow({ where: { userId: b.userId }, include: { user: { select: { timezone: true } } } });
  const ctx: AccessContext = { profile, type: b.meetingType, inviteId: null };
  const result = await slotsFor(ctx, input, now, { bookingId: b.id, eventId: b.event?.id ?? null });
  const current = b.startTime.toISOString();
  return { ...result, slots: result.slots.filter((s) => s !== current) };
}

async function slotsFor(ctx: AccessContext, input: { from: Date; to: Date }, now: Date, ignore?: { bookingId: string; eventId: string | null }) {
  const to = new Date(Math.min(input.to.getTime(), input.from.getTime() + 42 * DAY));
  if (to <= input.from) return { hostTimezone: ctx.profile.user.timezone, durationMin: ctx.type.durationMin, slots: [] as string[] };
  const { rules, engineEvents, timezone } = await bookingInputs(ctx, { start: input.from, end: to }, ignore?.eventId ? [ignore.eventId] : []);
  const result = findAvailableSlots({
    range: { start: input.from.getTime(), end: to.getTime() },
    durationMin: ctx.type.durationMin,
    now: now.getTime(),
    timezone,
    events: engineEvents,
    rules,
    options: {
      mode: "booking",
      exhaustive: true,
      bufferBeforeMin: ctx.type.bufferBeforeMin ?? undefined,
      bufferAfterMin: ctx.type.bufferAfterMin ?? undefined,
    },
  });
  const full = await fullDays(ctx, { start: input.from, end: to }, timezone, ignore?.bookingId);
  const slots = result.slots.filter((s) => !full.has(s.date)).map((s) => new Date(s.start).toISOString());
  return { hostTimezone: timezone, durationMin: ctx.type.durationMin, slots };
}

export const bookSchema = z.object({
  start: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(1, "Please enter your name").max(100),
  email: z.email("Please enter a valid email address").max(200),
  message: z.string().trim().max(1000).optional().nullable(),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
  invite: z.string().max(100).optional().nullable(),
});

/**
 * Books a slot. The availability shown on the page is never trusted: inside a
 * transaction holding a per-host advisory lock, the slot is re-validated
 * against the calendar with every rule applied, then the booking and its
 * event are written. The database exclusion constraint is the final guard.
 */
export async function createBooking(handle: string, slug: string, input: z.infer<typeof bookSchema>, meta: { ip?: string | null } = {}, now = new Date()) {
  const ctx = await access(handle, slug, input.invite);
  const userId = ctx.profile.userId;
  const start = new Date(input.start);
  const end = new Date(start.getTime() + ctx.type.durationMin * 60_000);
  const manageToken = randomToken();
  const prefs = await getPreferences(userId);
  const host = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
  const destination =
    (ctx.type.destinationCalendarId && (await db.calendar.findFirst({ where: { id: ctx.type.destinationCalendarId, userId } }))) ||
    (prefs.defaultCalendarId && (await db.calendar.findFirst({ where: { id: prefs.defaultCalendarId, userId } }))) ||
    (await db.calendar.findFirstOrThrow({ where: { userId }, orderBy: [{ isDefault: "desc" }, { position: "asc" }] }));
  const meetingUrl = ctx.type.locationType === "VIDEO_LINK" ? (ctx.type.locationValue ?? prefs.defaultVideoLink ?? null) : null;
  const location = ctx.type.locationType === "IN_PERSON" || ctx.type.locationType === "PHONE" ? ctx.type.locationValue : null;

  let bookingId: string;
  try {
    bookingId = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${userId}`}))`;
        await assertBookable(ctx, start, end, now);
        const booking = await tx.booking.create({
          data: {
            userId,
            meetingTypeId: ctx.type.id,
            startTime: start,
            endTime: end,
            title: ctx.type.title,
            inviteeName: input.name,
            inviteeEmail: input.email.toLowerCase(),
            inviteeTimezone: input.timezone,
            message: input.message || null,
            locationType: ctx.type.locationType,
            locationValue: location ?? (meetingUrl ? meetingUrl : null),
            meetingUrl,
            manageTokenHash: hashToken(manageToken),
          },
        });
        await tx.calendarEvent.create({
          data: {
            userId,
            calendarId: destination.id,
            iCalUid: `${randomUUID()}@vele`,
            title: `${ctx.type.title} with ${input.name}`,
            description: input.message || null,
            location,
            meetingUrl,
            meetingProvider: classifyMeetingUrl(meetingUrl),
            startTime: start,
            endTime: end,
            timezone: prefs.timezone,
            source: "BOOKING",
            bookingId: booking.id,
            attendees: { create: [{ userId, email: input.email.toLowerCase(), name: input.name }] },
          },
        });
        if (ctx.inviteId) {
          await tx.bookingInvite.update({ where: { id: ctx.inviteId }, data: { usedAt: new Date() } });
        }
        return booking.id;
      },
      { timeout: 20_000 },
    );
  } catch (err) {
    if (isOverlapViolation(err) || isSerializationFailure(err)) throw errors.slotUnavailable();
    throw err;
  }

  await rememberContacts(userId, [{ email: input.email, name: input.name }], "BOOKING", start);
  const emails = await sendBookingConfirmations(bookingId, manageToken);
  await audit({ userId, actorType: "public", action: "booking.create", targetType: "booking", targetId: bookingId, ip: meta.ip, metadata: { meetingType: ctx.type.slug } });
  return {
    bookingId,
    start: start.toISOString(),
    end: end.toISOString(),
    title: ctx.type.title,
    hostName: ctx.profile.displayName,
    hostEmailStatus: emails.host,
    confirmationEmail: emails.invitee,
    manageUrl: appUrl(`/booking/${manageToken}`),
    meetingUrl,
    location,
    hostTimezone: prefs.timezone,
    hostEmail: host.email,
  };
}

async function assertBookable(ctx: AccessContext, start: Date, end: Date, now: Date, ignore?: { bookingId: string; eventId: string | null }) {
  const { rules, engineEvents, timezone } = await bookingInputs(ctx, { start, end }, ignore?.eventId ? [ignore.eventId] : []);
  if (minutesIntoLocalDay(start.getTime(), timezone) % rules.slotIntervalMin !== 0) throw errors.slotUnavailable();
  const check = findAvailableSlots({
    range: { start: start.getTime(), end: end.getTime() },
    durationMin: ctx.type.durationMin,
    now: now.getTime(),
    timezone,
    events: engineEvents,
    rules,
    options: { mode: "booking", maxResults: 1, slotIntervalMin: 5, bufferBeforeMin: ctx.type.bufferBeforeMin ?? undefined, bufferAfterMin: ctx.type.bufferAfterMin ?? undefined },
  });
  if (!check.slots.some((s) => s.start === start.getTime())) throw errors.slotUnavailable();
  const full = await fullDays(ctx, { start, end }, timezone, ignore?.bookingId);
  if (full.has(localDateOf(start.getTime(), timezone))) throw errors.slotUnavailable();
}

function isOverlapViolation(err: unknown): boolean {
  const text = String((err as { message?: string })?.message ?? err);
  return text.includes("bookings_no_overlap") || text.includes("23P01");
}

function isSerializationFailure(err: unknown): boolean {
  const text = String((err as { message?: string; code?: string })?.message ?? err);
  return (err as { code?: string })?.code === "P2034" || text.includes("40001") || text.includes("could not serialize");
}

async function byManageToken(token: string) {
  const b = await db.booking.findUnique({
    where: { manageTokenHash: hashToken(token) },
    include: { user: { select: { name: true, timezone: true } }, meetingType: true, event: { select: { id: true } } },
  });
  if (!b) throw errors.notFound("This booking");
  return b;
}

export async function getManagedBooking(token: string, now = new Date()) {
  const b = await byManageToken(token);
  const profile = await db.bookingProfile.findUnique({ where: { userId: b.userId }, select: { handle: true } });
  return {
    title: b.title,
    status: b.status,
    start: b.startTime.toISOString(),
    end: b.endTime.toISOString(),
    hostName: b.user.name,
    hostTimezone: b.user.timezone,
    inviteeName: b.inviteeName,
    inviteeTimezone: b.inviteeTimezone,
    meetingUrl: b.status === "CONFIRMED" ? b.meetingUrl : null,
    location: b.status === "CONFIRMED" && b.locationType !== "VIDEO_LINK" ? b.locationValue : null,
    handle: profile?.handle ?? null,
    slug: b.meetingType?.slug ?? null,
    durationMin: Math.round((b.endTime.getTime() - b.startTime.getTime()) / 60_000),
    canChange: b.status === "CONFIRMED" && b.startTime > now,
    canReschedule: b.status === "CONFIRMED" && b.startTime > now && b.meetingType != null,
  };
}

export async function cancelBookingAsInvitee(token: string, reason: string | null, meta: { ip?: string | null } = {}, now = new Date()) {
  const b = await byManageToken(token);
  if (b.status !== "CONFIRMED") throw errors.validation("This booking is already cancelled.");
  if (b.startTime <= now) throw errors.validation("This meeting has already started.");
  await db.$transaction([
    db.booking.update({ where: { id: b.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "invitee", cancelReason: reason } }),
    db.calendarEvent.deleteMany({ where: { bookingId: b.id } }),
  ]);
  const email = await sendBookingCancellation(b.id, "invitee", reason);
  await audit({ userId: b.userId, actorType: "public", action: "booking.cancel", targetType: "booking", targetId: b.id, ip: meta.ip, metadata: { by: "invitee" } });
  return { emailStatus: email };
}

export async function rescheduleBookingAsInvitee(token: string, newStartIso: string, meta: { ip?: string | null } = {}, now = new Date()) {
  const b = await byManageToken(token);
  if (b.status !== "CONFIRMED" || !b.meetingType) throw errors.validation("This booking can't be changed.");
  if (b.startTime <= now) throw errors.validation("This meeting has already started.");
  const profile = await db.bookingProfile.findUniqueOrThrow({ where: { userId: b.userId }, include: { user: { select: { timezone: true } } } });
  const ctx: AccessContext = { profile, type: b.meetingType, inviteId: null };
  const start = new Date(newStartIso);
  if (Number.isNaN(start.getTime())) throw errors.validation("Choose a valid time.");
  const end = new Date(start.getTime() + b.meetingType.durationMin * 60_000);
  const previous = { start: b.startTime, end: b.endTime };
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${b.userId}`}))`;
        await assertBookable(ctx, start, end, now, { bookingId: b.id, eventId: b.event?.id ?? null });
        await tx.booking.update({ where: { id: b.id }, data: { startTime: start, endTime: end } });
        await tx.calendarEvent.updateMany({ where: { bookingId: b.id }, data: { startTime: start, endTime: end, sequence: { increment: 1 } } });
      },
      { timeout: 20_000 },
    );
  } catch (err) {
    if (isOverlapViolation(err) || isSerializationFailure(err)) throw errors.slotUnavailable();
    throw err;
  }
  const email = await sendBookingRescheduled(b.id, previous, true, token);
  await audit({ userId: b.userId, actorType: "public", action: "booking.reschedule", targetType: "booking", targetId: b.id, ip: meta.ip });
  return { start: start.toISOString(), end: end.toISOString(), emailStatus: email };
}

/** Owner-facing booking link for the assistant: the page URL or a specific type. */
export async function bookingLinkFor(userId: string, input: { durationMin?: number | null; slug?: string | null; private?: boolean; singleUse?: boolean }) {
  const profile = await profileFor(userId);
  const types = await db.meetingType.findMany({ where: { userId, isActive: true }, orderBy: { position: "asc" } });
  const type = (input.slug && types.find((t) => t.slug === input.slug)) || (input.durationMin && types.find((t) => t.durationMin === input.durationMin)) || null;
  if (input.private) {
    if (!type) throw errors.validation("Pick a meeting type for a private link.");
    return createPrivateLink(userId, { meetingTypeId: type.id, singleUse: input.singleUse ?? true });
  }
  if (type) {
    if (type.visibility === "PRIVATE") return createPrivateLink(userId, { meetingTypeId: type.id, singleUse: input.singleUse ?? false });
    return { url: typeUrl(profile.handle, type.slug), singleUse: false, meetingType: type.title };
  }
  return { url: appUrl(`/book/${profile.handle}`), singleUse: false, meetingType: null };
}
