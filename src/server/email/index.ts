import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { db } from "../db";

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface EmailProvider {
  readonly id: "resend" | "brevo" | "console";
  send(message: EmailMessage): Promise<{ id: string | null }>;
}

/** Parses `Name <address>` (or a bare address) from EMAIL_FROM. */
function parseFrom(from: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(from);
  if (m) return { name: m[1].trim() || "Vele", email: m[2].trim() };
  return { name: "Vele", email: from.trim() };
}

class BrevoProvider implements EmailProvider {
  readonly id = "brevo" as const;
  constructor(private readonly apiKey: string) {}
  async send(message: EmailMessage) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: parseFrom(env().EMAIL_FROM),
        to: [{ email: message.to }],
        ...(message.replyTo ? { replyTo: { email: message.replyTo } } : {}),
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        ...(message.attachments?.length ? { attachment: message.attachments.map((a) => ({ name: a.filename, content: Buffer.from(a.content).toString("base64") })) } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string };
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${body.code ?? ""} ${body.message ?? ""}`.trim());
    return { id: body.messageId ?? null };
  }
}

/** What actually happened, so callers (and the assistant) never overstate it. */
export type DeliveryStatus = "sent" | "logged" | "failed";

class ResendProvider implements EmailProvider {
  readonly id = "resend" as const;
  constructor(private readonly apiKey: string) {}
  async send(message: EmailMessage) {
    const { Resend } = await import("resend");
    const client = new Resend(this.apiKey);
    const { data, error } = await client.emails.send({
      from: env().EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
      attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    });
    if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
    return { id: data?.id ?? null };
  }
}

/** Development: nothing leaves the machine. Messages land in the dev outbox (/dev/outbox). */
class ConsoleProvider implements EmailProvider {
  readonly id = "console" as const;
  async send(message: EmailMessage) {
    if (env().NODE_ENV !== "production") {
      console.log(`\n[email:console] to=${message.to} subject="${message.subject}"\n${message.text.slice(0, 1200)}\n`);
    }
    return { id: null };
  }
}

export function emailProvider(): EmailProvider {
  const e = env();
  if (e.EMAIL_PROVIDER === "brevo" && e.EMAIL_API_KEY) return new BrevoProvider(e.EMAIL_API_KEY);
  if (e.EMAIL_PROVIDER === "resend" && e.EMAIL_API_KEY) return new ResendProvider(e.EMAIL_API_KEY);
  return new ConsoleProvider();
}

export interface SendMeta {
  userId?: string;
  bookingId?: string;
  type: string;
}

/**
 * Sends one email and records the outcome as a Notification. With the console
 * provider the status is LOGGED (not SENT), which is what the assistant and UI
 * report. Failed sends keep their rendered payload for the retry job.
 */
export async function sendEmail(message: EmailMessage, meta: SendMeta): Promise<{ status: DeliveryStatus; notificationId: string | null }> {
  const provider = emailProvider();
  const record = meta.userId
    ? await db.notification.create({
        data: {
          userId: meta.userId,
          bookingId: meta.bookingId ?? null,
          channel: "EMAIL",
          type: meta.type,
          recipient: message.to,
          subject: message.subject,
          status: "QUEUED",
          provider: provider.id,
          payload: serialisePayload(message),
        },
      })
    : null;
  try {
    const res = await provider.send(message);
    const status: DeliveryStatus = provider.id === "console" ? "logged" : "sent";
    if (record) {
      await db.notification.update({
        where: { id: record.id },
        data: {
          status: status === "sent" ? "SENT" : "LOGGED",
          providerMessageId: res.id,
          sentAt: new Date(),
          attempts: { increment: 1 },
          // Keep the rendered copy only for the development outbox.
          payload: provider.id === "console" ? serialisePayload(message) : Prisma.DbNull,
        },
      });
    }
    log.info("email.sent", { type: meta.type, provider: provider.id, notificationId: record?.id });
    return { status, notificationId: record?.id ?? null };
  } catch (err) {
    log.error("email.failed", { type: meta.type, provider: provider.id, notificationId: record?.id, err });
    if (record) {
      await db.notification.update({ where: { id: record.id }, data: { status: "FAILED", error: String(err).slice(0, 500), attempts: { increment: 1 } } });
    }
    return { status: "failed", notificationId: record?.id ?? null };
  }
}

function serialisePayload(message: EmailMessage): Prisma.InputJsonValue {
  return {
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: message.replyTo ?? null,
    attachments: (message.attachments ?? []).map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      content: typeof a.content === "string" ? a.content : a.content.toString("utf8"),
    })),
  };
}

/** Retries failed sends (called by the cron endpoint). Gives up after 5 attempts. */
export async function retryFailedEmails(): Promise<number> {
  const failed = await db.notification.findMany({
    where: { channel: "EMAIL", status: "FAILED", attempts: { lt: 5 }, createdAt: { gt: new Date(Date.now() - 2 * 86_400_000) } },
    take: 50,
  });
  let retried = 0;
  const provider = emailProvider();
  for (const n of failed) {
    const p = n.payload as unknown as (EmailMessage & { attachments?: EmailAttachment[] }) | null;
    if (!p) continue;
    try {
      const res = await provider.send(p);
      await db.notification.update({
        where: { id: n.id },
        data: {
          status: provider.id === "console" ? "LOGGED" : "SENT",
          providerMessageId: res.id,
          sentAt: new Date(),
          attempts: { increment: 1 },
          error: null,
          payload: provider.id === "console" ? undefined : Prisma.DbNull,
        },
      });
      retried++;
    } catch (err) {
      await db.notification.update({ where: { id: n.id }, data: { attempts: { increment: 1 }, error: String(err).slice(0, 500) } });
    }
  }
  return retried;
}
