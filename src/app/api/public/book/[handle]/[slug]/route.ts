import { z } from "zod";
import { route } from "@/lib/api";
import { limits } from "@/lib/rate-limit";
import { getPublicMeetingType } from "@/server/services/bookings";

type P = { handle: string; slug: string };
const q = z.object({ invite: z.string().max(100).optional() });

export const GET = route<undefined, z.infer<typeof q>, P, false>({ auth: false, query: q, rateLimit: { rule: limits.publicSlots, key: "ip" } }, async ({ params, query }) =>
  getPublicMeetingType(params.handle, params.slug, query.invite),
);
