import { after, NextResponse, type NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { handleInbound } from "@/server/messaging/router";
import { telegram } from "@/server/messaging/telegram";

export const maxDuration = 60;

/**
 * Telegram webhook. Authenticated by the secret token registered with
 * setWebhook; the reply is sent after the 200 so Telegram never times out.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!telegram.verify(req.headers, raw)) {
    log.warn("webhook.telegram_rejected");
    return new NextResponse(null, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const messages = telegram.parse(payload);
  if (messages.length) {
    after(async () => {
      for (const m of messages) await handleInbound(m);
    });
  }
  return NextResponse.json({ ok: true });
}
