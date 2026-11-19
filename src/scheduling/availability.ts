import { buildContext, DEFAULT_WAKING_HOURS, daysOfWeekWindows, describeWorkingHours, timeOfDayWindows, type EvaluationContext } from "./context";
import { intersectIntervals, overlaps, subtractIntervals } from "./intervals";
import { evaluateSlot, FLAG_CODES } from "./scoring";
import { MINUTE, ceilToLocalStep, durationLabel, localDateOf, localDatesInRange } from "./time";
import type {
  AvailableSlot,
  EngineEvent,
  ExclusionNote,
  FreeWindow,
  Interval,
  LocalDate,
  SchedulingRules,
  SlotPurpose,
  SlotSearchInput,
  SlotSearchResult,
  WindowAnalysis,
} from "./types";
import { expandDailyWindow } from "./windows";

const MAX_CANDIDATES = 4000;

/**
 * Finds free slots of `durationMin` inside `range`.
 *
 * Pipeline: horizon (now / minimum notice / max advance) → allowed windows
 * (working or waking hours, time-of-day and weekday filters) → minus busy time
 * with buffers and hard blocks → aligned candidates → evaluated against the
 * user's rules → filtered by mode → a spread of options, returned in time order.
 */
export function findAvailableSlots(input: SlotSearchInput): SlotSearchResult {
  const opts = input.options ?? {};
  const mode = opts.mode ?? "owner";
  const purpose: SlotPurpose = opts.purpose ?? "meeting";
  const maxResults = Math.max(1, Math.min(opts.maxResults ?? 8, 50));
  const ctx = buildContext({
    range: input.range,
    durationMin: input.durationMin,
    now: input.now,
    timezone: input.timezone,
    events: input.events,
    rules: input.rules,
    mode,
    purpose,
    intervalMin: opts.slotIntervalMin,
    candidateBuffers:
      opts.bufferBeforeMin != null || opts.bufferAfterMin != null
        ? { beforeMin: opts.bufferBeforeMin ?? input.rules.bufferBeforeMin, afterMin: opts.bufferAfterMin ?? input.rules.bufferAfterMin }
        : undefined,
    ignoreEventIds: opts.ignoreEventIds,
  });
  const constraintsApplied = describeConstraints(ctx, input, mode, purpose);
  const empty = (excluded: ExclusionNote[]): SlotSearchResult => ({
    slots: [],
    rankedIndexes: [],
    freeWindows: [],
    totalCandidates: 0,
    excluded,
    constraintsApplied,
  });

  if (input.durationMin <= 0) return empty([]);
  if (ctx.horizon.end <= ctx.horizon.start) {
    const code = input.range.end <= input.now ? "past" : "minimum_notice";
    return empty([{ code, label: code === "past" ? "The requested time is in the past" : "Inside the minimum notice period", count: 1 }]);
  }

  // Allowed windows, in two tiers. Meetings live in working hours (primary);
  // for the owner, the rest of the waking day is a flagged fallback that is
  // only offered when asked for or when nothing inside working hours fits.
  const waking = opts.wakingHours ?? DEFAULT_WAKING_HOURS;
  const wakingInHorizon = expandDailyWindow(waking.start, waking.end, ctx.horizon, ctx.zone);
  const workingInHorizon = intersectIntervals(ctx.working, [ctx.horizon]);
  const meetingLike = mode === "booking" || purpose === "meeting";
  const filters = (list: Interval[]) => {
    let out = list;
    if (opts.timeOfDay) out = intersectIntervals(out, timeOfDayWindows(opts.timeOfDay, ctx.horizon, ctx.zone));
    if (opts.daysOfWeek && opts.daysOfWeek.length > 0) out = intersectIntervals(out, daysOfWeekWindows(opts.daysOfWeek, ctx.horizon, ctx.zone));
    return out;
  };
  const primaryBase = filters(meetingLike ? workingInHorizon : wakingInHorizon);
  const fallbackBase = mode === "owner" && purpose === "meeting" ? filters(subtractIntervals(wakingInHorizon, workingInHorizon)) : [];

  // Hard cuts: real commitments always; in booking mode every rule is hard.
  const hard: Interval[] = [...ctx.busy.withBuffers];
  if (meetingLike) hard.push(...ctx.busy.blocked);
  if (mode === "booking") {
    hard.push(...ctx.lunch, ...ctx.focus, ...ctx.blockedRules, ...ctx.earliest, ...ctx.latest);
  }
  const durationMs = ctx.durationMs;
  const toFreeWindows = (base: Interval[]): FreeWindow[] =>
    subtractIntervals(base, hard)
      .filter((w) => w.end - w.start >= durationMs)
      .map((w) => ({ start: w.start, end: w.end, date: localDateOf(w.start, ctx.zone), minutes: Math.round((w.end - w.start) / MINUTE) }));
  const freeWindows = toFreeWindows(primaryBase);
  const fallbackWindows = toFreeWindows(fallbackBase);

  // Candidates.
  type Candidate = { slot: Interval; window: Interval; ev: ReturnType<typeof evaluateSlot>; tier: "primary" | "fallback" };
  const stepMs = ctx.intervalMin * MINUTE;
  const generate = (windows: FreeWindow[], tier: Candidate["tier"], into: Candidate[]) => {
    for (const w of windows) {
      let t = ceilToLocalStep(w.start, ctx.intervalMin, ctx.zone);
      while (t + durationMs <= w.end) {
        const slot = { start: t, end: t + durationMs };
        into.push({ slot, window: w, ev: evaluateSlot(ctx, slot, w), tier });
        if (into.length >= MAX_CANDIDATES) return;
        t += stepMs;
      }
    }
  };
  const primary: Candidate[] = [];
  generate(freeWindows, "primary", primary);
  const fallback: Candidate[] = [];
  generate(fallbackWindows, "fallback", fallback);
  const candidates = [...primary, ...fallback];

  // Mode filtering.
  const excludedKeys = new Map<ExclusionNote["code"], Set<Interval>>();
  const note = (code: ExclusionNote["code"], window: Interval) => {
    const set = excludedKeys.get(code) ?? new Set<Interval>();
    set.add(window);
    excludedKeys.set(code, set);
  };
  let kept: Candidate[];
  if (mode === "booking") {
    kept = primary.filter((c) => !c.ev.flagged);
  } else {
    // Fallback order when nothing clean fits: flagged time inside working
    // hours (e.g. focus time) first, then time outside working hours.
    const clean = primary.filter((c) => !c.ev.flagged);
    if (opts.includeFlagged) kept = candidates;
    else if (clean.length > 0) kept = clean;
    else if (primary.length > 0) kept = primary;
    else kept = fallback;
    const keptSet = new Set(kept);
    if (!opts.includeFlagged) {
      for (const c of candidates) {
        if (!c.ev.flagged || keptSet.has(c)) continue;
        const codes = c.ev.flagCodes;
        if (codes.includes("outside_working_hours") || codes.includes("non_working_day")) note("outside_working_hours", c.window);
        else if (codes.includes("during_lunch")) note("lunch", c.window);
        else if (codes.includes("during_focus_time")) note("focus", c.window);
        else if (codes.includes("during_blocked_time") || codes.includes("during_out_of_office")) note("blocked", c.window);
        else if (codes.includes("day_meeting_cap_reached")) note("day_cap", c.window);
      }
    }
  }
  const excludedCounts = new Map<ExclusionNote["code"], number>([...excludedKeys.entries()].map(([k, v]) => [k, v.size]));

  // Gaps that exist on paper but vanish once buffers are applied.
  const rawFree = subtractIntervals(primaryBase, [...ctx.busy.raw, ...ctx.busy.blocked]).filter((w) => w.end - w.start >= durationMs);
  const tooShort = rawFree.filter((w) => !kept.some((c) => overlaps(c.slot, w))).length;
  if (tooShort > 0 && purpose === "meeting") excludedCounts.set("gap_too_short", tooShort);

  if (opts.exhaustive) {
    const all = [...kept].sort((a, b) => a.slot.start - b.slot.start);
    const slots: AvailableSlot[] = all.map((c) => ({
      start: c.slot.start,
      end: c.slot.end,
      score: c.ev.score,
      status: c.ev.flagged ? "flagged" : "available",
      reasons: c.ev.reasons,
      date: localDateOf(c.slot.start, ctx.zone),
    }));
    return {
      slots,
      rankedIndexes: slots.map((_, i) => i),
      freeWindows,
      totalCandidates: candidates.length,
      excluded: [...excludedCounts.entries()].map(([code, count]) => ({ code, count, label: exclusionLabel(code, count, ctx) })),
      constraintsApplied,
    };
  }

  // Spread: best-scored first, no overlapping picks, at most `perWindow` per free window.
  const windowsWithCandidates = new Set(kept.map((c) => c.window));
  const perWindow = Math.max(1, Math.ceil(maxResults / Math.max(1, windowsWithCandidates.size)));
  const picked: Candidate[] = [];
  const perWindowCount = new Map<Interval, number>();
  for (const c of [...kept].sort((a, b) => b.ev.score - a.ev.score || a.slot.start - b.slot.start)) {
    if (picked.length >= maxResults) break;
    if ((perWindowCount.get(c.window) ?? 0) >= perWindow) continue;
    if (picked.some((p) => overlaps(p.slot, c.slot))) continue;
    picked.push(c);
    perWindowCount.set(c.window, (perWindowCount.get(c.window) ?? 0) + 1);
  }
  // Fill remaining capacity if the per-window cap left room.
  if (picked.length < maxResults) {
    for (const c of [...kept].sort((a, b) => b.ev.score - a.ev.score || a.slot.start - b.slot.start)) {
      if (picked.length >= maxResults) break;
      if (picked.includes(c) || picked.some((p) => overlaps(p.slot, c.slot))) continue;
      picked.push(c);
    }
  }

  const slots: AvailableSlot[] = picked
    .sort((a, b) => a.slot.start - b.slot.start)
    .map((c) => ({
      start: c.slot.start,
      end: c.slot.end,
      score: c.ev.score,
      status: c.ev.flagged ? "flagged" : "available",
      reasons: c.ev.reasons,
      date: localDateOf(c.slot.start, ctx.zone),
    }));
  const rankedIndexes = slots
    .map((s, i) => ({ i, s }))
    .sort((a, b) => b.s.score - a.s.score || a.s.start - b.s.start)
    .map((x) => x.i);

  return {
    slots,
    rankedIndexes,
    freeWindows,
    totalCandidates: candidates.length,
    excluded: [...excludedCounts.entries()].map(([code, count]) => ({ code, count, label: exclusionLabel(code, count, ctx) })),
    constraintsApplied,
  };
}

function exclusionLabel(code: ExclusionNote["code"], count: number, ctx: EvaluationContext): string {
  const s = count === 1 ? "" : "s";
  switch (code) {
    case "gap_too_short":
      return `${count} gap${s} long enough on paper ${count === 1 ? "is" : "are"} too short once your buffers (${ctx.pad.beforeMin} min before, ${ctx.pad.afterMin} min after) are applied`;
    case "outside_working_hours":
      return `${count} free period${s} outside your working hours not shown`;
    case "lunch":
      return `${count} free period${s} overlapping lunch not shown`;
    case "focus":
      return `${count} free period${s} in focus time not shown`;
    case "blocked":
      return `${count} free period${s} in time you keep free not shown`;
    case "day_cap":
      return `${count} free period${s} on days at your meeting limit not shown`;
    case "minimum_notice":
      return "Inside the minimum notice period";
    case "past":
      return "The requested time is in the past";
  }
}

function describeConstraints(ctx: EvaluationContext, input: SlotSearchInput, mode: string, purpose: SlotPurpose): string[] {
  const r = input.rules;
  const out: string[] = [];
  if (purpose === "meeting") {
    out.push(`Working hours: ${describeWorkingHours(r)}${mode === "owner" ? " (outside hours only if asked)" : ""}`);
    if (ctx.pad.beforeMin || ctx.pad.afterMin) out.push(`Buffers: ${r.bufferBeforeMin} min before and ${r.bufferAfterMin} min after meetings`);
    if (r.lunch) out.push(`Lunch: ${r.lunch.start}–${r.lunch.end} on working days`);
    if (r.focus.length) out.push("Focus time is not offered for meetings");
    if (r.blocked.length) out.push("Blocked time is kept free");
    if (r.noMeetingsBefore) out.push(`No meetings before ${r.noMeetingsBefore}`);
    if (r.noMeetingsAfter) out.push(`No meetings after ${r.noMeetingsAfter}`);
    if (r.maxMeetingsPerDay) out.push(`At most ${r.maxMeetingsPerDay} meetings a day`);
    if (r.maxConsecutiveMeetings) out.push(`At most ${r.maxConsecutiveMeetings} meetings in a row`);
  } else {
    out.push("Personal plan: only real clashes are avoided (working hours, lunch and buffers ignored)");
  }
  if (mode === "booking") {
    out.push(`Minimum notice: ${durationLabel(r.minimumNoticeMin)}`);
    out.push(`Bookable up to ${r.maxAdvanceDays} days ahead`);
  }
  if (input.options?.timeOfDay) out.push(`Only between ${input.options.timeOfDay.start} and ${input.options.timeOfDay.end}`);
  return out;
}

export interface AnalyzeWindowInput {
  window: Interval;
  now: number;
  timezone: string;
  events: readonly EngineEvent[];
  rules: SchedulingRules;
  purpose?: SlotPurpose;
  ignoreEventIds?: string[];
}

/** "Am I free between 2 and 4?" / "Can I have lunch at 1?" — everything about one window. */
export function analyzeWindow(input: AnalyzeWindowInput): WindowAnalysis {
  const purpose = input.purpose ?? "meeting";
  const ctx = buildContext({
    range: input.window,
    durationMin: Math.max(1, Math.round((input.window.end - input.window.start) / MINUTE)),
    now: Math.min(input.now, input.window.start),
    timezone: input.timezone,
    events: input.events,
    rules: input.rules,
    mode: "owner",
    purpose,
    ignoreEventIds: input.ignoreEventIds,
  });
  const w = input.window;
  const conflicts = ctx.busy.classified
    .filter((c) => (c.cls === "busy" || c.cls === "tentative") && overlaps(c.event, w))
    .map((c) => ({ eventId: c.event.id, title: c.event.title, start: c.event.start, end: c.event.end, tentative: c.cls === "tentative" }));
  const bufferIssues: WindowAnalysis["bufferIssues"] = [];
  if (purpose === "meeting") {
    for (const c of ctx.busy.classified) {
      if (!(c.cls === "busy" || c.cls === "tentative") || overlaps(c.event, w)) continue;
      const gapBefore = (w.start - c.event.end) / MINUTE;
      const gapAfter = (c.event.start - w.end) / MINUTE;
      if (gapBefore >= 0 && gapBefore < ctx.pad.afterMin) bufferIssues.push({ eventId: c.event.id, title: c.event.title, side: "before", gapMin: Math.round(gapBefore) });
      if (gapAfter >= 0 && gapAfter < ctx.pad.beforeMin) bufferIssues.push({ eventId: c.event.id, title: c.event.title, side: "after", gapMin: Math.round(gapAfter) });
    }
  }
  const evaluation = evaluateSlot(ctx, w);
  const flags = evaluation.reasons.filter((r) => FLAG_CODES.has(r.code));
  const freeWithin = subtractIntervals([w], ctx.busy.withBuffers)
    .filter((f) => f.end - f.start >= 5 * MINUTE)
    .map((f) => ({ start: f.start, end: f.end, date: localDateOf(f.start, ctx.zone), minutes: Math.round((f.end - f.start) / MINUTE) }));
  const hardBlocked = ctx.busy.blocked.some((b) => overlaps(b, w));
  return {
    available: conflicts.length === 0 && bufferIssues.length === 0 && !hardBlocked,
    clearOfEvents: conflicts.length === 0,
    conflicts,
    bufferIssues,
    flags,
    freeWithin,
  };
}

export interface DayOverview {
  date: LocalDate;
  isWorkingDay: boolean;
  working: Interval[];
  /** Working-hours time with nothing scheduled (no buffers). */
  openTime: FreeWindow[];
  /** The same, after buffers: what a new meeting could actually use. */
  openTimeAfterBuffers: FreeWindow[];
  meetingCount: number;
  busyMinutes: number;
  freeMinutes: number;
}

/** Per-day summary used by schedule answers ("You have open time from …"). */
export function dayOverviews(input: { dates: LocalDate[]; timezone: string; events: readonly EngineEvent[]; rules: SchedulingRules; now: number }): DayOverview[] {
  if (input.dates.length === 0) return [];
  const first = input.dates[0];
  const last = input.dates[input.dates.length - 1];
  const range = {
    start: Date.parse(`${first}T00:00:00Z`) - 14 * 3_600_000,
    end: Date.parse(`${last}T23:59:59Z`) + 14 * 3_600_000,
  };
  const ctx = buildContext({ range, durationMin: 1, now: range.start, timezone: input.timezone, events: input.events, rules: input.rules, mode: "owner", purpose: "meeting" });
  return input.dates.map((date) => {
    const dayWorking = ctx.working.filter((w) => localDateOf(w.start, ctx.zone) === date);
    const isWorkingDay = dayWorking.length > 0;
    const toFree = (list: Interval[]): FreeWindow[] =>
      list.filter((f) => f.end - f.start >= 15 * MINUTE).map((f) => ({ start: f.start, end: f.end, date, minutes: Math.round((f.end - f.start) / MINUTE) }));
    const lunch = ctx.lunch.filter((l) => localDateOf(l.start, ctx.zone) === date);
    const open = subtractIntervals(dayWorking, [...ctx.busy.raw, ...ctx.busy.blocked, ...lunch]);
    const openBuffered = subtractIntervals(dayWorking, [...ctx.busy.withBuffers, ...ctx.busy.blocked, ...lunch]);
    const dayEvents = ctx.busyEvents.filter((e) => !e.isAllDay && localDatesInRange(e.start, e.end, ctx.zone).includes(date));
    const busyMinutes = Math.round(
      intersectIntervals(
        dayEvents.map((e) => ({ start: e.start, end: e.end })),
        dayWorking.length ? dayWorking : [{ start: Number.MIN_SAFE_INTEGER, end: Number.MAX_SAFE_INTEGER }],
      ).reduce((s, i) => s + (i.end - i.start), 0) / MINUTE,
    );
    return {
      date,
      isWorkingDay,
      working: dayWorking,
      openTime: toFree(open),
      openTimeAfterBuffers: toFree(openBuffered),
      meetingCount: dayEvents.length,
      busyMinutes,
      freeMinutes: toFree(open).reduce((s, f) => s + f.minutes, 0),
    };
  });
}
