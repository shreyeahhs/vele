import { z } from "zod";

/** Earliest and latest instants any request may name: wide enough for history and long repeats, narrow enough to keep date maths sane. */
const MIN_INSTANT = Date.UTC(1970, 0, 1);
const MAX_INSTANT = Date.UTC(2200, 0, 1);

/** ISO timestamp with an explicit offset (the browser always sends UTC "Z"), between 1970 and 2200. */
export const isoInstant = z.iso.datetime({ offset: true }).refine((v) => {
  const t = Date.parse(v);
  return Number.isFinite(t) && t >= MIN_INSTANT && t < MAX_INSTANT;
}, "Use a date between 1970 and 2199");

/** A local wall-clock time, 24h "HH:mm" (00:00–23:59, or 24:00 for the end of a day). */
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Use a 24-hour time like 09:30");

export const rangeQuery = z
  .object({ start: isoInstant, end: isoInstant })
  .transform((q) => ({ start: new Date(q.start), end: new Date(q.end) }))
  .refine((r) => r.end > r.start, "end must be after start")
  .refine((r) => r.end.getTime() - r.start.getTime() <= 62 * 86_400_000, "Ask for at most two months at a time");

export const attendeeInput = z.object({ email: z.email().max(200), name: z.string().trim().max(100).optional() });

export const eventInput = z.object({
  title: z.string().trim().min(1).max(200),
  calendarId: z.string().optional().nullable(),
  start: isoInstant,
  end: isoInstant,
  isAllDay: z.boolean().optional(),
  location: z.string().trim().max(300).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  meetingUrl: z.url().max(500).optional().nullable(),
  attendees: z.array(attendeeInput).max(50).optional(),
  recurrence: z.array(z.string().max(300)).max(5).optional().nullable(),
  kind: z.enum(["EVENT", "FOCUS", "BLOCKED", "OUT_OF_OFFICE"]).optional(),
  showAs: z.enum(["BUSY", "TENTATIVE", "FREE", "OUT_OF_OFFICE"]).optional(),
  isPrivate: z.boolean().optional(),
  sendInvitations: z.boolean().optional(),
});

export const eventChanges = eventInput.partial().extend({
  scope: z.enum(["occurrence", "series"]).optional(),
  notify: z.boolean().optional(),
});

/** A calendar's ink: one of the palette inks (theme-aware) or a hex colour. Never free CSS. */
export const calendarColor = z
  .string()
  .regex(/^(#[0-9a-fA-F]{6}|var\(--ink-(0|1|2c|3|4|5|6)\))$/, "Pick one of the inks")
  .nullable();
