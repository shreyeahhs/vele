import "server-only";
import {
  DAY,
  analyzeWindow,
  computeInsights,
  dayOverviews,
  detectConflicts,
  findAvailableSlots,
  localDatesInRange,
  type IsoWeekday,
  type SlotPurpose,
  type SlotSearchResult,
} from "@/scheduling";
import { engineEventsForUser } from "./events";
import { getRules } from "./preferences";

/**
 * The single path from stored data to the scheduling engine. The assistant,
 * the API and the dashboard all call these functions; none of them computes
 * availability on its own.
 */

/** Events are loaded a day either side so buffers and adjacency see neighbours. */
function padded(range: { start: Date; end: Date }) {
  return { start: new Date(range.start.getTime() - DAY), end: new Date(range.end.getTime() + DAY) };
}

export async function findSlotsForUser(
  userId: string,
  input: {
    range: { start: Date; end: Date };
    durationMin: number;
    purpose?: SlotPurpose;
    timeOfDay?: { start: string; end: string } | null;
    daysOfWeek?: IsoWeekday[] | null;
    includeFlagged?: boolean;
    maxResults?: number;
    ignoreEventIds?: string[];
    now?: Date;
  },
): Promise<SlotSearchResult & { timezone: string }> {
  const [{ rules, timezone }, { engineEvents }] = await Promise.all([getRules(userId), engineEventsForUser(userId, padded(input.range))]);
  const result = findAvailableSlots({
    range: { start: input.range.start.getTime(), end: input.range.end.getTime() },
    durationMin: input.durationMin,
    now: (input.now ?? new Date()).getTime(),
    timezone,
    events: engineEvents,
    rules,
    options: {
      mode: "owner",
      purpose: input.purpose ?? "meeting",
      timeOfDay: input.timeOfDay ?? null,
      daysOfWeek: input.daysOfWeek ?? null,
      includeFlagged: input.includeFlagged,
      maxResults: input.maxResults,
      ignoreEventIds: input.ignoreEventIds,
    },
  });
  return { ...result, timezone };
}

export async function checkWindowForUser(userId: string, input: { start: Date; end: Date; purpose?: SlotPurpose; ignoreEventIds?: string[]; now?: Date }) {
  const [{ rules, timezone }, { engineEvents }] = await Promise.all([getRules(userId), engineEventsForUser(userId, padded(input))]);
  const analysis = analyzeWindow({
    window: { start: input.start.getTime(), end: input.end.getTime() },
    now: (input.now ?? new Date()).getTime(),
    timezone,
    events: engineEvents,
    rules,
    purpose: input.purpose ?? "meeting",
    ignoreEventIds: input.ignoreEventIds,
  });
  return { ...analysis, timezone };
}

export async function scheduleOverview(userId: string, range: { start: Date; end: Date }, now = new Date()) {
  const [{ rules, timezone }, data] = await Promise.all([getRules(userId), engineEventsForUser(userId, padded(range))]);
  const dates = localDatesInRange(range.start.getTime(), range.end.getTime(), timezone);
  const days = dayOverviews({ dates, timezone, events: data.engineEvents, rules, now: now.getTime() });
  const inRange = data.events.filter((e) => Date.parse(e.end) > range.start.getTime() && Date.parse(e.start) < range.end.getTime());
  return { timezone, days, events: inRange, calendars: data.calendars };
}

export async function conflictsForUser(userId: string, range: { start: Date; end: Date }) {
  const [{ rules, timezone }, { engineEvents, events }] = await Promise.all([getRules(userId), engineEventsForUser(userId, padded(range))]);
  const conflicts = detectConflicts({ events: engineEvents, rules, timezone, range: { start: range.start.getTime(), end: range.end.getTime() } });
  const byId = new Map(events.map((e) => [e.id, e]));
  return {
    timezone,
    conflicts: conflicts.map((c) => ({
      ...c,
      events: c.eventIds.map((id) => {
        const e = byId.get(id);
        return e ? { id: e.id, title: e.title, start: e.start, end: e.end, calendarName: e.calendarName } : { id, title: "", start: "", end: "", calendarName: "" };
      }),
    })),
  };
}

export async function insightsForUser(userId: string, range: { start: Date; end: Date }) {
  const [{ rules, timezone }, { engineEvents }] = await Promise.all([getRules(userId), engineEventsForUser(userId, padded(range))]);
  return { timezone, ...computeInsights({ events: engineEvents, rules, timezone, range: { start: range.start.getTime(), end: range.end.getTime() } }) };
}
