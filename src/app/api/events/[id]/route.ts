import { z } from "zod";
import { route } from "@/lib/api";
import { eventChanges } from "@/lib/api-schemas";
import { limits } from "@/lib/rate-limit";
import { cancelEvent, getEvent, updateEvent } from "@/server/services/events";

type P = { id: string };

export const GET = route<undefined, undefined, P>({}, async ({ user, params }) => ({ event: await getEvent(user.id, decodeURIComponent(params.id)) }));

export const PATCH = route<z.infer<typeof eventChanges>, undefined, P>(
  { body: eventChanges, rateLimit: { rule: limits.mutation, key: "user" } },
  async ({ user, body, params }) => {
    const { scope, notify, start, end, ...rest } = body;
    return updateEvent(user.id, decodeURIComponent(params.id), { ...rest, ...(start ? { start: new Date(start) } : {}), ...(end ? { end: new Date(end) } : {}) }, "user", {
      scope,
      notify,
    });
  },
);

const del = z.object({
  scope: z.enum(["occurrence", "series"]).optional(),
  notify: z.enum(["true", "false"]).optional(),
  reason: z.string().max(300).optional(),
});

export const DELETE = route<undefined, z.infer<typeof del>, P>({ query: del, rateLimit: { rule: limits.mutation, key: "user" } }, async ({ user, query, params }) =>
  cancelEvent(user.id, decodeURIComponent(params.id), "user", { scope: query.scope, notify: query.notify !== "false", reason: query.reason ?? null }),
);
