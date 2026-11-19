import "server-only";
import { DateTime } from "luxon";
import { z } from "zod";
import type { Channel } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { repeatRule, type RepeatPreset } from "@/lib/repeat";
import { describeWorkingHours, localDateTimeToInstant, parseDuration, resolveTimeExpression, type IsoWeekday, type ResolvedTime } from "@/scheduling";
import { db } from "../db";
import { checkWindowForUser, conflictsForUser, findSlotsForUser, insightsForUser, scheduleOverview } from "../services/availability";
import { bookingLinkFor, getBookingSettings } from "../services/bookings";
import { findContacts, isEmail } from "../services/contacts";
import { cancelEvent, getEvent, listCalendars, searchEvents, type EventDTO } from "../services/events";
import { listMemory, rememberPreference, type PreferenceRule } from "../services/memory";
import type { PreferencesDTO } from "../services/preferences";
import { createPendingAction, declinePendingAction, executePendingAction, isAffirmative, latestPendingAction, type ActionSummary, type PendingActionDTO } from "./actions";
import { fmtDay, fmtLongDay, fmtRange, fmtWhen, minutesBetween } from "./format";
import type { ToolSpec } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Context shared by every tool call in one assistant turn
// ─────────────────────────────────────────────────────────────────────────────

/** Option letters for one turn; also the ceiling on how many can be pencilled. */
const PROPOSAL_LABELS = "ABCDEFGHIJKL";

export interface TurnUI {
  trace: Array<{ tool: string; summary: string; ok: boolean; ms: number }>;
  proposals: Array<{ start: string; end: string; label: string; status: string; notes: string[] }>;
  actions: PendingActionDTO[];
  created: Array<{ id: string; title: string; start: string; end: string; undoable: boolean }>;
  changed: boolean;
}

export interface ToolContext {
  userId: string;
  conversationId: string | null;
  channel: Channel;
  timezone: string;
  now: Date;
  /** The user's message for this turn and recent ones (for email provenance and confirmations). */
  latestUserText: string;
  latestUserAt: Date;
  recentUserTexts: string[];
  prefs: PreferencesDTO;
  ui: TurnUI;
}

export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared argument fragments and time resolution
// ─────────────────────────────────────────────────────────────────────────────

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const TIME = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "HH:mm");
const WEEKDAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const whenFields = {
  when: z
    .string()
    .max(120)
    .optional()
    .describe(
      "The user's time phrase, verbatim or lightly cleaned, e.g. 'tomorrow afternoon', 'next Friday', 'from 1-3 this saturday', 'between 2 and 5 on Thursday'. Resolved deterministically in the user's time zone.",
    ),
  date: DATE.optional().describe("Explicit local date (YYYY-MM-DD), when already known."),
  start_time: TIME.optional().describe("Explicit local start time, 24h HH:mm."),
  end_time: TIME.optional().describe("Explicit local end time, 24h HH:mm."),
};

function pad2(t: string) {
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

function resolveCtx(ctx: ToolContext) {
  const today = DateTime.fromJSDate(ctx.now, { zone: ctx.timezone }).weekday as IsoWeekday;
  const wh = ctx.prefs.workingHours.find((w) => w.day === today) ?? ctx.prefs.workingHours[0];
  return {
    now: ctx.now.getTime(),
    timezone: ctx.timezone,
    workingHours: wh ? { start: wh.start, end: wh.end } : undefined,
    lunch: ctx.prefs.lunch,
  };
}

interface ResolvedWindow {
  start: Date;
  end: Date;
  dates: string[];
  exact: boolean;
  timeWindow: { start: string; end: string } | null;
  interpreted: string;
  assumptions: string[];
}

/** Turns explicit fields or a natural phrase into a concrete window. */
function resolveWindow(ctx: ToolContext, args: { when?: string; date?: string; start_time?: string; end_time?: string }, durationMin?: number): ResolvedWindow {
  const zone = ctx.timezone;
  if (args.date) {
    if (args.start_time) {
      const start = new Date(localDateTimeToInstant(args.date, pad2(args.start_time), zone));
      const end = args.end_time
        ? new Date(localDateTimeToInstant(args.date, pad2(args.end_time), zone))
        : new Date(start.getTime() + (durationMin ?? ctx.prefs.defaultDurationMin) * 60_000);
      if (end <= start) throw new ToolError("invalid_time", "The end time must be after the start time.");
      return { start, end, dates: [args.date], exact: true, timeWindow: null, interpreted: fmtWhen(start, end, zone), assumptions: [] };
    }
    const start = new Date(localDateTimeToInstant(args.date, "00:00", zone));
    const end = new Date(localDateTimeToInstant(args.date, "24:00", zone));
    return { start, end, dates: [args.date], exact: false, timeWindow: null, interpreted: fmtLongDay(start, zone), assumptions: [] };
  }
  if (!args.when) throw new ToolError("missing_time", "No date or time was given.", "Ask the user when, or pass `when` with their phrase.");
  const r: ResolvedTime = resolveTimeExpression(args.when, resolveCtx(ctx));
  if (!r.matched) throw new ToolError("unrecognised_time", `Couldn't understand the time "${args.when}".`, "Ask the user to rephrase, or pass an explicit date and time.");
  if (r.exactTime) {
    const start = new Date(r.start);
    const end = new Date(r.start + (durationMin ?? ctx.prefs.defaultDurationMin) * 60_000);
    const assumptions = durationMin ? r.assumptions : [...r.assumptions, `No length given; assumed ${ctx.prefs.defaultDurationMin} minutes`];
    return { start, end, dates: r.dates, exact: true, timeWindow: null, interpreted: fmtWhen(start, end, zone), assumptions };
  }
  return {
    start: new Date(r.start),
    end: new Date(r.end),
    dates: r.dates,
    exact: false,
    timeWindow: r.timeWindow,
    interpreted: r.label,
    assumptions: r.assumptions,
  };
}

function eventLine(e: EventDTO, zone: string, withAttendees = false) {
  return {
    event_id: e.id,
    date: fmtDay(e.start, zone),
    time: e.isAllDay ? "all day" : fmtRange(e.start, e.end, zone),
    title: e.isPrivate ? `${e.title} (private)` : e.title,
    calendar: e.calendarName,
    ...(e.kind !== "EVENT" ? { kind: e.kind.toLowerCase().replace("_", " ") } : {}),
    ...(e.meetingUrl ? { online: e.meetingProvider === "NONE" ? "video link" : e.meetingProvider.toLowerCase().replace("_", " ") } : {}),
    ...(e.location ? { location: e.location.slice(0, 80) } : {}),
    ...(e.attendees.length ? (withAttendees ? { attendees: e.attendees.map((a) => a.name ?? a.email) } : { attendee_count: e.attendees.length }) : {}),
    ...(e.isRecurring ? { repeats: e.recurrenceText ?? true } : {}),
    ...(e.source === "BOOKING" ? { booked_via_link: true } : {}),
  };
}

/** Only addresses the user typed or that Vele already knows. Never guessed ones. */
async function verifyAttendees(ctx: ToolContext, attendees: Array<{ email: string; name?: string }>) {
  const known = new Set(
    (await db.contact.findMany({ where: { userId: ctx.userId, email: { in: attendees.map((a) => a.email.toLowerCase()) } }, select: { email: true } })).map((c) => c.email),
  );
  const typed = ctx.recentUserTexts.join(" \n ").toLowerCase();
  for (const a of attendees) {
    const email = a.email.trim().toLowerCase();
    if (!isEmail(email)) throw new ToolError("invalid_email", `"${a.email}" isn't a valid email address.`, "Ask the user for the correct address.");
    if (!known.has(email) && !typed.includes(email)) {
      throw new ToolError(
        "email_not_provided",
        `The address ${email} was not given by the user and is not a known contact.`,
        `Ask the user for ${a.name ?? "the person"}'s email address. Never guess an address.`,
      );
    }
  }
}

async function calendarByName(ctx: ToolContext, name?: string) {
  if (!name) return null;
  const calendars = await listCalendars(ctx.userId);
  const match = calendars.find((c) => c.name.toLowerCase() === name.trim().toLowerCase()) ?? calendars.find((c) => c.name.toLowerCase().includes(name.trim().toLowerCase()));
  if (!match) throw new ToolError("unknown_calendar", `There is no calendar called "${name}". Calendars: ${calendars.map((c) => c.name).join(", ")}.`);
  return match;
}

function recurrenceRule(repeat: RepeatPreset | undefined, startLocal: DateTime, until?: string, count?: number): string[] | null {
  const untilUtc = until ? DateTime.fromISO(until, { zone: startLocal.zone }).endOf("day").toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'") : undefined;
  return repeatRule(repeat, { weekday: startLocal.weekday, day: startLocal.day }, { untilUtc, count });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────────

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
  /** One-line, content-free trace entry for the "show working" panel. */
  trace: (args: z.infer<S>, result: unknown) => string;
}

function tool<S extends z.ZodType>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

const getSchedule = tool({
  name: "get_schedule",
  description:
    "Read the user's calendar for a day or range (at most 14 days): events with times and titles, plus open time within working hours before and after buffers. Use for 'what do I have…', 'what does my afternoon look like', 'how busy am I'.",
  schema: z.object({
    ...whenFields,
    end_date: DATE.optional().describe("Last local date of a range (inclusive), with `date` as the first."),
  }),
  async run(args, ctx) {
    const w = args.end_date && args.date ? null : resolveWindow(ctx, args);
    const start = w?.start ?? new Date(localDateTimeToInstant(args.date!, "00:00", ctx.timezone));
    const end = w?.end ?? new Date(localDateTimeToInstant(args.end_date!, "24:00", ctx.timezone));
    if (end.getTime() - start.getTime() > 15 * 86_400_000) throw new ToolError("range_too_long", "Ask for at most two weeks at a time.");
    const overview = await scheduleOverview(ctx.userId, { start, end }, ctx.now);
    const zone = ctx.timezone;
    return {
      interpreted: w?.interpreted ?? `${fmtDay(start, zone)} – ${fmtDay(new Date(end.getTime() - 1), zone)}`,
      assumptions: w?.assumptions ?? [],
      days: overview.days.map((d) => {
        const events = overview.events.filter((e) => overlapsDate(e, d.date, zone));
        return {
          date: fmtLongDay(new Date(localDateTimeToInstant(d.date, "12:00", zone)), zone),
          working_day: d.isWorkingDay,
          events: events.map((e) => eventLine(e, zone)),
          open_time_in_working_hours: d.openTime.map((f) => fmtRange(f.start, f.end, zone)),
          usable_for_new_meetings_after_buffers: d.openTimeAfterBuffers.map((f) => `${fmtRange(f.start, f.end, zone)} (${f.minutes} min)`),
        };
      }),
    };
  },
  trace: (_a, r) => `Read ${(r as { days: unknown[] }).days.length} day(s) of calendar`,
});

function overlapsDate(e: EventDTO, date: string, zone: string) {
  const dayStart = localDateTimeToInstant(date, "00:00", zone);
  const dayEnd = localDateTimeToInstant(date, "24:00", zone);
  return Date.parse(e.start) < dayEnd && Date.parse(e.end) > dayStart;
}

const checkAvailability = tool({
  name: "check_availability",
  description:
    "Check one specific time window: is it free, what clashes, whether buffers or the user's rules (working hours, lunch, focus, kept-free time) are affected, and which parts of the window are free. Use for 'am I free at 3', 'am I free between 2 and 4 tomorrow', 'can I have lunch at 1'.",
  schema: z.object({
    ...whenFields,
    duration_minutes: z.number().int().min(5).max(720).optional().describe("Length when only a start time is given."),
    purpose: z.enum(["meeting", "personal"]).optional().describe("'personal' for the user's own plans (lunch with family, gym); ignores working hours, lunch and buffers."),
    ignore_event_id: z.string().optional().describe("An event being moved, so it doesn't clash with itself."),
  }),
  async run(args, ctx) {
    const w = resolveWindow(ctx, args, args.duration_minutes);
    const a = await checkWindowForUser(ctx.userId, {
      start: w.start,
      end: w.end,
      purpose: args.purpose,
      ignoreEventIds: args.ignore_event_id ? [args.ignore_event_id] : undefined,
      now: ctx.now,
    });
    const zone = ctx.timezone;
    return {
      window: w.interpreted,
      assumptions: w.assumptions,
      free: a.available,
      free_of_events_ignoring_buffers: a.clearOfEvents,
      clashes: a.conflicts.map((c) => ({ title: c.title ?? "Busy", time: fmtRange(c.start, c.end, zone), tentative: c.tentative })),
      buffer_issues: a.bufferIssues.map(
        (b) => `${b.side === "before" ? "Only" : "Only"} ${b.gapMin} min ${b.side === "before" ? "after" : "before"} “${b.title ?? "another event"}”`,
      ),
      rule_flags: a.flags.map((f) => f.label),
      free_parts_of_window: a.freeWithin.map((f) => `${fmtRange(f.start, f.end, zone)} (${f.minutes} min)`),
    };
  },
  trace: (_a, r) => `Checked a window: ${(r as { free: boolean }).free ? "free" : "not free"}`,
});

const findSlots = tool({
  name: "find_available_slots",
  description:
    "Find free slots of a given length using the scheduling engine (working hours, buffers, lunch, focus/kept-free time, meeting limits). Returns a spread of options, each with factual notes (e.g. 'No adjacent meetings', 'Immediately follows another meeting', 'Outside your configured working hours'), free windows, and what was excluded. Present options with their notes; never call one 'best'.",
  schema: z.object({
    ...whenFields,
    end_date: DATE.optional().describe("Last local date of the search (inclusive) when using `date`."),
    duration_minutes: z.number().int().min(5).max(600),
    earliest_time: TIME.optional().describe("Only slots starting at or after this local time each day."),
    latest_time: TIME.optional().describe("Only slots ending by this local time each day."),
    days_of_week: z.array(z.enum(WEEKDAY_NAMES)).optional(),
    purpose: z.enum(["meeting", "personal"]).optional().describe("'personal' for the user's own plans; 'meeting' (default) for time with others."),
    include_outside_working_hours: z.boolean().optional().describe("Also offer (flagged) times outside working hours."),
    max_results: z.number().int().min(1).max(12).optional(),
    ignore_event_id: z.string().optional().describe("The event being moved, when looking for a new time for it."),
  }),
  async run(args, ctx) {
    let start: Date;
    let end: Date;
    let interpreted: string;
    let assumptions: string[] = [];
    let timeOfDay: { start: string; end: string } | null = null;
    if (args.date && args.end_date) {
      start = new Date(localDateTimeToInstant(args.date, "00:00", ctx.timezone));
      end = new Date(localDateTimeToInstant(args.end_date, "24:00", ctx.timezone));
      interpreted = `${fmtDay(start, ctx.timezone)} – ${fmtDay(new Date(end.getTime() - 1), ctx.timezone)}`;
    } else {
      const w = resolveWindow(ctx, args.when || args.date ? args : { when: "next 7 days" }, undefined);
      start = w.start;
      end = w.exact ? w.end : w.end;
      interpreted = w.interpreted;
      assumptions = w.assumptions;
      timeOfDay = w.timeWindow;
      if (w.exact) {
        // A point in time: search that day around it.
        timeOfDay = { start: DateTime.fromJSDate(w.start, { zone: ctx.timezone }).toFormat("HH:mm"), end: "23:59" };
        end = new Date(localDateTimeToInstant(w.dates[0], "24:00", ctx.timezone));
        start = new Date(localDateTimeToInstant(w.dates[0], "00:00", ctx.timezone));
      }
    }
    if (args.earliest_time || args.latest_time) {
      timeOfDay = { start: pad2(args.earliest_time ?? timeOfDay?.start ?? "00:00"), end: pad2(args.latest_time ?? timeOfDay?.end ?? "24:00") };
    }
    if (end.getTime() - start.getTime() > 31 * 86_400_000) throw new ToolError("range_too_long", "Search at most a month at a time.");
    const res = await findSlotsForUser(ctx.userId, {
      range: { start, end },
      durationMin: args.duration_minutes,
      purpose: args.purpose,
      timeOfDay,
      daysOfWeek: args.days_of_week?.map((d) => (WEEKDAY_NAMES.indexOf(d) + 1) as IsoWeekday),
      includeFlagged: args.include_outside_working_hours,
      maxResults: args.max_results ?? 6,
      ignoreEventIds: args.ignore_event_id ? [args.ignore_event_id] : undefined,
      now: ctx.now,
    });
    const zone = ctx.timezone;
    const newProposals: TurnUI["proposals"] = [];
    // Labels continue across every search in the turn, so a second search
    // (e.g. "this week" is only today, then the days after) adds options
    // instead of replacing the ones already pencilled on the calendar.
    const offered = res.slots.flatMap((s) => {
      const startIso = new Date(s.start).toISOString();
      const already = ctx.ui.proposals.find((p) => p.start === startIso);
      if (already) return [{ slot: s, label: already.label, isNew: false }];
      if (ctx.ui.proposals.length + newProposals.length >= PROPOSAL_LABELS.length) return [];
      const label = PROPOSAL_LABELS[ctx.ui.proposals.length + newProposals.length];
      newProposals.push({ start: startIso, end: new Date(s.end).toISOString(), label, status: s.status, notes: s.reasons.map((r) => r.label) });
      return [{ slot: s, label, isNew: true }];
    });
    ctx.ui.proposals = [...ctx.ui.proposals, ...newProposals];
    const slots = offered.map(({ slot: s, label }) => ({
      option: label,
      date: fmtDay(s.start, zone),
      time: fmtRange(s.start, s.end, zone),
      status: s.status === "flagged" ? "breaks one of your rules" : "available",
      notes: s.reasons.filter((r) => r.effect !== "neutral" || offered.length < 4).map((r) => r.label),
    }));
    const dropped = res.slots.length - offered.length;
    return {
      searched: interpreted,
      assumptions,
      duration_minutes: args.duration_minutes,
      options: slots,
      ...(dropped > 0
        ? {
            note_options_capped: `${dropped} further slot(s) were not offered: ${PROPOSAL_LABELS.length} options is the most one turn can show. Only offer the options listed here.`,
          }
        : {}),
      free_windows: res.freeWindows.slice(0, 8).map((f) => `${fmtDay(f.start, zone)} ${fmtRange(f.start, f.end, zone)} (${f.minutes} min)`),
      not_shown: res.excluded.map((e) => e.label),
      rules_applied: res.constraintsApplied,
      ...(slots.length === 0 ? { note: "Nothing fits. Say which rule stops it and offer to search a wider range or include out-of-hours time." } : {}),
    };
  },
  trace: (a, r) => `Scheduling engine: ${(r as { options: unknown[] }).options.length} option(s) for ${a.duration_minutes} min`,
});

const searchCalendar = tool({
  name: "search_events",
  description: "Search events by title, place, notes or attendee name/email. Use for 'find my meetings with Kevin', 'when did I last meet Sarah', 'when is the team meeting'.",
  schema: z.object({
    query: z.string().min(1).max(100),
    when: z.enum(["past", "upcoming", "any"]).optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  async run(args, ctx) {
    const results = await searchEvents(ctx.userId, args.query, { when: args.when, limit: args.limit ?? 10, now: ctx.now });
    return { query: args.query, results: results.map((e) => eventLine(e, ctx.timezone, true)) };
  },
  trace: (_a, r) => `Searched the calendar: ${(r as { results: unknown[] }).results.length} match(es)`,
});

const getEventTool = tool({
  name: "get_event",
  description: "Full details of one event: time, calendar, location, meeting link, attendees with email addresses, notes, repeat rule.",
  schema: z.object({ event_id: z.string() }),
  async run(args, ctx) {
    const e = await getEvent(ctx.userId, args.event_id);
    return {
      ...eventLine(e, ctx.timezone, true),
      when: e.isAllDay ? `${fmtLongDay(e.start, ctx.timezone)} (all day)` : fmtWhen(e.start, e.end, ctx.timezone),
      attendees: e.attendees.map((a) => ({ name: a.name, email: a.email })),
      meeting_link: e.meetingUrl,
      notes: e.description?.slice(0, 1000) ?? null,
      part_of_series: e.isRecurring,
    };
  },
  trace: () => "Read one event",
});

const findContact = tool({
  name: "find_contact",
  description: "Look up a person's email address among people the user has met, invited or been booked by. If there is no match, ask the user for the address; never guess one.",
  schema: z.object({ name: z.string().min(1).max(80) }),
  async run(args, ctx) {
    const matches = await findContacts(ctx.userId, args.name, 5);
    return {
      matches: matches.map((m) => ({ name: m.name, email: m.email, last_met: m.lastMetAt ? fmtDay(m.lastMetAt, ctx.timezone) : null })),
      ...(matches.length === 0 ? { note: `No known contact matches "${args.name}". Ask the user for their email address.` } : {}),
      ...(matches.length > 1 ? { note: "More than one match: ask which person the user means." } : {}),
    };
  },
  trace: (_a, r) => `Looked up contacts: ${(r as { matches: unknown[] }).matches.length} match(es)`,
});

const attendeeSchema = z.object({ email: z.string().max(200), name: z.string().max(100).optional() });

const createEventTool = tool({
  name: "create_event",
  description:
    "Add an event to the user's calendar. Needs a concrete start and end (from `when`, or `date` + `start_time` + `end_time`/`duration_minutes`). Personal events without guests and without clashes are created straight away (the user can undo). Events with guests, clashes or a repeat are pencilled in and need the user's confirmation. Guests receive an emailed invitation.",
  schema: z.object({
    title: z.string().min(1).max(200).describe("Short title, e.g. 'Lunch with Mom', 'Meeting with Sarah'."),
    ...whenFields,
    duration_minutes: z.number().int().min(5).max(1440).optional(),
    all_day: z.boolean().optional(),
    calendar: z.string().optional().describe("Calendar name, e.g. 'Work' or 'Personal'. Personal plans go in Personal."),
    attendees: z.array(attendeeSchema).max(30).optional().describe("Only addresses the user gave or that find_contact returned."),
    location: z.string().max(300).optional(),
    description: z.string().max(2000).optional(),
    meeting_link: z.string().max(500).optional().describe("A Teams/Meet/Zoom link the user provided."),
    use_my_meeting_link: z.boolean().optional().describe("Attach the user's saved meeting room link (when they ask for a Teams/video meeting)."),
    repeat: z.enum(["none", "daily", "weekdays", "weekly", "fortnightly", "monthly"]).optional(),
    repeat_until: DATE.optional(),
    repeat_count: z.number().int().min(1).max(200).optional(),
    kind: z.enum(["event", "focus", "blocked"]).optional().describe("'focus' for focus time, 'blocked' for time the user is unavailable."),
    private: z.boolean().optional(),
  }),
  async run(args, ctx) {
    const zone = ctx.timezone;
    const w = args.all_day ? resolveWindow(ctx, args.date ? { date: args.date } : { when: args.when ?? "today" }) : resolveWindow(ctx, args, args.duration_minutes);
    if (!args.all_day && !w.exact && !w.timeWindow) {
      throw new ToolError("need_time", `I know the day (${w.interpreted}) but not the time.`, "Ask the user what time, or offer free slots with find_available_slots.");
    }
    const start = w.start;
    const end = !w.exact && w.timeWindow && args.duration_minutes ? new Date(w.start.getTime() + args.duration_minutes * 60_000) : w.end;
    if (start.getTime() < ctx.now.getTime() - 5 * 60_000 && !args.all_day) {
      throw new ToolError("in_the_past", `${fmtWhen(start, end, zone)} is in the past.`, "Check the date with the user.");
    }
    const calendar = (await calendarByName(ctx, args.calendar)) ?? null;
    const attendees = (args.attendees ?? []).map((a) => ({ email: a.email.trim().toLowerCase(), name: a.name?.trim() || undefined }));
    if (attendees.length) await verifyAttendees(ctx, attendees);
    let meetingUrl: string | null = null;
    if (args.meeting_link) {
      if (!/^https:\/\//i.test(args.meeting_link)) throw new ToolError("invalid_link", "Meeting links must start with https://");
      meetingUrl = args.meeting_link;
    } else if (args.use_my_meeting_link) {
      if (!ctx.prefs.defaultVideoLink) {
        throw new ToolError(
          "no_saved_link",
          "The user has no saved meeting link.",
          "Ask them to paste their Teams/Meet/Zoom room link (you can save it with remember_preference type 'video_link').",
        );
      }
      meetingUrl = ctx.prefs.defaultVideoLink;
    }
    const startLocal = DateTime.fromJSDate(start, { zone });
    const recurrence = recurrenceRule(args.repeat, startLocal, args.repeat_until, args.repeat_count);
    const personal = calendar ? calendar.isPersonal : false;
    const check = await checkWindowForUser(ctx.userId, {
      start,
      end,
      purpose: personal || args.kind === "blocked" || args.kind === "focus" ? "personal" : "meeting",
      now: ctx.now,
    });
    const clashes = check.conflicts.map((c) => `Overlaps “${c.title ?? "another event"}” (${fmtRange(c.start, c.end, zone)})`);
    const kind: "FOCUS" | "BLOCKED" | "EVENT" = args.kind === "focus" ? "FOCUS" : args.kind === "blocked" ? "BLOCKED" : "EVENT";

    const fields = {
      title: args.title.trim(),
      calendarId: calendar?.id ?? null,
      start: start.toISOString(),
      end: end.toISOString(),
      timezone: zone,
      isAllDay: Boolean(args.all_day),
      location: args.location ?? null,
      description: args.description ?? null,
      meetingUrl,
      attendees,
      recurrence,
      kind,
      showAs: args.all_day ? ("FREE" as const) : ("BUSY" as const),
      isPrivate: Boolean(args.private),
      sendInvitations: true,
    };
    const whenText = args.all_day ? `${fmtLongDay(start, zone)} (all day)` : fmtWhen(start, end, zone);
    const needsConfirmation = attendees.length > 0 || clashes.length > 0 || Boolean(recurrence);

    if (!needsConfirmation) {
      const { createEvent } = await import("../services/events");
      const res = await createEvent(ctx.userId, { ...fields, start, end, source: "ASSISTANT" }, "assistant");
      ctx.ui.changed = true;
      ctx.ui.created.push({ id: res.event.id, title: res.event.title, start: res.event.start, end: res.event.end, undoable: true });
      return {
        status: "created",
        event: { event_id: res.event.id, title: res.event.title, when: whenText, calendar: res.event.calendarName },
        assumptions: w.assumptions,
        rule_flags: check.flags.map((f) => f.label),
        note: "Tell the user it's added and mention any assumptions. They can undo it.",
      };
    }

    const summary: ActionSummary = {
      heading: "Add to calendar",
      title: fields.title,
      when: whenText,
      calendar: calendar?.name ?? null,
      attendees: attendees.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)),
      notes: [
        ...(attendees.length ? [`${attendees.length === 1 ? "An invitation" : `${attendees.length} invitations`} will be emailed`] : []),
        ...(recurrence ? [`Repeats: ${args.repeat}${args.repeat_count ? `, ${args.repeat_count} times` : args.repeat_until ? ` until ${args.repeat_until}` : ""}`] : []),
        ...(meetingUrl ? ["Includes your meeting link"] : []),
        ...w.assumptions,
      ],
      warnings: [...clashes, ...check.flags.map((f) => f.label)],
    };
    const action = await createPendingAction(ctx.userId, ctx.conversationId, { kind: "create_event", fields }, summary);
    ctx.ui.actions.push(action);
    return {
      status: "needs_confirmation",
      action_id: action.id,
      readback: summary,
      note: "Nothing is booked yet. Read back the details (and any warnings) and ask the user to confirm.",
    };
  },
  trace: (a, r) => `${(r as { status: string }).status === "created" ? "Created" : "Pencilled in"} “${a.title}”`,
});

const updateEventTool = tool({
  name: "update_event",
  description:
    "Change an event: move it (new `when` or date/start_time/end_time), rename it, change calendar/location/link, or add/remove guests. Moves and changes involving guests or bookings are pencilled in and need confirmation; simple renames of personal events apply straight away. For a repeating event pass scope 'this' (just this occurrence) or 'series'.",
  schema: z.object({
    event_id: z.string(),
    title: z.string().min(1).max(200).optional(),
    ...whenFields,
    duration_minutes: z.number().int().min(5).max(1440).optional(),
    calendar: z.string().optional(),
    location: z.string().max(300).optional(),
    description: z.string().max(2000).optional(),
    meeting_link: z.string().max(500).optional(),
    add_attendees: z.array(attendeeSchema).max(30).optional(),
    remove_attendees: z.array(z.string()).max(30).optional().describe("Email addresses to remove."),
    scope: z.enum(["this", "series"]).optional(),
  }),
  async run(args, ctx) {
    const zone = ctx.timezone;
    const current = await getEvent(ctx.userId, args.event_id);
    const moving = Boolean(args.when || args.date || args.start_time || args.end_time || args.duration_minutes);
    let start: Date | undefined;
    let end: Date | undefined;
    let assumptions: string[] = [];
    if (moving) {
      const currentLen = minutesBetween(current.start, current.end);
      if (args.when || args.date) {
        const dateArgs = args.date && !args.start_time ? { date: args.date, start_time: DateTime.fromISO(current.start, { zone }).toFormat("HH:mm") } : args;
        const w = resolveWindow(ctx, dateArgs, args.duration_minutes ?? currentLen);
        if (!w.exact && !w.timeWindow) {
          // A day only (e.g. "move it to next week"): keep the time of day.
          const time = DateTime.fromISO(current.start, { zone }).toFormat("HH:mm");
          start = new Date(localDateTimeToInstant(w.dates[0], time, zone));
          end = new Date(start.getTime() + (args.duration_minutes ?? currentLen) * 60_000);
          assumptions = [...w.assumptions, `Kept the original time (${time}) on ${fmtDay(start, zone)}`];
        } else {
          start = w.start;
          end = !w.exact && w.timeWindow ? new Date(w.start.getTime() + (args.duration_minutes ?? currentLen) * 60_000) : w.end;
          assumptions = w.assumptions;
        }
      } else if (args.start_time || args.end_time || args.duration_minutes) {
        const day = DateTime.fromISO(current.start, { zone }).toISODate()!;
        start = args.start_time ? new Date(localDateTimeToInstant(day, pad2(args.start_time), zone)) : new Date(current.start);
        end = args.end_time ? new Date(localDateTimeToInstant(day, pad2(args.end_time), zone)) : new Date(start.getTime() + (args.duration_minutes ?? currentLen) * 60_000);
      }
    }
    const calendar = await calendarByName(ctx, args.calendar);
    const added = (args.add_attendees ?? []).map((a) => ({ email: a.email.trim().toLowerCase(), name: a.name?.trim() || undefined }));
    if (added.length) await verifyAttendees(ctx, added);
    const removed = new Set((args.remove_attendees ?? []).map((e) => e.trim().toLowerCase()));
    const attendeesChanged = added.length > 0 || removed.size > 0;
    const attendees = attendeesChanged
      ? [...current.attendees.filter((a) => a.email && !removed.has(a.email.toLowerCase())).map((a) => ({ email: a.email!, name: a.name ?? undefined })), ...added]
      : undefined;
    if (args.meeting_link && !/^https:\/\//i.test(args.meeting_link)) throw new ToolError("invalid_link", "Meeting links must start with https://");

    const changes = {
      ...(args.title ? { title: args.title } : {}),
      ...(start ? { start: start.toISOString() } : {}),
      ...(end ? { end: end.toISOString() } : {}),
      ...(calendar ? { calendarId: calendar.id } : {}),
      ...(args.location !== undefined ? { location: args.location } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.meeting_link !== undefined ? { meetingUrl: args.meeting_link } : {}),
      ...(attendees ? { attendees } : {}),
    };
    if (Object.keys(changes).length === 0) throw new ToolError("no_changes", "No changes were given.");
    const scope = args.scope === "series" ? "series" : "occurrence";
    const hasGuests = current.attendees.length > 0 || Boolean(attendees?.length);
    const needsConfirmation = moving || hasGuests || Boolean(current.bookingId) || attendeesChanged;
    const clashes: string[] = [];
    if (start && end) {
      const check = await checkWindowForUser(ctx.userId, { start, end, purpose: current.calendarIsPersonal ? "personal" : "meeting", ignoreEventIds: [current.id], now: ctx.now });
      clashes.push(...check.conflicts.map((c) => `Overlaps “${c.title ?? "another event"}” (${fmtRange(c.start, c.end, zone)})`), ...check.flags.map((f) => f.label));
    }

    if (!needsConfirmation) {
      const { updateEvent } = await import("../services/events");
      const res = await updateEvent(ctx.userId, args.event_id, { ...changes, start, end }, "assistant", { scope, notify: false });
      ctx.ui.changed = true;
      return { status: "updated", event: eventLine(res.event, zone) };
    }
    const summary: ActionSummary = {
      heading: moving ? "Move event" : "Update event",
      title: args.title ?? current.title,
      when: start && end ? fmtWhen(start, end, zone) : fmtWhen(current.start, current.end, zone),
      calendar: calendar?.name ?? current.calendarName,
      attendees: (attendees ?? current.attendees).map((a) => (a.name ? `${a.name} <${a.email}>` : (a.email ?? ""))),
      notes: [
        ...(moving ? [`Was ${fmtWhen(current.start, current.end, zone)}`] : []),
        ...(hasGuests ? ["Guests will be emailed the update"] : []),
        ...(current.bookingId ? ["Booked through your link: the person who booked will be told"] : []),
        ...(current.isRecurring ? [scope === "series" ? "Applies to the whole series" : "Applies to this occurrence only"] : []),
        ...assumptions,
      ],
      warnings: clashes,
    };
    const action = await createPendingAction(ctx.userId, ctx.conversationId, { kind: "update_event", id: args.event_id, changes, scope, notify: true }, summary);
    ctx.ui.actions.push(action);
    return { status: "needs_confirmation", action_id: action.id, readback: summary, note: "Nothing has changed yet. Read back the change and ask the user to confirm." };
  },
  trace: (_a, r) => ((r as { status: string }).status === "updated" ? "Updated an event" : "Pencilled in a change"),
});

const cancelEventTool = tool({
  name: "cancel_event",
  description: "Cancel (delete) an event. Always pencilled in first and needs the user's confirmation. Guests are emailed a cancellation unless notify_attendees is false.",
  schema: z.object({
    event_id: z.string(),
    scope: z.enum(["this", "series"]).optional(),
    reason: z.string().max(300).optional(),
    notify_attendees: z.boolean().optional(),
  }),
  async run(args, ctx) {
    const e = await getEvent(ctx.userId, args.event_id);
    const scope = args.scope === "series" ? "series" : "occurrence";
    const notify = args.notify_attendees ?? true;
    const summary: ActionSummary = {
      heading: "Cancel event",
      title: e.title,
      when: e.isAllDay ? `${fmtLongDay(e.start, ctx.timezone)} (all day)` : fmtWhen(e.start, e.end, ctx.timezone),
      calendar: e.calendarName,
      attendees: e.attendees.map((a) => (a.name ? `${a.name} <${a.email}>` : (a.email ?? ""))),
      notes: [
        ...(e.attendees.length && notify ? [`${e.attendees.length} ${e.attendees.length === 1 ? "person" : "people"} will be emailed a cancellation`] : []),
        ...(e.bookingId ? ["Booked through your link: the person who booked will be told"] : []),
        ...(e.isRecurring ? [scope === "series" ? "Cancels the whole series" : "Cancels this occurrence only"] : []),
      ],
      warnings: [],
    };
    const action = await createPendingAction(ctx.userId, ctx.conversationId, { kind: "cancel_event", id: args.event_id, scope, notify, reason: args.reason ?? null }, summary);
    ctx.ui.actions.push(action);
    return {
      status: "needs_confirmation",
      action_id: action.id,
      readback: summary,
      note: `Ask e.g. "This will cancel '${e.title}'${e.attendees.length ? ` for ${e.attendees.length} ${e.attendees.length === 1 ? "person" : "people"}` : ""}. Do you want me to continue?"`,
    };
  },
  trace: () => "Pencilled in a cancellation",
});

const undoCreation = tool({
  name: "undo_event_creation",
  description: "Remove an event you just created in this conversation without guests (the user said 'undo' or 'remove that'). No confirmation needed.",
  schema: z.object({ event_id: z.string() }),
  async run(args, ctx) {
    const e = await getEvent(ctx.userId, args.event_id);
    const recent = await db.calendarEvent.findFirst({
      where: { id: e.eventId, userId: ctx.userId, source: "ASSISTANT", createdAt: { gt: new Date(ctx.now.getTime() - 60 * 60_000) } },
      include: { attendees: true },
    });
    if (!recent || recent.attendees.length)
      throw new ToolError("not_undoable", "Only events created in the last hour without guests can be undone directly.", "Use cancel_event instead.");
    await cancelEvent(ctx.userId, e.eventId, "assistant", { notify: false, scope: "series" });
    ctx.ui.changed = true;
    return { status: "removed", title: e.title };
  },
  trace: () => "Undid an event",
});

const confirmAction = tool({
  name: "confirm_pending_action",
  description: "Carry out a pencilled-in change after the user has explicitly said yes in their latest message. If they haven't, ask instead.",
  schema: z.object({ action_id: z.string().optional().describe("Defaults to the most recent pending proposal.") }),
  async run(args, ctx) {
    const pending = args.action_id ? { id: args.action_id } : await latestPendingAction(ctx.userId, ctx.conversationId);
    if (!pending) throw new ToolError("nothing_pending", "There is nothing waiting for confirmation.");
    const action = await db.pendingAction.findFirst({ where: { id: pending.id, userId: ctx.userId } });
    if (!action) throw new ToolError("nothing_pending", "That proposal doesn't exist.");
    if (!isAffirmative(ctx.latestUserText) || ctx.latestUserAt <= action.createdAt) {
      throw new ToolError("not_confirmed", "The user has not explicitly confirmed this in their latest message.", "Read back the proposal and ask them to confirm.");
    }
    const res = await executePendingAction(ctx.userId, action.id, "assistant");
    ctx.ui.changed = true;
    ctx.ui.actions.push(res.action);
    return {
      status: "done",
      result: res.message,
      event_id: res.eventId,
      invitations: res.invitations.map((i) => ({ email: i.email, delivery: i.status })),
      ...(res.invitations.some((i) => i.status === "logged")
        ? { note: "Email delivery is in development mode: invitations were logged, not actually sent. Say so plainly." }
        : res.invitations.some((i) => i.status === "failed")
          ? { note: "Some invitations failed to send. Say which." }
          : {}),
    };
  },
  trace: (_a, r) => `Confirmed: ${(r as { result: string }).result}`,
});

const discardAction = tool({
  name: "discard_pending_action",
  description: "Drop a pencilled-in change the user doesn't want.",
  schema: z.object({ action_id: z.string().optional() }),
  async run(args, ctx) {
    const pending = args.action_id ? { id: args.action_id } : await latestPendingAction(ctx.userId, ctx.conversationId);
    if (!pending) throw new ToolError("nothing_pending", "There is nothing waiting for confirmation.");
    const a = await declinePendingAction(ctx.userId, pending.id);
    ctx.ui.actions.push(a);
    return { status: "discarded" };
  },
  trace: () => "Discarded a proposal",
});

const getPrefs = tool({
  name: "get_preferences",
  description: "The user's scheduling rules (working hours, buffers, lunch, kept-free and focus time, limits), calendars, and things they've asked Vele to remember.",
  schema: z.object({}),
  async run(_args, ctx) {
    const p = ctx.prefs;
    const [calendars, memory] = await Promise.all([listCalendars(ctx.userId), listMemory(ctx.userId)]);
    const days = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return {
      timezone: p.timezone,
      working_hours: describeWorkingHours({ workingHours: p.workingHours } as never),
      buffers: `${p.bufferBeforeMin} min before, ${p.bufferAfterMin} min after meetings`,
      lunch: p.lunch ? `${p.lunch.start}–${p.lunch.end}` : "not set",
      kept_free: p.blocked.map((b) => `${days[b.day]} ${b.start}–${b.end}`),
      focus_time: p.focus.map((b) => `${days[b.day]} ${b.start}–${b.end}`),
      no_meetings_before: p.noMeetingsBefore,
      no_meetings_after: p.noMeetingsAfter,
      max_meetings_per_day: p.maxMeetingsPerDay,
      default_meeting_length: `${p.defaultDurationMin} min`,
      saved_meeting_link: Boolean(p.defaultVideoLink),
      calendars: calendars.map((c) => ({ name: c.name, personal: c.isPersonal, default: c.isDefault, counts_for_availability: c.includeInAvailability })),
      remembered: memory
        .slice(0, 20)
        .map((m) => m.statement)
        .filter(Boolean),
    };
  },
  trace: () => "Read scheduling preferences",
});

const rememberTool = tool({
  name: "remember_preference",
  description:
    "Save how the user likes to work and apply it to their rules. Types: no_meetings_before/no_meetings_after (time), gap_between_meetings (minutes), keep_time_free/focus_time/working_hours (days + start + end), preferred_meeting_hours (start + end), preferred_days (days), max_meetings_per_day (count), lunch (start + end), video_link (url of their Teams/Meet/Zoom room), note (anything else).",
  schema: z.object({
    statement: z.string().min(1).max(300).describe("What the user said, e.g. 'I don't like meetings before 10'."),
    type: z.enum([
      "no_meetings_before",
      "no_meetings_after",
      "gap_between_meetings",
      "keep_time_free",
      "focus_time",
      "preferred_meeting_hours",
      "preferred_days",
      "max_meetings_per_day",
      "working_hours",
      "lunch",
      "video_link",
      "note",
    ]),
    time: TIME.optional(),
    minutes: z.number().int().min(0).max(120).optional(),
    days: z.array(z.enum(WEEKDAY_NAMES)).optional(),
    start: TIME.optional(),
    end: TIME.optional(),
    count: z.number().int().min(1).max(30).optional(),
    url: z.string().max(500).optional(),
  }),
  async run(args, ctx) {
    const days = (args.days ?? []).map((d) => (WEEKDAY_NAMES.indexOf(d) + 1) as IsoWeekday);
    const need = (cond: unknown, what: string) => {
      if (!cond) throw new ToolError("missing_field", `This preference needs ${what}.`);
    };
    let rule: PreferenceRule;
    switch (args.type) {
      case "no_meetings_before":
      case "no_meetings_after":
        need(args.time, "a time");
        rule = { type: args.type, time: pad2(args.time!) };
        break;
      case "gap_between_meetings":
        need(args.minutes != null, "a number of minutes");
        rule = { type: "gap_between_meetings", minutes: args.minutes! };
        break;
      case "keep_time_free":
      case "focus_time":
      case "working_hours":
        need(days.length && args.start && args.end, "days, a start and an end time");
        rule = { type: args.type, days, start: pad2(args.start!), end: pad2(args.end!) };
        break;
      case "preferred_meeting_hours":
      case "lunch":
        need(args.start && args.end, "a start and an end time");
        rule = { type: args.type, start: pad2(args.start!), end: pad2(args.end!) };
        break;
      case "preferred_days":
        need(days.length, "days");
        rule = { type: "preferred_days", days };
        break;
      case "max_meetings_per_day":
        need(args.count, "a count");
        rule = { type: "max_meetings_per_day", count: args.count! };
        break;
      case "video_link":
        need(args.url, "the link");
        rule = { type: "video_link", url: args.url! };
        break;
      default:
        rule = { type: "note" };
    }
    const res = await rememberPreference(ctx.userId, args.statement, rule, "assistant");
    ctx.ui.changed = true;
    return { status: "saved", applied: res.applied };
  },
  trace: (a) => `Saved a preference (${a.type.replace(/_/g, " ")})`,
});

const bookingSettings = tool({
  name: "get_booking_settings",
  description: "The user's booking page and meeting types (links other people use to book time).",
  schema: z.object({}),
  async run(_args, ctx) {
    const s = await getBookingSettings(ctx.userId);
    return {
      booking_page: s.profile.url,
      page_visibility: s.profile.visibility.toLowerCase(),
      meeting_types: s.meetingTypes.map((t) => ({ title: t.title, minutes: t.durationMin, link: t.url, visibility: t.visibility.toLowerCase(), active: t.isActive })),
    };
  },
  trace: () => "Read booking settings",
});

const bookingLink = tool({
  name: "generate_booking_link",
  description: "Get a link someone can use to book time with the user: the booking page, a specific meeting type (by length or slug), or a private single-use link.",
  schema: z.object({
    duration_minutes: z.number().int().min(5).max(480).optional(),
    meeting_type: z.string().max(60).optional().describe("Meeting type slug, e.g. 'quick-chat'."),
    private: z.boolean().optional(),
    single_use: z.boolean().optional(),
  }),
  async run(args, ctx) {
    const res = await bookingLinkFor(ctx.userId, { durationMin: args.duration_minutes, slug: args.meeting_type, private: args.private, singleUse: args.single_use });
    return { link: res.url, meeting_type: res.meetingType, single_use: res.singleUse };
  },
  trace: () => "Made a booking link",
});

const insights = tool({
  name: "get_insights",
  description: "Descriptive statistics for a period: meetings, meeting time, free and focus time, back-to-back runs, fragmented time. Describe; don't judge.",
  schema: z.object({ ...whenFields, end_date: DATE.optional() }),
  async run(args, ctx) {
    const w = args.date && args.end_date ? null : resolveWindow(ctx, args.when || args.date ? args : { when: "this week" });
    const start = w?.start ?? new Date(localDateTimeToInstant(args.date!, "00:00", ctx.timezone));
    const end = w?.end ?? new Date(localDateTimeToInstant(args.end_date!, "24:00", ctx.timezone));
    const i = await insightsForUser(ctx.userId, { start, end });
    return {
      period: w?.interpreted ?? `${fmtDay(start, ctx.timezone)} – ${fmtDay(new Date(end.getTime() - 1), ctx.timezone)}`,
      meetings: i.meetingCount,
      meeting_minutes: i.meetingMinutes,
      free_working_minutes: i.freeMinutes,
      focus_minutes: i.focusMinutes,
      observations: i.observations,
    };
  },
  trace: () => "Computed schedule statistics",
});

const conflicts = tool({
  name: "get_conflicts",
  description:
    "Scheduling problems in a period: overlaps, double bookings across calendars, too little time between meetings, meetings outside working hours or in kept-free time.",
  schema: z.object({ ...whenFields, end_date: DATE.optional() }),
  async run(args, ctx) {
    const w = args.date && args.end_date ? null : resolveWindow(ctx, args.when || args.date ? args : { when: "next week" });
    const start = w?.start ?? new Date(localDateTimeToInstant(args.date!, "00:00", ctx.timezone));
    const end = w?.end ?? new Date(localDateTimeToInstant(args.end_date!, "24:00", ctx.timezone));
    const res = await conflictsForUser(ctx.userId, { start, end });
    return {
      period: w?.interpreted,
      conflicts: res.conflicts.slice(0, 20).map((c) => ({ type: c.type.replace(/_/g, " "), date: fmtDay(c.start, ctx.timezone), message: c.message, event_ids: c.eventIds })),
    };
  },
  trace: (_a, r) => `Checked conflicts: ${(r as { conflicts: unknown[] }).conflicts.length}`,
});

const resolveTime = tool({
  name: "resolve_time",
  description: "Turn a time phrase into exact dates and times in the user's zone, with the assumptions made. Other tools accept `when` directly; use this only to clarify.",
  schema: z.object({ expression: z.string().min(1).max(120) }),
  async run(args, ctx) {
    const r = resolveTimeExpression(args.expression, resolveCtx(ctx));
    const duration = parseDuration(args.expression);
    return {
      understood: r.matched,
      interpreted: r.label,
      dates: r.dates,
      time_window: r.timeWindow,
      exact_time: r.exactTime,
      ...(duration ? { duration_minutes: duration } : {}),
      assumptions: r.assumptions,
    };
  },
  trace: () => "Resolved a time phrase",
});

export const TOOLS = [
  getSchedule,
  checkAvailability,
  findSlots,
  searchCalendar,
  getEventTool,
  findContact,
  createEventTool,
  updateEventTool,
  cancelEventTool,
  undoCreation,
  confirmAction,
  discardAction,
  getPrefs,
  rememberTool,
  bookingSettings,
  bookingLink,
  insights,
  conflicts,
  resolveTime,
] as const;

const BY_NAME = new Map<string, ToolDef<z.ZodType>>(TOOLS.map((t) => [t.name, t as unknown as ToolDef<z.ZodType>]));

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export const TOOL_SPECS: ToolSpec[] = TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: jsonSchema(t.schema as z.ZodType) }));

export interface ToolOutcome {
  ok: boolean;
  result: unknown;
}

/** Validates arguments and runs a tool. Errors come back as data the model can act on. */
export async function runTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const def = BY_NAME.get(name);
  const started = Date.now();
  if (!def) return { ok: false, result: { error: "unknown_tool", message: `There is no tool called ${name}.` } };
  const parsed = def.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; ");
    ctx.ui.trace.push({ tool: name, summary: "Rejected invalid arguments", ok: false, ms: Date.now() - started });
    return { ok: false, result: { error: "invalid_arguments", message } };
  }
  try {
    const result = await def.run(parsed.data, ctx);
    ctx.ui.trace.push({ tool: name, summary: def.trace(parsed.data, result), ok: true, ms: Date.now() - started });
    return { ok: true, result };
  } catch (err) {
    const payload =
      err instanceof ToolError
        ? { error: err.code, message: err.message, ...(err.hint ? { what_to_do: err.hint } : {}) }
        : err instanceof AppError
          ? { error: err.code, message: err.userMessage }
          : { error: "internal", message: "That step failed on the server. Tell the user it didn't work; don't claim success." };
    ctx.ui.trace.push({ tool: name, summary: `Failed: ${(payload as { message: string }).message.slice(0, 80)}`, ok: false, ms: Date.now() - started });
    return { ok: false, result: payload };
  }
}
