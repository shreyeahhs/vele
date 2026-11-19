import { z } from "zod";
import { route } from "@/lib/api";
import { calendarColor } from "@/lib/api-schemas";
import { deleteCalendar, updateCalendar } from "@/server/services/events";

const patch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: calendarColor.optional(),
  isVisible: z.boolean().optional(),
  includeInAvailability: z.boolean().optional(),
  isPersonal: z.boolean().optional(),
});

export const PATCH = route<z.infer<typeof patch>, undefined, { id: string }>({ body: patch }, async ({ user, body, params }) => ({
  calendar: await updateCalendar(user.id, params.id, body),
}));

export const DELETE = route<undefined, undefined, { id: string }>({}, async ({ user, params }) => {
  await deleteCalendar(user.id, params.id);
  return { ok: true };
});
