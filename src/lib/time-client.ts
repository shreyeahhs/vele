import { DateTime } from "luxon";

/**
 * Display helpers. Everything renders in the user's configured zone (from
 * their profile), never the browser's, so a laptop set to another zone still
 * shows the same diary.
 */
export type CalendarView = "day" | "3day" | "week" | "month" | "agenda";

export function dt(value: string | Date | number, zone: string): DateTime {
  if (value instanceof Date) return DateTime.fromJSDate(value, { zone });
  if (typeof value === "number") return DateTime.fromMillis(value, { zone });
  return DateTime.fromISO(value, { zone });
}

export function hhmm(value: string | Date | number, zone: string): string {
  return dt(value, zone).toFormat("HH:mm");
}

export function timeRange(start: string, end: string, zone: string): string {
  return `${hhmm(start, zone)}–${hhmm(end, zone)}`;
}

export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function relativeStart(start: string, now: DateTime): string {
  const mins = Math.round(DateTime.fromISO(start).diff(now, "minutes").minutes);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `in ${durationText(mins)}`;
  return DateTime.fromISO(start).setZone(now.zone).toFormat("cccc");
}

/** Visible days and the query range for a view anchored on a date. */
export function viewRange(view: CalendarView, anchor: DateTime): { start: DateTime; end: DateTime; days: DateTime[] } {
  const a = anchor.startOf("day");
  if (view === "day") return { start: a, end: a.plus({ days: 1 }), days: [a] };
  if (view === "3day") return { start: a, end: a.plus({ days: 3 }), days: [0, 1, 2].map((i) => a.plus({ days: i })) };
  if (view === "week") {
    const s = a.minus({ days: a.weekday - 1 });
    return { start: s, end: s.plus({ days: 7 }), days: Array.from({ length: 7 }, (_, i) => s.plus({ days: i })) };
  }
  if (view === "agenda") return { start: a, end: a.plus({ days: 14 }), days: Array.from({ length: 14 }, (_, i) => a.plus({ days: i })) };
  const first = a.startOf("month");
  const gridStart = first.minus({ days: first.weekday - 1 });
  const last = a.endOf("month").startOf("day");
  const gridEnd = last.plus({ days: 8 - last.weekday });
  const days: DateTime[] = [];
  for (let d = gridStart; d < gridEnd; d = d.plus({ days: 1 })) days.push(d);
  return { start: gridStart, end: gridEnd, days };
}

export function stepAnchor(view: CalendarView, anchor: DateTime, dir: 1 | -1): DateTime {
  switch (view) {
    case "day":
      return anchor.plus({ days: dir });
    case "3day":
      return anchor.plus({ days: 3 * dir });
    case "week":
      return anchor.plus({ weeks: dir });
    case "agenda":
      return anchor.plus({ weeks: 2 * dir });
    case "month":
      return anchor.plus({ months: dir });
  }
}

export function viewTitle(view: CalendarView, anchor: DateTime): string {
  const r = viewRange(view, anchor);
  if (view === "day") return anchor.toFormat("cccc d LLLL");
  if (view === "month") return anchor.toFormat("LLLL yyyy");
  const s = r.days[0];
  const e = r.days[r.days.length - 1];
  if (s.hasSame(e, "month")) return `${s.toFormat("d")}–${e.toFormat("d LLLL yyyy")}`;
  if (s.hasSame(e, "year")) return `${s.toFormat("d LLL")} – ${e.toFormat("d LLL yyyy")}`;
  return `${s.toFormat("d LLL yyyy")} – ${e.toFormat("d LLL yyyy")}`;
}

export function greeting(now: DateTime): string {
  const h = now.hour;
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
