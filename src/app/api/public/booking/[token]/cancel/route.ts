import { z } from "zod";
import { clientIp, route } from "@/lib/api";
import { limits } from "@/lib/rate-limit";
import { cancelBookingAsInvitee } from "@/server/services/bookings";

type P = { token: string };

export const POST = route<{ reason?: string | null }, undefined, P, false>(
  { auth: false, body: z.object({ reason: z.string().trim().max(300).nullable().optional() }), rateLimit: { rule: limits.publicManage, key: "ip" } },
  async ({ req, params, body }) => cancelBookingAsInvitee(params.token, body.reason ?? null, { ip: clientIp(req) }),
);
