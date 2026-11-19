/**
 * Minimal RFC 5545 writer for meeting invitations. Hand-rolled (it is short)
 * so METHOD, SEQUENCE and attendee lines are exactly what calendar clients
 * expect: REQUEST to invite or update, CANCEL to withdraw. The UID is the
 * event's stable iCalUid so updates replace the original in the recipient's
 * calendar instead of duplicating it.
 */
export interface IcsEvent {
  method: "REQUEST" | "CANCEL" | "PUBLISH";
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  organizer: { name: string; email: string };
  attendees: Array<{ name?: string | null; email: string }>;
  status?: "CONFIRMED" | "CANCELLED";
  /** For one occurrence of a series: the occurrence's original start. */
  recurrenceId?: Date | null;
  /** RRULE lines for a series invitation. */
  rrule?: string[];
  /** IANA zone; required for series so the recipient expands them in local time. */
  timezone?: string;
}

function localStamp(d: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

function stamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function escapeParam(value: string): string {
  return `"${value.replace(/"/g, "'")}"`;
}

/** Folds lines longer than 75 octets (continuation lines start with a space). */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (Buffer.byteLength(current + ch, "utf8") > limit) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(e: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Vele//Scheduling Assistant//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.method}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    ...(e.recurrenceId ? [`RECURRENCE-ID:${stamp(e.recurrenceId)}`] : []),
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${stamp(new Date())}`,
    ...(e.rrule?.length && e.timezone && !e.recurrenceId
      ? [`DTSTART;TZID=${e.timezone}:${localStamp(e.start, e.timezone)}`, `DTEND;TZID=${e.timezone}:${localStamp(e.end, e.timezone)}`]
      : [`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`]),
    ...(e.rrule && !e.recurrenceId ? e.rrule.filter((l) => /^(RRULE|EXDATE|RDATE)/i.test(l)) : []),
    `SUMMARY:${escapeText(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    `ORGANIZER;CN=${escapeParam(e.organizer.name)}:mailto:${e.organizer.email}`,
    ...e.attendees.map((a) => `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE${a.name ? `;CN=${escapeParam(a.name)}` : ""}:mailto:${a.email}`),
    `STATUS:${e.status ?? (e.method === "CANCEL" ? "CANCELLED" : "CONFIRMED")}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** "Add to Google Calendar" link (works without any Google integration). */
export function googleCalendarLink(e: { title: string; start: Date; end: Date; details?: string | null; location?: string | null }): string {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", e.title);
  url.searchParams.set("dates", `${stamp(e.start)}/${stamp(e.end)}`);
  if (e.details) url.searchParams.set("details", e.details);
  if (e.location) url.searchParams.set("location", e.location);
  return url.toString();
}

/** "Add to Outlook" link (outlook.live.com compose deeplink). */
export function outlookCalendarLink(e: { title: string; start: Date; end: Date; details?: string | null; location?: string | null }): string {
  const url = new URL("https://outlook.live.com/calendar/0/deeplink/compose");
  url.searchParams.set("subject", e.title);
  url.searchParams.set("startdt", e.start.toISOString());
  url.searchParams.set("enddt", e.end.toISOString());
  if (e.details) url.searchParams.set("body", e.details);
  if (e.location) url.searchParams.set("location", e.location);
  url.searchParams.set("path", "/calendar/action/compose");
  url.searchParams.set("rru", "addevent");
  return url.toString();
}
