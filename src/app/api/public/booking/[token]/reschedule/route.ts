import { z } from "zod";
import { clientIp, route } from "@/lib/api";
import { isoInstant } from "@/lib/api-schemas";
import { limits } from "@/lib/rate-limit";
import { rescheduleBookingAsInvitee } from "@/server/services/bookings";

type P = { token: string };

export const POST = route<{ start: string }, undefined, P, false>(
  { auth: false, body: z.object({ start: isoInstant }), rateLimit: { rule: limits.publicBook, key: "ip" } },
  async ({ req, params, body }) => rescheduleBookingAsInvitee(params.token, body.start, { ip: clientIp(req) }),
);
