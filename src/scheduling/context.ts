import { bufferPadding, buildBusyModel, type BusyModel } from "./busy";
import { intersectIntervals, mergeIntervals } from "./intervals";
import { DAY, MINUTE, localDatesInRange, parseLocalTime, weekdayOf } from "./time";
import type { EngineEvent, Interval, IsoWeekday, LocalDate, LocalTime, SchedulingMode, SchedulingRules, SlotPurpose } from "./types";
import { expandDailyWindow, expandWeeklyWindows, windowOnDate } from "./windows";

export const DEFAULT_WAKING_HOURS = { start: "07:00", end: "22:00" } as const;

export interface EvaluationContext {
  zone: string;
  rules: SchedulingRules;
  mode: SchedulingMode;
  purpose: SlotPurpose;
  now: number;
  horizon: Interval;
  durationMs: number;
  intervalMin: number;
  /** Padding applied to existing commitments for this search. */
  pad: { beforeMin: number; afterMin: number };
  busy: BusyModel;
  /** Busy events (raw times) sorted by start, for adjacency questions. */
  busyEvents: EngineEvent[];
  working: Interval[];
  lunch: Interval[];
  focus: Interval[];
  blockedRules: Interval[];
  earliest: Interval[];
  latest: Interval[];
  /** Meetings already on each local date. */
  meetingsPerDay: Map<LocalDate, number>;
  workingDays: Set<IsoWeekday>;
}

export interface ContextInput {
  range: Interval;
  durationMin: number;
  now: number;
  timezone: string;
  events: readonly EngineEvent[];
  rules: SchedulingRules;
  mode: SchedulingMode;
  purpose: SlotPurpose;
  intervalMin?: number;
  candidateBuffers?: { beforeMin: number; afterMin: number };
  ignoreEventIds?: readonly string[];
}

/**
 * Precomputes everything a search or a window check needs, over a horizon
 * padded by a day on each side so adjacency and buffers see neighbouring
 * commitments.
 */
export function buildContext(input: ContextInput): EvaluationContext {
  const { rules, timezone: zone, mode, purpose } = input;
  const lower = mode === "booking" ? Math.max(input.range.start, input.now + rules.minimumNoticeMin * MINUTE) : Math.max(input.range.start, input.now);
  const upper = mode === "booking" ? Math.min(input.range.end, input.now + rules.maxAdvanceDays * DAY) : input.range.end;
  const horizon = { start: lower, end: Math.max(lower, upper) };
  const padded = { start: input.range.start - DAY, end: input.range.end + DAY };

  const candidateBuffers =
    purpose === "personal" ? { beforeMin: 0, afterMin: 0 } : (input.candidateBuffers ?? { beforeMin: rules.bufferBeforeMin, afterMin: rules.bufferAfterMin });
  const existingBuffers = purpose === "personal" ? { beforeMin: 0, afterMin: 0 } : { beforeMin: rules.bufferBeforeMin, afterMin: rules.bufferAfterMin };
  const pad = bufferPadding(existingBuffers, candidateBuffers);

  const busy = buildBusyModel(input.events, rules, pad, input.ignoreEventIds);
  const busyEvents = busy.classified
    .filter((c) => c.cls === "busy" || c.cls === "tentative")
    .map((c) => c.event)
    .sort((a, b) => a.start - b.start);

  // Lunch is protected on working days only.
  const lunch = rules.lunch ? intersectIntervals(expandDailyWindow(rules.lunch.start, rules.lunch.end, padded, zone), expandWorkingDaysWhole(rules, padded, zone)) : [];

  const earliest = rules.noMeetingsBefore ? expandDailyWindow("00:00", rules.noMeetingsBefore, padded, zone) : [];
  const latest = rules.noMeetingsAfter ? expandDailyWindow(rules.noMeetingsAfter, "24:00", padded, zone) : [];

  const meetingsPerDay = new Map<LocalDate, number>();
  for (const e of busyEvents) {
    if (e.isAllDay) continue;
    const date = localDatesInRange(e.start, e.start + 1, zone)[0];
    meetingsPerDay.set(date, (meetingsPerDay.get(date) ?? 0) + 1);
  }

  return {
    zone,
    rules,
    mode,
    purpose,
    now: input.now,
    horizon,
    durationMs: input.durationMin * MINUTE,
    intervalMin: Math.max(5, input.intervalMin ?? rules.slotIntervalMin ?? 15),
    pad,
    busy,
    busyEvents,
    working: expandWeeklyWindows(rules.workingHours, padded, zone),
    lunch,
    focus: mergeIntervals([...expandWeeklyWindows(rules.focus, padded, zone), ...busy.focus]),
    blockedRules: expandWeeklyWindows(rules.blocked, padded, zone),
    earliest,
    latest,
    meetingsPerDay,
    workingDays: new Set(rules.workingHours.map((w) => w.day)),
  };
}

/** Whole local days (00:00–24:00) of every working weekday: lunch only applies on working days. */
function expandWorkingDaysWhole(rules: SchedulingRules, range: Interval, zone: string): Interval[] {
  const days = [...new Set(rules.workingHours.map((w) => w.day))];
  return expandWeeklyWindows(
    days.map((day) => ({ day, start: "00:00", end: "24:00" })),
    range,
    zone,
  );
}

export function timeOfDayWindows(window: { start: LocalTime; end: LocalTime }, range: Interval, zone: string): Interval[] {
  return expandDailyWindow(window.start, window.end, range, zone);
}

export function daysOfWeekWindows(days: readonly IsoWeekday[], range: Interval, zone: string): Interval[] {
  return expandWeeklyWindows(
    days.map((day) => ({ day, start: "00:00", end: "24:00" })),
    range,
    zone,
  );
}

export function describeWorkingHours(rules: SchedulingRules): string {
  if (rules.workingHours.length === 0) return "No working hours set";
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const byTimes = new Map<string, number[]>();
  for (const w of rules.workingHours) {
    const key = `${w.start}–${w.end}`;
    byTimes.set(key, [...(byTimes.get(key) ?? []), w.day]);
  }
  return [...byTimes.entries()]
    .map(([times, days]) => {
      const sorted = [...new Set(days)].sort((a, b) => a - b);
      const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
      const label = contiguous && sorted.length > 2 ? `${names[sorted[0]]}–${names[sorted[sorted.length - 1]]}` : sorted.map((d) => names[d]).join(", ");
      return `${label} ${times}`;
    })
    .join("; ");
}

/** Working-hours text for a single date, e.g. "09:00–17:00", or null on a non-working day. */
export function workingHoursLabelOn(date: LocalDate, rules: SchedulingRules, zone: string): string | null {
  const day = weekdayOf(date, zone);
  const windows = rules.workingHours.filter((w) => w.day === day);
  if (windows.length === 0) return null;
  return windows.map((w) => `${w.start}–${w.end}`).join(", ");
}

export function minutesOf(time: LocalTime): number {
  return parseLocalTime(time);
}

export { windowOnDate };
