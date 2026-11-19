import { DateTime } from "luxon";
import type { Instant, IsoWeekday, LocalDate, LocalTime } from "./types";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const TIME_RE = /^([01]\d|2[0-4]):([0-5]\d)$/;

/** Minutes after midnight for "HH:mm". "24:00" is allowed as end-of-day. */
export function parseLocalTime(value: LocalTime): number {
  const match = TIME_RE.exec(value);
  if (!match) throw new Error(`Invalid local time "${value}" (expected HH:mm)`);
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes > 24 * 60) throw new Error(`Invalid local time "${value}"`);
  return minutes;
}

export function formatLocalTime(minutes: number): LocalTime {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isValidTimeZone(zone: string): boolean {
  return DateTime.local().setZone(zone).isValid;
}

export function toZoned(instant: Instant, zone: string): DateTime {
  return DateTime.fromMillis(instant, { zone });
}

export function localDateOf(instant: Instant, zone: string): LocalDate {
  return toZoned(instant, zone).toISODate()!;
}

export function weekdayOf(date: LocalDate, zone: string): IsoWeekday {
  return DateTime.fromISO(date, { zone }).weekday as IsoWeekday;
}

/**
 * Converts a local date + wall-clock minutes into a UTC instant.
 *
 * DST: a wall time that does not exist (spring-forward gap) resolves to the
 * first valid instant after it; an ambiguous wall time (fall-back overlap)
 * resolves to the earlier occurrence. "24:00" means the start of the next day.
 */
export function localToInstant(date: LocalDate, minutes: number, zone: string): Instant {
  const day = DateTime.fromISO(date, { zone });
  if (!day.isValid) throw new Error(`Invalid date "${date}" or zone "${zone}"`);
  if (minutes >= 24 * 60) return day.plus({ days: 1 }).startOf("day").toMillis();
  const dt = day.set({ hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0, millisecond: 0 });
  return dt.toMillis();
}

export function localDateTimeToInstant(date: LocalDate, time: LocalTime, zone: string): Instant {
  return localToInstant(date, parseLocalTime(time), zone);
}

export function startOfLocalDay(date: LocalDate, zone: string): Instant {
  return DateTime.fromISO(date, { zone }).startOf("day").toMillis();
}

export function endOfLocalDay(date: LocalDate, zone: string): Instant {
  return DateTime.fromISO(date, { zone }).plus({ days: 1 }).startOf("day").toMillis();
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return DateTime.fromISO(date).plus({ days }).toISODate()!;
}

/** Every local date touched by [start, end). */
export function localDatesInRange(start: Instant, end: Instant, zone: string): LocalDate[] {
  if (end <= start) return [];
  const dates: LocalDate[] = [];
  let cursor = toZoned(start, zone).startOf("day");
  const last = toZoned(end - 1, zone).startOf("day");
  while (cursor <= last) {
    dates.push(cursor.toISODate()!);
    cursor = cursor.plus({ days: 1 });
  }
  return dates;
}

/** Minutes after local midnight for an instant. */
export function minutesIntoLocalDay(instant: Instant, zone: string): number {
  const dt = toZoned(instant, zone);
  return dt.hour * 60 + dt.minute;
}

/** Rounds an instant up to the next multiple of `stepMin` on the local clock. */
export function ceilToLocalStep(instant: Instant, stepMin: number, zone: string): Instant {
  const dt = toZoned(instant, zone);
  const minutes = dt.hour * 60 + dt.minute;
  const hasSeconds = dt.second > 0 || dt.millisecond > 0;
  const rem = minutes % stepMin;
  if (rem === 0 && !hasSeconds) return instant;
  const add = rem === 0 ? stepMin : stepMin - rem;
  return dt.set({ second: 0, millisecond: 0 }).plus({ minutes: add }).toMillis();
}

export function formatInstantLocal(instant: Instant, zone: string, format = "HH:mm"): string {
  return toZoned(instant, zone).toFormat(format);
}

export function describeRange(start: Instant, end: Instant, zone: string): string {
  const s = toZoned(start, zone);
  const e = toZoned(end, zone);
  if (s.hasSame(e, "day") || (e.hour === 0 && e.minute === 0 && e.minus({ minutes: 1 }).hasSame(s, "day"))) {
    return `${s.toFormat("ccc d LLL")}, ${s.toFormat("HH:mm")}–${e.toFormat("HH:mm")}`;
  }
  return `${s.toFormat("ccc d LLL HH:mm")} – ${e.toFormat("ccc d LLL HH:mm")}`;
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
