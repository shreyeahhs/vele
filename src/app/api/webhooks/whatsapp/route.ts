import { after, NextResponse, type NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { handleInbound } from "@/server/messaging/router";
import { verifyWhatsAppSubscription, whatsapp } from "@/server/messaging/whatsapp";

export const maxDuration = 60;

/** Meta's subscription handshake. */
export async function GET(req: NextRequest) {
  const challenge = verifyWhatsAppSubscription(new URL(req.url).searchParams);
  return challenge ? new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } }) : new NextResponse(null, { status: 403 });
}

/** Messages, authenticated by X-Hub-Signature-256 over the raw body. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!whatsapp.verify(req.headers, raw)) {
    log.warn("webhook.whatsapp_rejected");
    return new NextResponse(null, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const messages = whatsapp.parse(payload);
  if (messages.length) {
    after(async () => {
      for (const m of messages) await handleInbound(m);
    });
  }
  return NextResponse.json({ ok: true });
}
