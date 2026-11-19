import { z } from "zod";
import { route } from "@/lib/api";
import { errors } from "@/lib/errors";
import { PROVIDERS, createLinkCode } from "@/server/messaging/router";

/** A short-lived code that connects a Telegram or WhatsApp chat to this account. */
export const POST = route({ body: z.object({ provider: z.enum(["TELEGRAM", "WHATSAPP"]) }) }, async ({ user, body }) => {
  if (!PROVIDERS[body.provider].configured) throw errors.notConfigured(body.provider === "TELEGRAM" ? "Telegram" : "WhatsApp");
  return createLinkCode(user.id, body.provider);
});
