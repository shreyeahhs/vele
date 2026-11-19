import { route } from "@/lib/api";
import { limits } from "@/lib/rate-limit";
import { getPublicProfile } from "@/server/services/bookings";

type P = { handle: string };

export const GET = route<undefined, undefined, P, false>({ auth: false, rateLimit: { rule: limits.publicSlots, key: "ip" } }, async ({ params }) =>
  getPublicProfile(params.handle),
);
