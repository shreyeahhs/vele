import * as chrono from "chrono-node";
import { DateTime } from "luxon";
import { formatLocalTime, localDateTimeToInstant, parseLocalTime } from "./time";
import type { Instant, IsoWeekday, LocalDate, LocalTime } from "./types";

/**
 * Deterministic resolution of everyday time phrases ("tomorrow afternoon",
 * "next Friday", "1-3 this saturday", "half 3", "after lunch") in the user's
 * zone. The assistant calls this instead of doing date arithmetic itself, and
 * surfaces `assumptions` whenever a phrase was ambiguous.
 */

export interface ResolveContext {
  now: Instant;
  timezone: string;
  workingHours?: { start: LocalTime; end: LocalTime };
  lunch?: { start: LocalTime; end: LocalTime } | null;
  wakingHours?: { start: LocalTime; end: LocalTime };
}

export interface ResolvedTime {
  input: string;
  matched: boolean;
  dates: LocalDate[];
  timeWindow: { start: LocalTime; end: LocalTime } | null;
  exactTime: LocalTime | null;
  start: Instant;
  end: Instant;
  startLocal: string;
  endLocal: string;
  label: string;
  assumptions: string[];
}

const WEEKDAYS: Record<string, IsoWeekday> = {
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
  sun: 7,
  sunday: 7,
};
const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
const WEEKDAY_RE = "(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";

type Meridiem = "am" | "pm" | null;
interface ParsedTime {
  minutes: number;
  meridiem: Meridiem;
  /** True when the hour was bare (no am/pm, no 24h form) and had to be inferred. */
  inferred: boolean;
  raw: string;
}

export function normalisePhrase(text: string): string {
  return ` ${text} `
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[’']/g, "")
    .replace(/\b(tmrw|tmr|tomo|tmrow|2moro|tomorow)\b/g, "tomorrow")
    .replace(/\bp\.m\.?/g, "pm")
    .replace(/\ba\.m\.?/g, "am")
    .replace(/\bo ?clock\b/g, "")
    .replace(/\s+/g, " ");
}

function parseHourToken(token: string): number | null {
  if (/^\d{1,2}$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
}

/** Parses "3", "3pm", "15:00", "3:30pm", "noon", "half 3", "quarter past 2", "three". */
function parseTimeToken(raw: string): ParsedTime | null {
  const t = raw.trim();
  if (t === "noon" || t === "midday") return { minutes: 12 * 60, meridiem: "pm", inferred: false, raw };
  if (t === "midnight") return { minutes: 0, meridiem: "am", inferred: false, raw };
  let m = /^half (?:past )?(\d{1,2}|\w+)$/.exec(t);
  if (m) {
    const h = parseHourToken(m[1]);
    if (h == null) return null;
    return { minutes: h * 60 + 30, meridiem: null, inferred: true, raw };
  }
  m = /^quarter (past|to) (\d{1,2}|\w+)$/.exec(t);
  if (m) {
    const h = parseHourToken(m[2]);
    if (h == null) return null;
    return { minutes: m[1] === "past" ? h * 60 + 15 : h * 60 - 15, meridiem: null, inferred: true, raw };
  }
  m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/.exec(t);
  if (m) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h > 24 || min > 59) return null;
    const meridiem = (m[3] as Meridiem) ?? null;
    const is24h = !meridiem && (h >= 13 || h === 0 || (m[2] != null && m[1].length === 2 && h < 10));
    return { minutes: h * 60 + min, meridiem, inferred: !meridiem && !is24h, raw };
  }
  m = /^(\w+)\s*(am|pm)?$/.exec(t);
  if (m && NUMBER_WORDS[m[1]] != null) {
    return { minutes: NUMBER_WORDS[m[1]] * 60, meridiem: (m[2] as Meridiem) ?? null, inferred: !m[2], raw };
  }
  return null;
}

/** Applies am/pm and the bare-hour convention: 1–7 → afternoon, 8–11 → morning, 12 → noon. */
function toClock(p: ParsedTime): { minutes: number; assumed: boolean } {
  let h = Math.floor(p.minutes / 60);
  const min = ((p.minutes % 60) + 60) % 60;
  if (p.meridiem === "am") return { minutes: (h % 12) * 60 + min, assumed: false };
  if (p.meridiem === "pm") return { minutes: ((h % 12) + 12) * 60 + min, assumed: false };
  if (!p.inferred) return { minutes: p.minutes, assumed: false };
  if (h >= 1 && h <= 7) h += 12;
  return { minutes: h * 60 + min, assumed: h >= 13 };
}

const TIME_ATOM =
  "(?:noon|midday|midnight|half (?:past )?(?:\\d{1,2}|\\w+)|quarter (?:past|to) (?:\\d{1,2}|\\w+)|\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";

function withAssumption(label: string, minutes: number): string {
  return `Read “${label.trim()}” as ${formatLocalTime(minutes)}`;
}

interface TimeResult {
  window: { start: number; end: number } | null;
  exact: number | null;
  assumptions: string[];
  label: string | null;
}

function parseTimePart(text: string, ctx: Required<Pick<ResolveContext, "workingHours" | "wakingHours">> & { lunch: ResolveContext["lunch"] }): TimeResult {
  const workStart = parseLocalTime(ctx.workingHours.start);
  const workEnd = parseLocalTime(ctx.workingHours.end);
  const wakeStart = parseLocalTime(ctx.wakingHours.start);
  const wakeEnd = parseLocalTime(ctx.wakingHours.end);
  const lunch = ctx.lunch ? { start: parseLocalTime(ctx.lunch.start), end: parseLocalTime(ctx.lunch.end) } : { start: 12 * 60 + 30, end: 13 * 60 + 30 };
  const assumptions: string[] = [];

  // Explicit ranges: "between 2 and 4", "from 1-3", "1-3pm", "2 to 5", "10am till noon".
  const range = new RegExp(`(?:between|from)?\\s*(${TIME_ATOM})\\s*(?:-|to|till|until|and)\\s*(${TIME_ATOM})(?=\\s|$|[,.?!])`).exec(text);
  if (range && !/\bquarter to\b/.test(range[0])) {
    const a = parseTimeToken(range[1]);
    const b = parseTimeToken(range[2]);
    if (a && b) {
      let bClock = toClock(b);
      // "1-3pm": the trailing meridiem applies to the start too.
      let aClock = a.meridiem == null && b.meridiem != null ? toClock({ ...a, meridiem: b.meridiem, inferred: false }) : toClock(a);
      if (a.meridiem == null && b.meridiem != null && aClock.minutes > bClock.minutes) aClock = toClock({ ...a, meridiem: "am", inferred: false });
      // "11-1": end before start means the end is in the afternoon.
      if (bClock.minutes <= aClock.minutes && b.inferred && bClock.minutes + 12 * 60 <= 24 * 60) {
        bClock = { minutes: bClock.minutes + 12 * 60, assumed: true };
      }
      if (aClock.assumed) assumptions.push(withAssumption(range[1], aClock.minutes));
      if (bClock.assumed && b.meridiem == null) assumptions.push(withAssumption(range[2], bClock.minutes));
      if (bClock.minutes > aClock.minutes) {
        return { window: { start: aClock.minutes, end: bClock.minutes }, exact: null, assumptions, label: `${formatLocalTime(aClock.minutes)}–${formatLocalTime(bClock.minutes)}` };
      }
    }
  }

  // Periods of the day.
  const periods: Array<[RegExp, () => { start: number; end: number }, string]> = [
    [/\bafter lunch\b/, () => ({ start: lunch.end, end: Math.max(workEnd, lunch.end + 60) }), "after lunch"],
    [/\bbefore lunch\b/, () => ({ start: Math.min(workStart, lunch.start - 60), end: lunch.start }), "before lunch"],
    [/\b(?:at |over |for )?lunch ?time\b|\b(?:at|over|for) lunch\b|\blunch\b/, () => ({ start: 12 * 60, end: 14 * 60 }), "lunchtime"],
    [/\bfirst thing\b/, () => ({ start: workStart, end: workStart + 90 }), "first thing"],
    [/\b(?:end of (?:the )?day|eod)\b/, () => ({ start: Math.max(workStart, workEnd - 120), end: workEnd }), "end of the day"],
    [/\b(?:this )?morning\b/, () => ({ start: Math.min(8 * 60, workStart), end: 12 * 60 }), "morning"],
    [/\b(?:this )?afternoon\b/, () => ({ start: 12 * 60, end: Math.max(17 * 60, workEnd) }), "afternoon"],
    [/\b(?:this )?evening\b/, () => ({ start: 17 * 60, end: 21 * 60 }), "evening"],
    [/\btonight\b/, () => ({ start: 18 * 60, end: 23 * 60 }), "tonight"],
  ];

  // "after 3", "before 3", "by 3".
  const after = new RegExp(`\\b(?:after|from|anytime after|any time after|later than)\\s+(${TIME_ATOM})(?=\\s|$|[,.?!])`).exec(text);
  if (after && !/after lunch/.test(text)) {
    const p = parseTimeToken(after[1]);
    if (p) {
      const c = toClock(p);
      if (c.assumed) assumptions.push(withAssumption(after[1], c.minutes));
      const end = c.minutes < workEnd ? workEnd : Math.max(wakeEnd, c.minutes + 60);
      return { window: { start: c.minutes, end: Math.min(end, 24 * 60) }, exact: null, assumptions, label: `after ${formatLocalTime(c.minutes)}` };
    }
  }
  const before = new RegExp(`\\b(?:before|by|no later than|earlier than)\\s+(${TIME_ATOM})(?=\\s|$|[,.?!])`).exec(text);
  if (before && !/before lunch/.test(text)) {
    const p = parseTimeToken(before[1]);
    if (p) {
      const c = toClock(p);
      if (c.assumed) assumptions.push(withAssumption(before[1], c.minutes));
      const start = c.minutes > workStart ? workStart : wakeStart;
      return { window: { start: Math.min(start, c.minutes - 30), end: c.minutes }, exact: null, assumptions, label: `before ${formatLocalTime(c.minutes)}` };
    }
  }

  // Exact times: "at 3", "3pm", "15:00", "half 3", "noon".
  const exactRe = new RegExp(
    `(?:\\bat\\s+|\\baround\\s+|\\babout\\s+|@\\s*|\\s)(noon|midday|midnight|half (?:past )?(?:\\d{1,2}|\\w+)|quarter (?:past|to) (?:\\d{1,2}|\\w+)|\\d{1,2}[:.]\\d{2}\\s*(?:am|pm)?|\\d{1,2}\\s*(?:am|pm))(?=\\s|$|[,.?!])`,
  );
  const atBare = new RegExp(`\\b(?:at|around|about)\\s+(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?=\\s|$|[,.?!])`);
  const exact = exactRe.exec(text) ?? atBare.exec(text);
  if (exact) {
    const p = parseTimeToken(exact[1]);
    if (p) {
      const c = toClock(p);
      if (c.assumed || (p.inferred && !p.meridiem)) assumptions.push(withAssumption(exact[1], c.minutes));
      if (/\b(?:around|about)\b/.test(exact[0])) assumptions.push("“Around” read as the exact time");
      return { window: null, exact: c.minutes, assumptions, label: formatLocalTime(c.minutes) };
    }
  }

  for (const [re, fn, label] of periods) {
    if (re.test(text)) return { window: fn(), exact: null, assumptions, label };
  }
  return { window: null, exact: null, assumptions, label: null };
}

interface DayResult {
  dates: LocalDate[];
  label: string | null;
  assumptions: string[];
}

function parseDayPart(text: string, now: DateTime): DayResult {
  const today = now.startOf("day");
  const iso = (d: DateTime) => d.toISODate()!;
  const range = (from: DateTime, to: DateTime) => {
    const out: LocalDate[] = [];
    for (let d = from; d <= to; d = d.plus({ days: 1 })) out.push(iso(d));
    return out;
  };
  const weekStart = today.minus({ days: today.weekday - 1 });
  const fmt = (d: DateTime) => d.toFormat("ccc d LLL");
  const assumptions: string[] = [];

  if (/\bday after tomorrow\b/.test(text)) return { dates: [iso(today.plus({ days: 2 }))], label: "the day after tomorrow", assumptions };
  if (/\btomorrow\b/.test(text)) return { dates: [iso(today.plus({ days: 1 }))], label: "tomorrow", assumptions };
  if (/\byesterday\b/.test(text)) return { dates: [iso(today.minus({ days: 1 }))], label: "yesterday", assumptions };
  if (/\b(?:today|tonight|this (?:morning|afternoon|evening))\b/.test(text)) return { dates: [iso(today)], label: "today", assumptions };

  if (/\bnext weekend\b/.test(text)) {
    const sat = weekStart.plus({ days: 12 });
    assumptions.push(`“Next weekend” taken as ${fmt(sat)}–${fmt(sat.plus({ days: 1 }))}`);
    return { dates: range(sat, sat.plus({ days: 1 })), label: "next weekend", assumptions };
  }
  if (/\b(?:this |the |over the )?weekend\b/.test(text)) {
    const sat = today.weekday === 7 ? today.minus({ days: 1 }) : weekStart.plus({ days: 5 });
    const from = today > sat ? today : sat;
    return { dates: range(from, sat.plus({ days: 1 })), label: "this weekend", assumptions };
  }
  if (/\b(?:later this week|rest of (?:the|this) week)\b/.test(text)) {
    const end = weekStart.plus({ days: 6 });
    if (today >= end) return { dates: [iso(today)], label: "later this week", assumptions };
    return { dates: range(today.plus({ days: 1 }), end), label: "later this week", assumptions };
  }
  if (/\bnext week\b/.test(text)) {
    const mon = weekStart.plus({ days: 7 });
    return { dates: range(mon, mon.plus({ days: 6 })), label: "next week", assumptions };
  }
  if (/\bthis week\b/.test(text)) return { dates: range(today, weekStart.plus({ days: 6 })), label: "this week", assumptions };
  if (/\bnext month\b/.test(text)) {
    const first = today.plus({ months: 1 }).startOf("month");
    return { dates: range(first, first.endOf("month").startOf("day")), label: "next month", assumptions };
  }
  if (/\bthis month\b/.test(text)) return { dates: range(today, today.endOf("month").startOf("day")), label: "this month", assumptions };

  const inN = /\bin (\d+|a|an|one|two|three|four|five|six|seven) (day|days|week|weeks)\b/.exec(text);
  if (inN) {
    const n = /^\d+$/.test(inN[1]) ? Number(inN[1]) : (NUMBER_WORDS[inN[1]] ?? 1);
    const days = inN[2].startsWith("week") ? n * 7 : n;
    return { dates: [iso(today.plus({ days }))], label: `in ${inN[1]} ${inN[2]}`, assumptions };
  }

  const wd = new RegExp(`\\b(next|this|coming|on)?\\s*${WEEKDAY_RE}\\b`).exec(text);
  if (wd) {
    const target = WEEKDAYS[wd[2]] as IsoWeekday;
    const qualifier = wd[1] ?? "";
    const delta = (target - today.weekday + 7) % 7;
    const upcoming = today.plus({ days: delta });
    if (qualifier === "next") {
      const nextWeek = weekStart.plus({ days: 7 + target - 1 });
      if (iso(nextWeek) !== iso(upcoming) && delta !== 0) {
        assumptions.push(`“Next ${WEEKDAY_NAMES[target]}” taken as ${fmt(nextWeek)}; say “this ${WEEKDAY_NAMES[target]}” for ${fmt(upcoming)}`);
      }
      const chosen = delta === 0 ? today.plus({ days: 7 }) : nextWeek;
      return { dates: [iso(chosen)], label: `next ${WEEKDAY_NAMES[target]}`, assumptions };
    }
    return { dates: [iso(upcoming)], label: delta === 0 ? `today (${WEEKDAY_NAMES[target]})` : WEEKDAY_NAMES[target], assumptions };
  }

  // Explicit dates via chrono (UK day-month order).
  const isoDate = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  if (isoDate) return { dates: [isoDate[1]], label: isoDate[1], assumptions };
  const parsed = chrono.en.GB.parse(text, { instant: now.toJSDate(), timezone: now.offset }, { forwardDate: true });
  const dated = parsed.find((p) => p.start.isCertain("day") || p.start.isCertain("month"));
  if (dated) {
    const c = dated.start;
    const d = DateTime.fromObject({ year: c.get("year") ?? today.year, month: c.get("month") ?? today.month, day: c.get("day") ?? 1 }, { zone: now.zone });
    if (d.isValid) {
      const endC = dated.end;
      if (endC && endC.isCertain("day")) {
        const e = DateTime.fromObject({ year: endC.get("year") ?? d.year, month: endC.get("month") ?? d.month, day: endC.get("day") ?? d.day }, { zone: now.zone });
        if (e.isValid && e >= d) return { dates: range(d, e), label: `${fmt(d)}–${fmt(e)}`, assumptions };
      }
      return { dates: [iso(d)], label: fmt(d), assumptions };
    }
  }
  return { dates: [], label: null, assumptions };
}

export function resolveTimeExpression(input: string, ctx: ResolveContext): ResolvedTime {
  const zone = ctx.timezone;
  const now = DateTime.fromMillis(ctx.now, { zone });
  const text = normalisePhrase(input);
  const workingHours = ctx.workingHours ?? { start: "09:00", end: "17:00" };
  const wakingHours = ctx.wakingHours ?? { start: "07:00", end: "22:00" };
  const time = parseTimePart(text, { workingHours, wakingHours, lunch: ctx.lunch });
  const day = parseDayPart(text, now);
  const assumptions = [...day.assumptions, ...time.assumptions];
  let dates = day.dates;
  const matched = dates.length > 0 || time.window != null || time.exact != null;

  if (dates.length === 0) {
    const today = now.toISODate()!;
    const endMinutes = time.exact ?? time.window?.end ?? null;
    const nowMinutes = now.hour * 60 + now.minute;
    if (endMinutes != null && endMinutes <= nowMinutes) {
      const tomorrow = now.plus({ days: 1 }).toISODate()!;
      assumptions.push(`${formatLocalTime(endMinutes)} today has passed, so this is for tomorrow (${now.plus({ days: 1 }).toFormat("ccc d LLL")})`);
      dates = [tomorrow];
    } else {
      dates = [today];
    }
  }

  const first = dates[0];
  const last = dates[dates.length - 1];
  let start: Instant;
  let end: Instant;
  if (time.exact != null) {
    start = localDateTimeToInstant(first, formatLocalTime(time.exact), zone);
    end = start;
  } else if (time.window) {
    start = localDateTimeToInstant(first, formatLocalTime(time.window.start), zone);
    end = localDateTimeToInstant(last, formatLocalTime(Math.min(time.window.end, 24 * 60)), zone);
  } else {
    start = localDateTimeToInstant(first, "00:00", zone);
    end = localDateTimeToInstant(last, "24:00", zone);
  }

  const local = (i: Instant) => DateTime.fromMillis(i, { zone }).toFormat("yyyy-LL-dd'T'HH:mm");
  const dayLabel =
    dates.length === 1
      ? DateTime.fromISO(first, { zone }).toFormat("cccc d LLLL")
      : `${DateTime.fromISO(first, { zone }).toFormat("ccc d LLL")} – ${DateTime.fromISO(last, { zone }).toFormat("ccc d LLL")}`;
  const timeLabel = time.exact != null ? ` at ${formatLocalTime(time.exact)}` : time.window ? `, ${formatLocalTime(time.window.start)}–${formatLocalTime(time.window.end)}` : "";

  return {
    input,
    matched,
    dates,
    timeWindow: time.window ? { start: formatLocalTime(time.window.start), end: formatLocalTime(Math.min(time.window.end, 24 * 60)) } : null,
    exactTime: time.exact != null ? formatLocalTime(time.exact) : null,
    start,
    end,
    startLocal: local(start),
    endLocal: local(end),
    label: `${dayLabel}${timeLabel}`,
    assumptions,
  };
}

/** "30 min", "half an hour", "an hour", "1h30", "90 minutes", "an hour and a half", "2 hours". */
export function parseDuration(input: string): number | null {
  const t = normalisePhrase(input);
  if (/\b(?:an|one|1) hour and a half\b|\b1\.5 ?h(?:ours?|rs?)?\b|\bhour and a half\b/.test(t)) return 90;
  if (/\bhalf an? hour\b|\bhalf hour\b/.test(t)) return 30;
  if (/\bquarter of an hour\b/.test(t)) return 15;
  let m = /\b(\d+)\s*h(?:ours?|rs?)?\s*(?:and\s*)?(\d+)\s*m(?:in(?:ute)?s?)?\b/.exec(t) ?? /\b(\d+)h(\d{2})\b/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/.exec(t);
  if (m) return Math.round(Number(m[1]) * 60);
  m = /\b(\d+)\s*(?:m|min|mins|minute|minutes)\b/.exec(t);
  if (m) return Number(m[1]);
  m = /\b(an|one|two|three|four)\s+hours?\b/.exec(t);
  if (m) return (m[1] === "an" ? 1 : NUMBER_WORDS[m[1]]) * 60;
  m = /\b(\d{2,3})\b(?=[- ]?(?:min|minute))/.exec(t);
  if (m) return Number(m[1]);
  return null;
}

export function weekdayName(day: IsoWeekday): string {
  return WEEKDAY_NAMES[day];
}
