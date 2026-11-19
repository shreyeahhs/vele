import { z } from "zod";
import { route } from "@/lib/api";
import { db } from "@/server/db";
import { audit } from "@/server/services/audit";

/** Deletes the account and everything that belongs to it. Irreversible; requires typing a phrase. */
export const DELETE = route({ body: z.object({ confirm: z.literal("delete my account") }) }, async ({ user }) => {
  await audit({ userId: null, actorType: "user", action: "account.delete", targetType: "user", targetId: user.id });
  await db.user.delete({ where: { id: user.id } });
  return { ok: true };
});
