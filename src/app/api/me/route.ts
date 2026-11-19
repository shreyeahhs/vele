import { z } from "zod";
import { route } from "@/lib/api";
import { features } from "@/lib/env";
import { isValidTimeZone } from "@/scheduling";
import { db } from "@/server/db";
import { audit } from "@/server/services/audit";
import { provisionUser } from "@/server/services/provisioning";

export const GET = route({}, async ({ user }) => {
  const [profile, prefs] = await Promise.all([
    db.bookingProfile.findUnique({ where: { userId: user.id }, select: { handle: true } }),
    db.schedulingPreferences.findUnique({ where: { userId: user.id }, select: { defaultVideoLink: true } }),
  ]);
  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role, timezone: user.timezone, onboarded: user.onboarded },
    bookingHandle: profile?.handle ?? null,
    hasVideoLink: Boolean(prefs?.defaultVideoLink),
    features: features(),
  };
});

const patch = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone").optional(),
  onboarded: z.literal(true).optional(),
});

export const PATCH = route({ body: patch }, async ({ user, body }) => {
  await provisionUser(user.id);
  await db.user.update({
    where: { id: user.id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.timezone ? { timezone: body.timezone } : {}),
      ...(body.onboarded ? { onboardedAt: new Date() } : {}),
    },
  });
  await audit({ userId: user.id, actorType: "user", action: "profile.update", metadata: { fields: Object.keys(body).join(",") } });
  return { ok: true };
});
