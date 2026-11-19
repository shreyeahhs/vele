/**
 * Repeat presets ↔ RRULE lines. Shared by the event form and the assistant's
 * create_event tool so both write identical rules.
 */
export type RepeatPreset = "none" | "daily" | "weekdays" | "weekly" | "fortnightly" | "monthly";

export const REPEAT_LABELS: Record<RepeatPreset, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekdays: "Every weekday (Mon–Fri)",
  weekly: "Every week",
  fortnightly: "Every two weeks",
  monthly: "Every month",
};

const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** `weekday` is ISO (1 = Monday); `untilUtc` is "yyyyLLdd'T'HHmmss'Z'". */
export function repeatRule(preset: RepeatPreset | undefined, start: { weekday: number; day: number }, opts: { untilUtc?: string; count?: number } = {}): string[] | null {
  if (!preset || preset === "none") return null;
  const byDay = BYDAY[start.weekday - 1];
  const base: Record<Exclude<RepeatPreset, "none">, string> = {
    daily: "FREQ=DAILY",
    weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    weekly: `FREQ=WEEKLY;BYDAY=${byDay}`,
    fortnightly: `FREQ=WEEKLY;INTERVAL=2;BYDAY=${byDay}`,
    monthly: `FREQ=MONTHLY;BYMONTHDAY=${start.day}`,
  };
  let rule = base[preset];
  if (opts.count) rule += `;COUNT=${Math.min(opts.count, 200)}`;
  else if (opts.untilUtc) rule += `;UNTIL=${opts.untilUtc}`;
  return [`RRULE:${rule}`];
}

/** Best-effort reverse mapping for editing an existing rule. */
export function presetFromRule(lines: string[] | null | undefined): RepeatPreset {
  const r = lines?.find((l) => l.startsWith("RRULE:"))?.slice(6) ?? "";
  if (!r) return "none";
  if (/FREQ=DAILY/.test(r)) return "daily";
  if (/BYDAY=MO,TU,WE,TH,FR/.test(r)) return "weekdays";
  if (/INTERVAL=2/.test(r) && /FREQ=WEEKLY/.test(r)) return "fortnightly";
  if (/FREQ=WEEKLY/.test(r)) return "weekly";
  if (/FREQ=MONTHLY/.test(r)) return "monthly";
  return "none";
}
