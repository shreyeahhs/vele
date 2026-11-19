import { z } from "zod";
import { route } from "@/lib/api";
import { eventInput, rangeQuery } from "@/lib/api-schemas";
import { limits } from "@/lib/rate-limit";
import { createEvent, listEvents } from "@/server/services/events";

export const GET = route({ query: rangeQuery }, async ({ user, query }) => ({
  events: await listEvents(user.id, query, { visibleOnly: false }),
}));

export const POST = route({ body: eventInput, rateLimit: { rule: limits.mutation, key: "user" } }, async ({ user, body }) => {
  const res = await createEvent(user.id, { ...body, start: new Date(body.start), end: new Date(body.end), source: "MANUAL" }, "user");
  return res;
});

export type CreateEventBody = z.input<typeof eventInput>;
