import type { EvaluationContext } from "./context";
import { coveredBy, overlaps } from "./intervals";
import { MINUTE, durationLabel, formatInstantLocal, localDateOf, weekdayOf } from "./time";
import type { Interval, SlotReason, SlotReasonCode } from "./types";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Codes that make a slot "flagged": free on the calendar but against one of the user's rules. */
export const FLAG_CODES: ReadonlySet<SlotReasonCode> = new Set<SlotReasonCode>([
  "outside_working_hours",
  "non_working_day",
  "during_lunch",
  "during_focus_time",
  "during_blocked_time",
  "during_out_of_office",
  "before_earliest_meeting_time",
  "after_latest_meeting_time",
  "day_meeting_cap_reached",
  "creates_long_meeting_chain",
]);

const WEIGHTS: Partial<Record<SlotReasonCode, number>> = {
  no_adjacent_meetings: 10,
  keeps_block_free: 6,
  within_preferred_hours: 8,
  preferred_day: 5,
  light_day: 4,
  follows_meeting: -8,
  precedes_meeting: -5,
  between_meetings: -12,
  leaves_short_gap: -6,
  outside_preferred_hours: -6,
  near_tentative_event: -4,
};
const FLAG_WEIGHT = -30;

export interface Evaluation {
  reasons: SlotReason[];
  flagged: boolean;
  flagCodes: SlotReasonCode[];
  score: number;
}

/**
 * Describes one candidate slot. Reasons are factual statements about the slot
 * relative to the calendar and the user's rules; the score only orders them.
 */
export function evaluateSlot(ctx: EvaluationContext, slot: Interval, freeWindow?: Interval): Evaluation {
  const reasons: SlotReason[] = [];
  const add = (code: SlotReasonCode, label: string) => {
    const effect = FLAG_CODES.has(code) || (WEIGHTS[code] ?? 0) < 0 ? "negative" : (WEIGHTS[code] ?? 0) > 0 ? "positive" : "neutral";
    reasons.push({ code, label, effect });
  };
  const { zone, rules } = ctx;
  const date = localDateOf(slot.start, zone);
  const weekday = weekdayOf(date, zone);
  const isMeeting = ctx.purpose === "meeting";

  // ── Hard-ish rules (flags) ────────────────────────────────────────────────
  if (ctx.busy.blocked.some((b) => overlaps(b, slot))) {
    add("during_out_of_office", "Overlaps time marked out of office or blocked");
  }
  if (isMeeting) {
    if (!ctx.workingDays.has(weekday)) {
      add("non_working_day", `On a ${DAY_NAMES[weekday]}, outside your working days`);
    } else if (!coveredBy(slot, ctx.working)) {
      add("outside_working_hours", "Outside your configured working hours");
    }
    if (ctx.lunch.some((l) => overlaps(l, slot))) add("during_lunch", "Overlaps your lunch break");
    if (ctx.blockedRules.some((b) => overlaps(b, slot))) add("during_blocked_time", "Overlaps time you keep free");
    if (ctx.earliest.some((b) => overlaps(b, slot))) {
      add("before_earliest_meeting_time", `Before ${rules.noMeetingsBefore}, when you prefer no meetings`);
    }
    if (ctx.latest.some((b) => overlaps(b, slot))) {
      add("after_latest_meeting_time", `After ${rules.noMeetingsAfter}, when you prefer no meetings`);
    }
    const dayCount = ctx.meetingsPerDay.get(date) ?? 0;
    if (rules.maxMeetingsPerDay != null && dayCount >= rules.maxMeetingsPerDay) {
      add("day_meeting_cap_reached", `${DAY_NAMES[weekday]} already has ${dayCount} meetings (your limit is ${rules.maxMeetingsPerDay})`);
    }
    if (rules.maxConsecutiveMeetings != null) {
      const chain = chainLengthIfPlaced(ctx, slot);
      if (chain > rules.maxConsecutiveMeetings) {
        add("creates_long_meeting_chain", `Would make ${chain} meetings in a row (your limit is ${rules.maxConsecutiveMeetings})`);
      }
    }
  }
  if (ctx.focus.some((f) => overlaps(f, slot))) add("during_focus_time", "During focus time");

  // ── Descriptive context ──────────────────────────────────────────────────
  const { prev, next } = neighbours(ctx, slot, date);
  const touchMs = (Math.max(ctx.pad.beforeMin, ctx.pad.afterMin) + 5) * MINUTE;
  const follows = prev != null && slot.start - prev.end <= touchMs;
  const precedes = next != null && next.start - slot.end <= touchMs;
  if (follows && precedes) {
    add("between_meetings", "Sits between two meetings");
  } else if (follows) {
    add("follows_meeting", "Immediately follows another meeting");
  } else if (precedes) {
    add("precedes_meeting", "Immediately before another meeting");
  } else {
    const farPrev = prev == null || slot.start - prev.end >= 60 * MINUTE;
    const farNext = next == null || next.start - slot.end >= 60 * MINUTE;
    if (farPrev && farNext) add("no_adjacent_meetings", "No adjacent meetings");
    else {
      if (!farPrev && prev) add("gap_after_previous", `Starts ${durationLabel(Math.round((slot.start - prev.end) / MINUTE))} after the previous meeting`);
      if (!farNext && next) add("gap_before_next", `Ends ${durationLabel(Math.round((next.start - slot.end) / MINUTE))} before the next meeting`);
    }
  }

  // Unusable fragments left behind (smaller than 30 minutes after buffers).
  if (prev && !follows) {
    const usable = slot.start - prev.end - (ctx.pad.afterMin + ctx.pad.beforeMin) * MINUTE;
    if (usable > 0 && usable < 30 * MINUTE) {
      // Says the same thing as the plain "starts N after" note, with the judgement attached.
      dropReason(reasons, "gap_after_previous");
      add("leaves_short_gap", `Leaves a ${durationLabel(Math.round((slot.start - prev.end) / MINUTE))} gap after the previous meeting`);
    }
  }
  if (next && !precedes) {
    const usable = next.start - slot.end - (ctx.pad.afterMin + ctx.pad.beforeMin) * MINUTE;
    if (usable > 0 && usable < 30 * MINUTE) {
      dropReason(reasons, "gap_before_next");
      add("leaves_short_gap", `Leaves a ${durationLabel(Math.round((next.start - slot.end) / MINUTE))} gap before the next meeting`);
    }
  }
  if (freeWindow) {
    const windowMs = freeWindow.end - freeWindow.start;
    const atEdge = slot.start === freeWindow.start || slot.end === freeWindow.end;
    if (atEdge && windowMs - (slot.end - slot.start) >= 60 * MINUTE) {
      add("keeps_block_free", `Keeps ${durationLabel(Math.round((windowMs - (slot.end - slot.start)) / MINUTE))} of that free block together`);
    }
  }

  if (isMeeting && rules.preferredStart && rules.preferredEnd) {
    const s = formatInstantLocal(slot.start, zone);
    const e = formatInstantLocal(slot.end, zone);
    const inside = s >= rules.preferredStart && (e <= rules.preferredEnd || e === "00:00");
    if (inside) add("within_preferred_hours", `Within your preferred hours (${rules.preferredStart}–${rules.preferredEnd})`);
    else add("outside_preferred_hours", `Outside your preferred hours (${rules.preferredStart}–${rules.preferredEnd})`);
  }
  if (isMeeting && rules.preferredDays.length > 0 && rules.preferredDays.includes(weekday)) {
    add("preferred_day", `${DAY_NAMES[weekday]} is one of your preferred meeting days`);
  }
  if (isMeeting) {
    const dayCount = ctx.meetingsPerDay.get(date) ?? 0;
    if (dayCount === 0) add("light_day", "Nothing else scheduled that day");
    else if (dayCount >= 4) add("busy_day", `That day already has ${dayCount} meetings`);
  }
  if (!ctx.rules.treatTentativeAsBusy && ctx.busy.classified.some((c) => c.why.startsWith("tentative") && overlaps(c.event, slot))) {
    add("near_tentative_event", "Overlaps a tentative event");
  }

  const flagCodes = reasons.filter((r) => FLAG_CODES.has(r.code)).map((r) => r.code);
  let score = 100;
  for (const r of reasons) {
    if (FLAG_CODES.has(r.code)) score += FLAG_WEIGHT;
    else if (r.code === "busy_day") score -= 2 * (ctx.meetingsPerDay.get(date) ?? 0);
    else score += WEIGHTS[r.code] ?? 0;
  }
  // Tiny tie-breaker toward earlier slots so ordering is stable and predictable.
  score -= (slot.start - ctx.horizon.start) / (1000 * 60 * 60 * 24 * 365);
  return { reasons, flagged: flagCodes.length > 0, flagCodes, score: Math.round(score * 1000) / 1000 };
}

function neighbours(ctx: EvaluationContext, slot: Interval, date: string) {
  let prev: Interval | null = null;
  let next: Interval | null = null;
  for (const e of ctx.busyEvents) {
    if (e.isAllDay) continue;
    if (e.end <= slot.start) {
      if (localDateOf(e.end - 1, ctx.zone) === date && (!prev || e.end > prev.end)) prev = { start: e.start, end: e.end };
    } else if (e.start >= slot.end) {
      if (localDateOf(e.start, ctx.zone) === date) {
        next = { start: e.start, end: e.end };
        break;
      }
    }
  }
  return { prev, next };
}

/** Length of the back-to-back chain the slot would join (including the slot itself). */
function chainLengthIfPlaced(ctx: EvaluationContext, slot: Interval): number {
  const gap = (Math.max(ctx.pad.beforeMin, ctx.pad.afterMin) + 5) * MINUTE;
  const items = [...ctx.busyEvents.filter((e) => !e.isAllDay).map((e) => ({ start: e.start, end: e.end })), slot].sort((a, b) => a.start - b.start);
  let best = 1;
  let run = 1;
  let containsSlot = items[0] === slot;
  for (let i = 1; i < items.length; i++) {
    if (items[i].start - items[i - 1].end <= gap) {
      run++;
    } else {
      if (containsSlot) best = Math.max(best, run);
      run = 1;
      containsSlot = false;
    }
    if (items[i] === slot) containsSlot = true;
  }
  if (containsSlot) best = Math.max(best, run);
  return best;
}

function dropReason(reasons: SlotReason[], code: SlotReasonCode) {
  const i = reasons.findIndex((r) => r.code === code);
  if (i >= 0) reasons.splice(i, 1);
}
