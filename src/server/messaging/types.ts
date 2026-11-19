import type { MessagingProviderId } from "@/generated/prisma/client";

export interface InboundMessage {
  provider: MessagingProviderId;
  /** Telegram chat id or WhatsApp phone number (E.164 without +). */
  externalUserId: string;
  displayName: string | null;
  text: string;
  messageId: string;
}

/**
 * A chat channel that talks to the same assistant as the web app. Adding
 * Slack, SMS or Teams chat means implementing this interface and a webhook
 * route; the agent, tools and confirmations are shared.
 */
export interface MessagingProvider {
  readonly id: MessagingProviderId;
  readonly configured: boolean;
  /** Authenticates an inbound webhook request (signature or shared secret). */
  verify(headers: Headers, rawBody: string): boolean;
  /** Extracts text messages from a webhook payload; ignores everything else. */
  parse(payload: unknown): InboundMessage[];
  send(to: string, text: string): Promise<{ ok: boolean; id?: string | null }>;
}
