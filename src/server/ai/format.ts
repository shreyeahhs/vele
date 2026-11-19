import { DateTime } from "luxon";

/** Compact, unambiguous formats for tool results (the model repeats these, not raw ISO). */
export function fmtDay(d: Date | string | number, zone: string): string {
  return toDt(d, zone).toFormat("ccc d LLL");
}

export function fmtLongDay(d: Date | string | number, zone: string): string {
  return toDt(d, zone).toFormat("cccc d LLLL");
}

export function fmtTime(d: Date | string | number, zone: string): string {
  return toDt(d, zone).toFormat("HH:mm");
}

export function fmtRange(start: Date | string | number, end: Date | string | number, zone: string): string {
  return `${fmtTime(start, zone)}–${fmtTime(end, zone)}`;
}

export function fmtWhen(start: Date | string | number, end: Date | string | number, zone: string): string {
  const s = toDt(start, zone);
  const e = toDt(end, zone);
  if (s.hasSame(e, "day") || (e.hour === 0 && e.minute === 0 && e.minus({ minutes: 1 }).hasSame(s, "day"))) {
    return `${s.toFormat("cccc d LLLL")}, ${s.toFormat("HH:mm")}–${e.toFormat("HH:mm")}`;
  }
  return `${s.toFormat("ccc d LLL HH:mm")} – ${e.toFormat("ccc d LLL HH:mm")}`;
}

export function minutesBetween(a: Date | string | number, b: Date | string | number): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}

function toDt(d: Date | string | number, zone: string): DateTime {
  if (d instanceof Date) return DateTime.fromJSDate(d, { zone });
  if (typeof d === "number") return DateTime.fromMillis(d, { zone });
  return DateTime.fromISO(d, { zone });
}
