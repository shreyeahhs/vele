import "server-only";
import { purgeExpiredRateLimits } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { db } from "../db";
import { retryFailedEmails } from "../email";

/** How long assistant transcripts are kept. Calendar data itself is kept until the user deletes it. */
export const CONVERSATION_RETENTION_DAYS = 90;

/**
 * Periodic housekeeping. Idempotent and safe to run from several places at
 * once: the in-process timer (instrumentation.ts) and/or /api/cron.
 */
export async function runMaintenance() {
  const now = new Date();
  const day = 86_400_000;
  const [expired, emails, buckets, conversations, runs, codes, verifications] = await Promise.all([
    db.pendingAction.updateMany({ where: { status: "PENDING", expiresAt: { lt: now } }, data: { status: "EXPIRED", resolvedAt: now } }),
    retryFailedEmails(),
    purgeExpiredRateLimits(),
    db.conversation.deleteMany({ where: { lastMessageAt: { lt: new Date(now.getTime() - CONVERSATION_RETENTION_DAYS * day) } } }),
    db.aiRun.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 180 * day) } } }),
    db.messagingLinkCode.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - day) } } }),
    db.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  const summary = {
    expiredActions: expired.count,
    emailsRetried: emails,
    rateLimitBuckets: buckets,
    conversationsDeleted: conversations.count,
    aiRunsDeleted: runs.count,
    linkCodesDeleted: codes.count,
    verificationsDeleted: verifications.count,
  };
  log.info("maintenance.done", summary);
  return summary;
}
