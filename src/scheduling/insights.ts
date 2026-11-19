import { classifyEvent, dedupeEvents } from "./busy";
import { intersectIntervals, subtractIntervals, totalDuration } from "./intervals";
import { MINUTE, durationLabel, formatInstantLocal, localDateOf, localDatesInRange } from "./time";
import type { EngineEvent, Interval, LocalDate, SchedulingRules } from "./types";
import { expandDailyWindow, expandWeeklyWindows } from "./windows";

export interface DayLoad {
  date: LocalDate;
  meetingCount: number;
  meetingMinutes: number;
  focusMinutes: number;
  freeMinutes: number;
  longestFreeBlockMinutes: number;
}

export interface BackToBackChain {
  date: LocalDate;
  count: number;
  start: number;
  end: number;
}

export interface ScheduleInsights {
  range: Interval;
  meetingCount: number;
  meetingMinutes: number;
  /** Scheduled focus blocks plus uninterrupted free working time of 90+ minutes. */
  focusMinutes: number;
  /** Free working time (excluding lunch). */
  freeMinutes: number;
  /** Free working time in pieces shorter than 30 minutes between meetings. */
  fragmentedMinutes: number;
  afterHoursMeetings: number;
  backToBack: BackToBackChain[];
  busiestDay: DayLoad | null;
  days: DayLoad[];
  /** Plain descriptive sentences. No judgements about productivity. */
  observations: string[];
}

const FOCUS_BLOCK_MIN = 90;
const FRAGMENT_MAX_MIN = 30;

export function computeInsights(input: { events: readonly EngineEvent[]; rules: SchedulingRules; timezone: string; range: Interval }): ScheduleInsights {
  const { rules, timezone: zone, range } = input;
  const dates = localDatesInRange(range.start, range.end, zone);
  const working = expandWeeklyWindows(rules.workingHours, range, zone);
  const lunch = rules.lunch ? intersectIntervals(expandDailyWindow(rules.lunch.start, rules.lunch.end, range, zone), working) : [];

  const active = dedupeEvents(input.events).filter((e) => !e.isAllDay && e.end > range.start && e.start < range.end);
  const meetings = active.filter((e) => {
    const cls = classifyEvent(e, rules).cls;
    return (cls === "busy" || cls === "tentative") && e.isMeeting !== false;
  });
  const commitments = active.filter((e) => {
    const cls = classifyEvent(e, rules).cls;
    return cls === "busy" || cls === "tentative" || cls === "blocked";
  });
  const focusEvents = active.filter((e) => classifyEvent(e, rules).cls === "focus");

  const busyInWork = intersectIntervals(commitments.map(toInterval), working);
  const freeWork = subtractIntervals(working, [...busyInWork, ...lunch, ...focusEvents.map(toInterval)]);

  const days: DayLoad[] = dates.map((date) => {
    const onDay = (i: Interval) => localDateOf(i.start, zone) === date;
    const dayMeetings = meetings.filter(onDay);
    const dayFree = freeWork.filter(onDay);
    const dayFocusEvents = focusEvents.filter(onDay).map(toInterval);
    const longFree = dayFree.filter((f) => f.end - f.start >= FOCUS_BLOCK_MIN * MINUTE);
    return {
      date,
      meetingCount: dayMeetings.length,
      meetingMinutes: Math.round(totalDuration(dayMeetings.map(toInterval)) / MINUTE),
      focusMinutes: Math.round((totalDuration(dayFocusEvents) + totalDuration(longFree)) / MINUTE),
      freeMinutes: Math.round(totalDuration(dayFree) / MINUTE),
      longestFreeBlockMinutes: Math.round(Math.max(0, ...dayFree.map((f) => f.end - f.start)) / MINUTE),
    };
  });

  const fragmented = freeWork.filter((f) => {
    const len = f.end - f.start;
    if (len >= FRAGMENT_MAX_MIN * MINUTE) return false;
    const between = meetings.some((m) => m.end === f.start) && meetings.some((m) => m.start === f.end);
    return between;
  });

  const backToBack: BackToBackChain[] = [];
  const sorted = mergeIntervalsKeepCount(meetings);
  for (const chain of sorted) {
    if (chain.count >= 3) backToBack.push({ ...chain, date: localDateOf(chain.start, zone) });
  }

  const afterHoursMeetings = meetings.filter((m) => working.length > 0 && subtractIntervals([toInterval(m)], working).length > 0 && m.isMeeting).length;

  const meetingMinutes = days.reduce((s, d) => s + d.meetingMinutes, 0);
  const busiestDay = days.reduce<DayLoad | null>((best, d) => (d.meetingMinutes > (best?.meetingMinutes ?? 0) ? d : best), null);

  const insights: ScheduleInsights = {
    range,
    meetingCount: meetings.length,
    meetingMinutes,
    focusMinutes: days.reduce((s, d) => s + d.focusMinutes, 0),
    freeMinutes: days.reduce((s, d) => s + d.freeMinutes, 0),
    fragmentedMinutes: Math.round(totalDuration(fragmented) / MINUTE),
    afterHoursMeetings,
    backToBack,
    busiestDay,
    days,
    observations: [],
  };
  insights.observations = describeInsights(insights, zone);
  return insights;
}

function toInterval(e: { start: number; end: number }): Interval {
  return { start: e.start, end: e.end };
}

/** Chains of meetings with no gap (touching or overlapping), with how many meetings each contains. */
function mergeIntervalsKeepCount(events: readonly EngineEvent[]) {
  const sorted = [...events].sort((a, b) => a.start - b.start);
  const chains: { start: number; end: number; count: number }[] = [];
  for (const e of sorted) {
    const last = chains[chains.length - 1];
    if (last && e.start <= last.end) {
      last.end = Math.max(last.end, e.end);
      last.count++;
    } else chains.push({ start: e.start, end: e.end, count: 1 });
  }
  return chains;
}

const WEEKDAY = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

export function describeInsights(i: ScheduleInsights, zone: string): string[] {
  const out: string[] = [];
  out.push(`${i.meetingCount} meeting${i.meetingCount === 1 ? "" : "s"}, ${durationLabel(i.meetingMinutes)} in total; ${durationLabel(i.freeMinutes)} of free working time.`);
  for (const chain of i.backToBack) {
    out.push(`${chain.count} back-to-back meetings on ${WEEKDAY(chain.date)} (${formatInstantLocal(chain.start, zone)}–${formatInstantLocal(chain.end, zone)}).`);
  }
  if (i.fragmentedMinutes > 0) {
    out.push(`${durationLabel(i.fragmentedMinutes)} of free time sits in gaps shorter than ${FRAGMENT_MAX_MIN} minutes between meetings.`);
  }
  if (i.busiestDay && i.busiestDay.meetingMinutes > 0) {
    out.push(`${WEEKDAY(i.busiestDay.date)} has the most meeting time (${durationLabel(i.busiestDay.meetingMinutes)}).`);
  }
  if (i.afterHoursMeetings > 0) {
    out.push(`${i.afterHoursMeetings} meeting${i.afterHoursMeetings === 1 ? " runs" : "s run"} outside your working hours.`);
  }
  const blocks = i.days.filter((d) => d.longestFreeBlockMinutes >= FOCUS_BLOCK_MIN);
  if (blocks.length > 0) {
    out.push(`${blocks.length} day${blocks.length === 1 ? " has" : "s have"} an uninterrupted block of ${FOCUS_BLOCK_MIN} minutes or more.`);
  }
  return out;
}
