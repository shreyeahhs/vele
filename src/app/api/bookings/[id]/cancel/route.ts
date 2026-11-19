import { z } from "zod";
import { route } from "@/lib/api";
import { cancelBookingAsHost } from "@/server/services/bookings";

type P = { id: string };

export const POST = route<{ reason?: string | null }, undefined, P>(
  { body: z.object({ reason: z.string().trim().max(300).nullable().optional() }) },
  async ({ user, body, params }) => cancelBookingAsHost(user.id, params.id, body.reason ?? null),
);
