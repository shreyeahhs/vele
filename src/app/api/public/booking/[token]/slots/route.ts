import { z } from "zod";
import { route } from "@/lib/api";
import { isoInstant } from "@/lib/api-schemas";
import { limits } from "@/lib/rate-limit";
import { getRescheduleSlots } from "@/server/services/bookings";

type P = { token: string };
const q = z.object({ from: isoInstant, to: isoInstant });

/** Times the invitee can move their booking to (their current time is left out of the way). */
export const GET = route<undefined, z.infer<typeof q>, P, false>({ auth: false, query: q, rateLimit: { rule: limits.publicSlots, key: "ip" } }, async ({ params, query }) =>
  getRescheduleSlots(params.token, { from: new Date(query.from), to: new Date(query.to) }),
);
