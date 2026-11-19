import { mergeIntervals } from "./intervals";
import { MINUTE } from "./time";
import type { EngineEvent, Interval, SchedulingRules } from "./types";

export type BlockClass = "busy" | "tentative" | "focus" | "blocked" | "ignored";

export interface ClassifiedEvent {
  event: EngineEvent;
  cls: BlockClass;
  /** Short explanation used in traces and tests. */
  why: string;
}

/**
 * Decides how one event affects availability.
 *
 * - cancelled, declined, "free"/"working elsewhere", or on a calendar excluded
 *   from availability: ignored
 * - explicit blocked time or out of office: hard block
 * - focus blocks: soft (technically free, not offered for meetings)
 * - tentative or unanswered invitations: busy when `treatTentativeAsBusy`
 * - everything else: busy
 */
export function classifyEvent(event: EngineEvent, rules: Pick<SchedulingRules, "treatTentativeAsBusy">): ClassifiedEvent {
  if (event.end <= event.start) return { event, cls: "ignored", why: "zero length" };
  if (event.countsForAvailability === false) return { event, cls: "ignored", why: "calendar excluded from availability" };
  if (event.status === "cancelled") return { event, cls: "ignored", why: "cancelled" };
  if (event.selfResponse === "declined") return { event, cls: "ignored", why: "declined" };
  if (event.kind === "blocked" || event.kind === "oof" || event.showAs === "oof") {
    return { event, cls: "blocked", why: event.kind === "blocked" ? "blocked time" : "out of office" };
  }
  if (event.kind === "focus") return { event, cls: "focus", why: "focus time" };
  if (event.showAs === "free" || event.showAs === "workingElsewhere") return { event, cls: "ignored", why: `shown as ${event.showAs}` };
  const tentative = event.status === "tentative" || event.showAs === "tentative" || event.selfResponse === "tentative" || event.selfResponse === "needsAction";
  if (tentative) {
    return rules.treatTentativeAsBusy ? { event, cls: "tentative", why: "tentative (treated as busy)" } : { event, cls: "ignored", why: "tentative (treated as free)" };
  }
  return { event, cls: "busy", why: "busy" };
}

/**
 * The same meeting often appears on two connected calendars (an invite sent to
 * both a work and a personal address). Events sharing an iCalUID and a start
 * time are one commitment; keep the first copy.
 */
export function dedupeEvents(events: readonly EngineEvent[]): EngineEvent[] {
  const seen = new Set<string>();
  const out: EngineEvent[] = [];
  for (const e of events) {
    if (e.iCalUid) {
      const key = `${e.iCalUid}|${e.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(e);
  }
  return out;
}

/**
 * Every meeting protects `before` minutes ahead of it and `after` minutes
 * behind it; protected zones may overlap each other but never a meeting.
 * So a new meeting N placed after an existing meeting A needs a gap of
 * max(A.after, N.before), and before an existing meeting B a gap of
 * max(N.after, B.before).
 */
export function bufferPadding(existing: { beforeMin: number; afterMin: number }, candidate: { beforeMin: number; afterMin: number }): { beforeMin: number; afterMin: number } {
  return {
    beforeMin: Math.max(existing.beforeMin, candidate.afterMin),
    afterMin: Math.max(existing.afterMin, candidate.beforeMin),
  };
}

export interface BusyModel {
  /** Blocking commitments without buffers (for "is anything actually on"). */
  raw: Interval[];
  /** Blocking commitments with buffers applied (what a new meeting must avoid). */
  withBuffers: Interval[];
  /** Hard blocks: blocked time and out of office. */
  blocked: Interval[];
  /** Soft blocks: focus events. */
  focus: Interval[];
  /** Tentative busy events (subset of raw). */
  tentative: Interval[];
  classified: ClassifiedEvent[];
}

/**
 * Builds the busy model. `beforeMin` pads the start of each commitment and
 * `afterMin` pads its end; callers derive them with `bufferPadding` so both the
 * existing meeting's buffers and the new meeting's own buffers hold. Example:
 * 14:00–15:00 with a 10-minute after buffer blocks until 15:10.
 */
export function buildBusyModel(
  events: readonly EngineEvent[],
  rules: Pick<SchedulingRules, "treatTentativeAsBusy">,
  buffers: { beforeMin: number; afterMin: number },
  ignoreIds: readonly string[] = [],
): BusyModel {
  const ignore = new Set(ignoreIds);
  const classified = dedupeEvents(events.filter((e) => !ignore.has(e.id))).map((e) => classifyEvent(e, rules));
  const raw: Interval[] = [];
  const tentative: Interval[] = [];
  const blocked: Interval[] = [];
  const focus: Interval[] = [];
  for (const c of classified) {
    const i = { start: c.event.start, end: c.event.end };
    if (c.cls === "busy" || c.cls === "tentative") {
      raw.push(i);
      if (c.cls === "tentative") tentative.push(i);
    } else if (c.cls === "blocked") blocked.push(i);
    else if (c.cls === "focus") focus.push(i);
  }
  const withBuffers = raw.map((i) => ({
    start: i.start - buffers.beforeMin * MINUTE,
    end: i.end + buffers.afterMin * MINUTE,
  }));
  return {
    raw: mergeIntervals(raw),
    withBuffers: mergeIntervals(withBuffers),
    blocked: mergeIntervals(blocked),
    focus: mergeIntervals(focus),
    tentative: mergeIntervals(tentative),
    classified,
  };
}
