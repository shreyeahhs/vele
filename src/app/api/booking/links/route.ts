import { z } from "zod";
import { route } from "@/lib/api";
import { createPrivateLink } from "@/server/services/bookings";

/** A private (secret) booking link for one meeting type. The URL is shown once. */
export const POST = route(
  {
    body: z.object({
      meetingTypeId: z.string().min(1),
      singleUse: z.boolean().optional(),
      label: z.string().trim().max(80).nullable().optional(),
      expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
    }),
  },
  async ({ user, body }) => createPrivateLink(user.id, body),
);
