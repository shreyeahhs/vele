import { z } from "zod";
import { route } from "@/lib/api";
import { calendarColor } from "@/lib/api-schemas";
import { createCalendar, listCalendars } from "@/server/services/events";

export const GET = route({}, async ({ user }) => ({ calendars: await listCalendars(user.id) }));

export const POST = route(
  { body: z.object({ name: z.string().trim().min(1).max(60), isPersonal: z.boolean().optional(), color: calendarColor.optional() }) },
  async ({ user, body }) => ({ calendar: await createCalendar(user.id, body) }),
);
