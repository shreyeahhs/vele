import "server-only";
import { randomInt } from "node:crypto";
import type { MessagingProviderId } from "@/generated/prisma/client";
import { hashToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { runAgent } from "../ai/agent";
import { db } from "../db";
import { audit } from "../services/audit";
import { telegram } from "./telegram";
import type { InboundMessage, MessagingProvider } from "./types";
import { whatsapp } from "./whatsapp";

export const PROVIDERS: Record<MessagingProviderId, MessagingProvider> = { TELEGRAM: telegram, WHATSAPP: whatsapp };

/**
 * Inbound chat → the same agent the web app uses → reply. Unlinked chats get
 * instructions, never calendar data. Each chat is linked to exactly one Vele
 * account with a short-lived code generated in Settings.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function createLinkCode(userId: string, provider: MessagingProviderId) {
  const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  await db.messagingLinkCode.create({ data: { userId, provider, codeHash: hashToken(code), expiresAt: new Date(Date.now() + 15 * 60_000) } });
  const e = env();
  return {
    code,
    expiresInMinutes: 15,
    telegramUrl: provider === "TELEGRAM" && e.TELEGRAM_BOT_USERNAME ? `https://t.me/${e.TELEGRAM_BOT_USERNAME}?start=${code}` : null,
    instructions:
      provider === "TELEGRAM"
        ? e.TELEGRAM_BOT_USERNAME
          ? `Open the link, or send "/start ${code}" to @${e.TELEGRAM_BOT_USERNAME}.`
          : `Send "/start ${code}" to your Vele bot.`
        : `Send "link ${code}" to your Vele WhatsApp number.`,
  };
}

async function tryLink(msg: InboundMessage): Promise<string | null> {
  const m = /^\s*(?:\/start|link)\s+([A-Z0-9]{6})\s*$/i.exec(msg.text);
  if (!m) return null;
  const record = await db.messagingLinkCode.findUnique({ where: { codeHash: hashToken(m[1].toUpperCase()) } });
  if (!record || record.usedAt || record.expiresAt < new Date() || record.provider !== msg.provider) {
    return "That code isn't valid any more. Generate a new one in Vele → Settings → Messaging.";
  }
  await db.$transaction([
    db.messagingLinkCode.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.messagingIdentity.upsert({
      where: { provider_externalUserId: { provider: msg.provider, externalUserId: msg.externalUserId } },
      create: { userId: record.userId, provider: msg.provider, externalUserId: msg.externalUserId, displayName: msg.displayName },
      update: { userId: record.userId, displayName: msg.displayName },
    }),
  ]);
  await audit({ userId: record.userId, actorType: "user", action: "messaging.link", metadata: { provider: msg.provider } });
  return 'Linked. You can ask me about your calendar here, e.g. "What\'s my schedule tomorrow?"';
}

export async function handleInbound(msg: InboundMessage): Promise<void> {
  const provider = PROVIDERS[msg.provider];
  // Providers retry deliveries; process each message once.
  const first = await rateLimit(`msg:${msg.provider}:${msg.messageId}`, { limit: 1, windowSec: 86_400 });
  if (!first.ok) return;
  const perChat = await rateLimit(`chat:${msg.provider}:${msg.externalUserId}`, { limit: 20, windowSec: 60 });
  if (!perChat.ok) return;

  try {
    const linked = await tryLink(msg);
    if (linked) {
      await provider.send(msg.externalUserId, linked);
      return;
    }
    if (/^\/start\b/i.test(msg.text)) {
      await provider.send(msg.externalUserId, "Hi, I'm Vele. To connect this chat to your calendar, open Vele → Settings → Messaging and send me the code shown there.");
      return;
    }
    const identity = await db.messagingIdentity.findUnique({ where: { provider_externalUserId: { provider: msg.provider, externalUserId: msg.externalUserId } } });
    if (!identity) {
      await provider.send(msg.externalUserId, "This chat isn't connected to a Vele account yet. Open Vele → Settings → Messaging to get a link code.");
      return;
    }
    const out = await runAgent({ userId: identity.userId, text: msg.text, channel: msg.provider });
    const needsConfirm = out.ui.actions.some((a) => a.status === "PENDING");
    await provider.send(msg.externalUserId, needsConfirm && !/confirm/i.test(out.text) ? `${out.text}\n\nReply "yes" to confirm.` : out.text);
  } catch (err) {
    log.error("messaging.inbound_failed", { provider: msg.provider, err });
    await provider.send(msg.externalUserId, "Something went wrong on my side. Please try again in a moment.").catch(() => undefined);
  }
}
