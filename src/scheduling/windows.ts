import { mergeIntervals, intersectIntervals } from "./intervals";
import { localDatesInRange, localToInstant, parseLocalTime, weekdayOf } from "./time";
import type { Interval, IsoWeekday, LocalDate, LocalTime, WeeklyWindow } from "./types";

/**
 * Expands weekly wall-clock windows into UTC intervals covering `range`.
 * Each day is resolved in `zone`, so a 09:00–17:00 window stays 09:00–17:00
 * local time across daylight-saving changes (it is 08:00–16:00 UTC in BST and
 * 09:00–17:00 UTC in GMT).
 */
export function expandWeeklyWindows(windows: readonly WeeklyWindow[], range: Interval, zone: string): Interval[] {
  if (windows.length === 0 || range.end <= range.start) return [];
  const byDay = new Map<IsoWeekday, WeeklyWindow[]>();
  for (const w of windows) {
    const list = byDay.get(w.day) ?? [];
    list.push(w);
    byDay.set(w.day, list);
  }
  const out: Interval[] = [];
  // Include the day before the range so windows crossing midnight are not lost.
  const dates = localDatesInRange(range.start - 24 * 3_600_000, range.end, zone);
  for (const date of dates) {
    const list = byDay.get(weekdayOf(date, zone));
    if (!list) continue;
    for (const w of list) out.push(...windowOnDate(date, w.start, w.end, zone));
  }
  return intersectIntervals(mergeIntervals(out), [range]);
}

/** A daily window (same times every day) expanded over `range`. */
export function expandDailyWindow(start: LocalTime, end: LocalTime, range: Interval, zone: string): Interval[] {
  const all: WeeklyWindow[] = ([1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]).map((day) => ({ day, start, end }));
  return expandWeeklyWindows(all, range, zone);
}

/** One wall-clock window on one local date. A window whose end <= start wraps past midnight. */
export function windowOnDate(date: LocalDate, start: LocalTime, end: LocalTime, zone: string): Interval[] {
  const s = parseLocalTime(start);
  const e = parseLocalTime(end);
  const startInstant = localToInstant(date, s, zone);
  if (e > s) return [{ start: startInstant, end: localToInstant(date, e, zone) }];
  // Overnight window, e.g. 22:00–02:00.
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return [{ start: startInstant, end: localToInstant(next, e, zone) }];
}

/** Working-hours window for a given local date, or null on a non-working day. */
export function workingWindowsOn(date: LocalDate, workingHours: readonly WeeklyWindow[], zone: string): Interval[] {
  const day = weekdayOf(date, zone);
  return mergeIntervals(workingHours.filter((w) => w.day === day).flatMap((w) => windowOnDate(date, w.start, w.end, zone)));
}

export function isWorkingDay(date: LocalDate, workingHours: readonly WeeklyWindow[], zone: string): boolean {
  const day = weekdayOf(date, zone);
  return workingHours.some((w) => w.day === day);
}
