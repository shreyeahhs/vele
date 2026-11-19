import { z } from "zod";
import { route } from "@/lib/api";
import { db } from "@/server/db";
import { PROVIDERS } from "@/server/messaging/router";
import { audit } from "@/server/services/audit";

export const GET = route({}, async ({ user }) => {
  const identities = await db.messagingIdentity.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  return {
    configured: { TELEGRAM: PROVIDERS.TELEGRAM.configured, WHATSAPP: PROVIDERS.WHATSAPP.configured },
    identities: identities.map((i) => ({
      id: i.id,
      provider: i.provider,
      displayName: i.displayName,
      // Show only the last digits of a phone number.
      handle: i.provider === "WHATSAPP" ? `…${i.externalUserId.slice(-4)}` : "Telegram chat",
      createdAt: i.createdAt.toISOString(),
    })),
  };
});

export const DELETE = route({ query: z.object({ id: z.string().min(1) }) }, async ({ user, query }) => {
  await db.messagingIdentity.deleteMany({ where: { id: query.id, userId: user.id } });
  await audit({ userId: user.id, actorType: "user", action: "messaging.unlink" });
  return { ok: true };
});
