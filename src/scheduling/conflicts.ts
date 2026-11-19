import { classifyEvent, dedupeEvents } from "./busy";
import { coveredBy, overlaps } from "./intervals";
import { MINUTE, formatInstantLocal } from "./time";
import type { Conflict, EngineEvent, Interval, SchedulingRules } from "./types";
import { expandWeeklyWindows } from "./windows";

/**
 * Finds scheduling problems among existing events:
 * - overlap: two commitments on the same calendar at the same time
 * - double_booking: simultaneous commitments from different calendars
 * - insufficient_buffer: consecutive meetings closer than the after-meeting buffer
 * - outside_working_hours: meetings (not personal plans) outside working hours
 * - during_blocked_time: meetings inside time the user keeps free
 *
 * The same meeting present on two calendars (same iCalUID) is not a conflict.
 */
export function detectConflicts(input: { events: readonly EngineEvent[]; rules: SchedulingRules; timezone: string; range: Interval }): Conflict[] {
  const { rules, timezone: zone } = input;
  const active = dedupeEvents(input.events)
    .filter((e) => !e.isAllDay && overlaps(e, input.range))
    .filter((e) => {
      const cls = classifyEvent(e, rules).cls;
      return cls === "busy" || cls === "tentative";
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const conflicts: Conflict[] = [];
  const fmt = (i: number) => formatInstantLocal(i, zone);
  const name = (e: EngineEvent) => (e.title ? `“${e.title}”` : "an event");

  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      if (b.start >= a.end) break;
      if (a.iCalUid && a.iCalUid === b.iCalUid) continue;
      const crossCalendar = a.calendarId !== b.calendarId;
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);
      conflicts.push({
        type: crossCalendar ? "double_booking" : "overlap",
        eventIds: [a.id, b.id],
        start,
        end,
        severity: "high",
        message: `${name(a)} (${fmt(a.start)}–${fmt(a.end)}) overlaps ${name(b)} (${fmt(b.start)}–${fmt(b.end)})${crossCalendar ? " on another calendar" : ""}`,
      });
    }
  }

  if (rules.bufferAfterMin > 0) {
    for (let i = 0; i + 1 < active.length; i++) {
      const a = active[i];
      const b = active[i + 1];
      const gap = b.start - a.end;
      if (gap >= 0 && gap < rules.bufferAfterMin * MINUTE && a.isMeeting && b.isMeeting) {
        conflicts.push({
          type: "insufficient_buffer",
          eventIds: [a.id, b.id],
          start: a.end,
          end: b.start,
          severity: "low",
          message:
            gap === 0
              ? `${name(b)} starts as ${name(a)} ends, with no ${rules.bufferAfterMin}-minute buffer`
              : `Only ${Math.round(gap / MINUTE)} min between ${name(a)} and ${name(b)} (buffer is ${rules.bufferAfterMin} min)`,
        });
      }
    }
  }

  const working = expandWeeklyWindows(rules.workingHours, input.range, zone);
  const blocked = expandWeeklyWindows(rules.blocked, input.range, zone);
  for (const e of active) {
    if (!e.isMeeting) continue;
    if (working.length > 0 && !coveredBy(e, working)) {
      conflicts.push({
        type: "outside_working_hours",
        eventIds: [e.id],
        start: e.start,
        end: e.end,
        severity: "low",
        message: `${name(e)} (${fmt(e.start)}–${fmt(e.end)}) is outside your working hours`,
      });
    }
    const hit = blocked.find((b) => overlaps(b, e));
    if (hit) {
      conflicts.push({
        type: "during_blocked_time",
        eventIds: [e.id],
        start: Math.max(e.start, hit.start),
        end: Math.min(e.end, hit.end),
        severity: "medium",
        message: `${name(e)} falls in time you keep free`,
      });
    }
  }

  return conflicts.sort((a, b) => a.start - b.start || severityRank(a) - severityRank(b));
}

function severityRank(c: Conflict): number {
  return c.severity === "high" ? 0 : c.severity === "medium" ? 1 : 2;
}
