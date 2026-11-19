import { z } from "zod";
import { route } from "@/lib/api";
import { isoInstant } from "@/lib/api-schemas";
import { limits } from "@/lib/rate-limit";
import { getPublicSlots } from "@/server/services/bookings";

type P = { handle: string; slug: string };
const q = z.object({ from: isoInstant, to: isoInstant, invite: z.string().max(100).optional() });

/** Bookable start times only. Nothing about existing events ever leaves this endpoint. */
export const GET = route<undefined, z.infer<typeof q>, P, false>({ auth: false, query: q, rateLimit: { rule: limits.publicSlots, key: "ip" } }, async ({ params, query }) =>
  getPublicSlots(params.handle, params.slug, { from: new Date(query.from), to: new Date(query.to), inviteToken: query.invite }),
);
