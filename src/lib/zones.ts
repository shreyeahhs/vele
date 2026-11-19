import { DateTime } from "luxon";

/** IANA zones this browser knows, for time zone pickers. */
export function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];
  }
}

/**
 * "Europe/London (UTC+1)". The offset comes from Luxon rather than Intl's
 * short names, which differ between Node and browsers ("GMT" vs "GMT+0").
 */
export function zoneLabel(zone: string): string {
  const now = DateTime.now().setZone(zone);
  if (!now.isValid) return zone.replace(/_/g, " ");
  const m = now.offset;
  const sign = m < 0 ? "−" : "+";
  const h = Math.floor(Math.abs(m) / 60);
  const min = Math.abs(m) % 60;
  const offset = m === 0 ? "UTC" : `UTC${sign}${h}${min ? `:${String(min).padStart(2, "0")}` : ""}`;
  return `${zone.replace(/_/g, " ")} (${offset})`;
}
