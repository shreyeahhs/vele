import { DateTime } from "luxon";
import { DEFAULT_RULES, type EngineEvent, type SchedulingRules } from "@/scheduling";

export const LONDON = "Europe/London";
export const NEW_YORK = "America/New_York";

/** Local wall time → epoch ms. `t("2026-09-24T14:00")` */
export function t(local: string, zone = LONDON): number {
  const dt = DateTime.fromISO(local, { zone });
  if (!dt.isValid) throw new Error(`bad fixture time ${local}`);
  return dt.toMillis();
}

/** Epoch ms → "HH:mm" in zone. */
export function hm(ms: number, zone = LONDON): string {
  return DateTime.fromMillis(ms, { zone }).toFormat("HH:mm");
}

export function span(ms: { start: number; end: number }, zone = LONDON): string {
  return `${hm(ms.start, zone)}–${hm(ms.end, zone)}`;
}

let seq = 0;
export function ev(startLocal: string, endLocal: string, extra: Partial<EngineEvent> = {}, zone = LONDON): EngineEvent {
  seq++;
  return {
    id: extra.id ?? `e${seq}`,
    calendarId: "cal-work",
    start: t(startLocal, zone),
    end: t(endLocal, zone),
    isAllDay: false,
    status: "confirmed",
    showAs: "busy",
    kind: "event",
    isMeeting: true,
    countsForAvailability: true,
    title: extra.title ?? `Event ${seq}`,
    ...extra,
  };
}

export function rules(overrides: Partial<SchedulingRules> = {}): SchedulingRules {
  return { ...DEFAULT_RULES, ...overrides };
}

/** Rules with no lunch/buffers so tests can isolate one behaviour at a time. */
export function bareRules(overrides: Partial<SchedulingRules> = {}): SchedulingRules {
  return rules({ lunch: null, bufferBeforeMin: 0, bufferAfterMin: 0, ...overrides });
}

export function day(date: string, zone = LONDON) {
  return { start: t(`${date}T00:00`, zone), end: DateTime.fromISO(date, { zone }).plus({ days: 1 }).toMillis() };
}
