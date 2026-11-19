import "server-only";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import type { InboundMessage, MessagingProvider } from "./types";

/**
 * Telegram Bot API. Webhook requests are authenticated with the secret token
 * Telegram echoes in `X-Telegram-Bot-Api-Secret-Token` (set when the webhook
 * is registered with setWebhook).
 */
const API = "https://api.telegram.org";

interface TgUpdate {
  update_id?: number;
  message?: { message_id: number; text?: string; chat: { id: number; type: string }; from?: { first_name?: string; last_name?: string; username?: string } };
}

export const telegram: MessagingProvider = {
  id: "TELEGRAM",
  get configured() {
    return Boolean(env().TELEGRAM_BOT_TOKEN);
  },
  verify(headers) {
    const expected = env().TELEGRAM_WEBHOOK_SECRET;
    const got = headers.get("x-telegram-bot-api-secret-token");
    return Boolean(expected && got && safeEqual(expected, got));
  },
  parse(payload) {
    const u = payload as TgUpdate;
    const m = u?.message;
    if (!m?.text || m.chat.type !== "private") return [];
    const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.from?.username || null;
    return [
      { provider: "TELEGRAM", externalUserId: String(m.chat.id), displayName: name, text: m.text.slice(0, 2000), messageId: `${m.chat.id}:${m.message_id}` },
    ] satisfies InboundMessage[];
  },
  async send(to, text) {
    const token = env().TELEGRAM_BOT_TOKEN;
    if (!token) return { ok: false };
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: to, text: text.slice(0, 4000), disable_web_page_preview: true }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (!body.ok) log.warn("telegram.send_failed", { status: res.status, detail: body.description });
    return { ok: Boolean(body.ok), id: body.result?.message_id ? String(body.result.message_id) : null };
  },
};

/** Registers the webhook with Telegram (run once per deployment URL). */
export async function registerTelegramWebhook(url: string) {
  const e = env();
  if (!e.TELEGRAM_BOT_TOKEN || !e.TELEGRAM_WEBHOOK_SECRET) throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required");
  const res = await fetch(`${API}/bot${e.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, secret_token: e.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message"], drop_pending_updates: true }),
  });
  return (await res.json()) as { ok: boolean; description?: string };
}
