import "server-only";
import { hmacSha256, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import type { InboundMessage, MessagingProvider } from "./types";

/**
 * WhatsApp Business Cloud API (Meta). Prepared and wired through the same
 * agent as Telegram; needs a Meta app, a WhatsApp business number, a
 * permanent access token and the app secret.
 * - Verification handshake: GET with hub.mode / hub.verify_token / hub.challenge
 * - Payload authenticity: X-Hub-Signature-256 = HMAC-SHA256(app secret, raw body)
 */
interface WaPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{ id: string; from: string; type: string; text?: { body?: string } }>;
        contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
      };
    }>;
  }>;
}

export const whatsapp: MessagingProvider = {
  id: "WHATSAPP",
  get configured() {
    const e = env();
    return Boolean(e.WHATSAPP_API_KEY && e.WHATSAPP_PHONE_NUMBER_ID);
  },
  verify(headers, rawBody) {
    const secret = env().WHATSAPP_APP_SECRET;
    const sig = headers.get("x-hub-signature-256");
    if (!secret || !sig?.startsWith("sha256=")) return false;
    return safeEqual(sig.slice(7), hmacSha256(secret, rawBody));
  },
  parse(payload) {
    const out: InboundMessage[] = [];
    for (const entry of (payload as WaPayload)?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        for (const m of v?.messages ?? []) {
          if (m.type !== "text" || !m.text?.body) continue;
          const name = v?.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
          out.push({ provider: "WHATSAPP", externalUserId: m.from, displayName: name, text: m.text.body.slice(0, 2000), messageId: m.id });
        }
      }
    }
    return out;
  },
  async send(to, text) {
    const e = env();
    if (!e.WHATSAPP_API_KEY || !e.WHATSAPP_PHONE_NUMBER_ID) return { ok: false };
    const res = await fetch(`https://graph.facebook.com/${e.WHATSAPP_API_VERSION}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${e.WHATSAPP_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: text.slice(0, 4000) } }),
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string } };
    if (!res.ok) log.warn("whatsapp.send_failed", { status: res.status, detail: body.error?.message });
    return { ok: res.ok, id: body.messages?.[0]?.id ?? null };
  },
};

/** The GET handshake Meta performs when the webhook URL is saved. */
export function verifyWhatsAppSubscription(params: URLSearchParams): string | null {
  const token = env().WHATSAPP_VERIFY_TOKEN;
  if (params.get("hub.mode") === "subscribe" && token && params.get("hub.verify_token") && safeEqual(params.get("hub.verify_token")!, token)) {
    return params.get("hub.challenge");
  }
  return null;
}
