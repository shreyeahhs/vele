import { DateTime } from "luxon";
import { RRule, type RRuleOptions } from "../lib/rrule";
import type { Instant, Interval, LocalDate } from "./types";

/**
 * Recurring series are expanded in "floating" wall-clock time and only then
 * converted to instants in the series' zone. That keeps a weekly 10:00 London
 * meeting at 10:00 local time on both sides of a daylight-saving change, which
 * a naive UTC expansion gets wrong by an hour.
 *
 * Floating dates are represented as JS Dates whose UTC fields hold the local
 * wall-clock values (the convention the rrule library expects).
 */

export interface RecurringMaster {
  start: Instant;
  end: Instant;
  /** IANA zone the series was authored in. */
  timezone: string;
  /** Lines such as "RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE;TZID=Europe/London:20260928T100000". */
  recurrence: readonly string[];
  isAllDay?: boolean;
  /** For all-day series: the first local date. */
  startDate?: LocalDate | null;
  /** For all-day series: exclusive end date of the first occurrence. */
  endDate?: LocalDate | null;
}

export interface Occurrence extends Interval {
  /** The occurrence's original start (identifies it for exceptions). */
  originalStart: Instant;
  /** For all-day occurrences: the local start date. */
  date?: LocalDate;
}

const MAX_OCCURRENCES = 2000;

function toFloating(dt: DateTime): Date {
  return new Date(Date.UTC(dt.year, dt.month - 1, dt.day, dt.hour, dt.minute, dt.second));
}

function fromFloating(d: Date, zone: string): DateTime {
  return DateTime.fromObject(
    {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
    },
    { zone },
  );
}

/** Parses the value of an EXDATE/RDATE line into floating dates in `zone`. */
function parseDateList(line: string, zone: string): Date[] {
  const [head, value] = splitLine(line);
  if (!value) return [];
  const params = new Map(
    head
      .split(";")
      .slice(1)
      .map((p) => p.split("=") as [string, string]),
  );
  const tzid = params.get("TZID");
  const isDate = params.get("VALUE") === "DATE";
  return value
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      if (isDate || /^\d{8}$/.test(raw)) {
        const dt = DateTime.fromFormat(raw, "yyyyLLdd", { zone });
        return toFloating(dt.startOf("day"));
      }
      if (raw.endsWith("Z")) {
        const dt = DateTime.fromFormat(raw, "yyyyLLdd'T'HHmmss'Z'", { zone: "utc" }).setZone(zone);
        return toFloating(dt);
      }
      const dt = DateTime.fromFormat(raw, "yyyyLLdd'T'HHmmss", { zone: tzid ?? zone }).setZone(zone);
      return toFloating(dt);
    });
}

function splitLine(line: string): [string, string] {
  const idx = line.indexOf(":");
  if (idx === -1) return [line, ""];
  return [line.slice(0, idx), line.slice(idx + 1)];
}

/**
 * Expands a recurring master into occurrences overlapping `window`.
 * `exceptionStarts` are original starts of instances that were modified or
 * cancelled; those are skipped because they exist as separate rows.
 */
export function expandRecurrence(master: RecurringMaster, window: Interval, exceptionStarts: readonly Instant[] = []): Occurrence[] {
  const zone = master.timezone || "UTC";
  const durationMs = master.end - master.start;
  const startLocal = master.isAllDay && master.startDate ? DateTime.fromISO(master.startDate, { zone }) : DateTime.fromMillis(master.start, { zone });
  if (!startLocal.isValid) return [];
  const dtstart = toFloating(startLocal);

  const rruleLine = master.recurrence.find((l) => l.toUpperCase().startsWith("RRULE"));
  const exdates = master.recurrence.filter((l) => l.toUpperCase().startsWith("EXDATE")).flatMap((l) => parseDateList(l, zone));
  const rdates = master.recurrence.filter((l) => l.toUpperCase().startsWith("RDATE")).flatMap((l) => parseDateList(l, zone));

  const floatingStarts: Date[] = [];
  if (rruleLine) {
    const parsed: Partial<RRuleOptions> = RRule.parseString(rruleLine.replace(/^RRULE:/i, ""));
    if (parsed.until) {
      // UNTIL is a UTC instant (or a date); express it in floating wall time.
      const untilInstant = DateTime.fromJSDate(parsed.until, { zone: "utc" });
      const untilLocal = master.isAllDay ? untilInstant.setZone("utc", { keepLocalTime: true }).endOf("day") : untilInstant.setZone(zone);
      parsed.until = toFloating(untilLocal);
    }
    const rule = new RRule({ ...parsed, dtstart, tzid: null });
    // Search a little wider than the window so events that start before it and run into it are found.
    const from = new Date(toFloating(DateTime.fromMillis(window.start - durationMs - 36 * 3_600_000, { zone })).getTime());
    const to = new Date(toFloating(DateTime.fromMillis(window.end + 36 * 3_600_000, { zone })).getTime());
    let count = 0;
    rule.between(from, to, true, (d) => {
      floatingStarts.push(d);
      count++;
      return count < MAX_OCCURRENCES;
    });
  } else {
    floatingStarts.push(dtstart);
  }
  floatingStarts.push(...rdates);

  const excluded = new Set(exdates.map((d) => d.getTime()));
  const exceptionSet = new Set(exceptionStarts);
  const seen = new Set<number>();
  const out: Occurrence[] = [];

  for (const f of floatingStarts.sort((a, b) => a.getTime() - b.getTime())) {
    if (excluded.has(f.getTime()) || seen.has(f.getTime())) continue;
    seen.add(f.getTime());
    const local = fromFloating(f, zone);
    let start: number;
    let end: number;
    let date: LocalDate | undefined;
    if (master.isAllDay) {
      date = local.toISODate()!;
      const days = master.startDate && master.endDate ? Math.max(1, DateTime.fromISO(master.endDate).diff(DateTime.fromISO(master.startDate), "days").days) : 1;
      start = local.startOf("day").toMillis();
      end = local.startOf("day").plus({ days }).toMillis();
    } else {
      start = local.toMillis();
      end = start + durationMs;
    }
    if (exceptionSet.has(start)) continue;
    if (end <= window.start || start >= window.end) continue;
    out.push({ start, end, originalStart: start, date });
  }
  return out;
}

/** Human-readable summary of an RRULE, e.g. "Weekly on Monday". */
export function describeRecurrence(recurrence: readonly string[]): string | null {
  const line = recurrence.find((l) => l.toUpperCase().startsWith("RRULE"));
  if (!line) return null;
  try {
    const text = RRule.fromString(line.replace(/^RRULE:/i, "")).toText();
    return text.charAt(0).toUpperCase() + text.slice(1);
  } catch {
    return "Repeats";
  }
}
