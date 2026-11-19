import { z } from "zod";
import { route } from "@/lib/api";
import { hhmm, isoInstant } from "@/lib/api-schemas";
import { errors } from "@/lib/errors";
import { checkWindowForUser, findSlotsForUser } from "@/server/services/availability";

const body = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("find"),
    start: isoInstant,
    end: isoInstant,
    durationMin: z.number().int().min(5).max(600),
    purpose: z.enum(["meeting", "personal"]).optional(),
    timeOfDay: z
      .object({ start: hhmm, end: hhmm })
      .refine((t) => t.start < t.end, "timeOfDay must end after it starts")
      .nullable()
      .optional(),
    includeFlagged: z.boolean().optional(),
    maxResults: z.number().int().min(1).max(20).optional(),
  }),
  z.object({ mode: z.literal("check"), start: isoInstant, end: isoInstant, purpose: z.enum(["meeting", "personal"]).optional() }),
]);

/** The scheduling engine, for the UI's "Find time" command (the assistant uses the same functions). */
export const POST = route({ body }, async ({ user, body: b }) => {
  const range = { start: new Date(b.start), end: new Date(b.end) };
  if (range.end <= range.start) throw errors.validation("The end must be after the start.");
  if (range.end.getTime() - range.start.getTime() > 31 * 86_400_000) throw errors.validation("Search at most a month at a time.");
  if (b.mode === "check") return checkWindowForUser(user.id, { ...range, purpose: b.purpose });
  return findSlotsForUser(user.id, { range, durationMin: b.durationMin, purpose: b.purpose, timeOfDay: b.timeOfDay, includeFlagged: b.includeFlagged, maxResults: b.maxResults });
});
