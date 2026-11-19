import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { hashIp } from "@/lib/crypto";
import { log } from "@/lib/logger";
import { db } from "../db";

export type ActorType = "user" | "assistant" | "system" | "public";

/**
 * Append-only audit trail. Metadata holds identifiers, counts and flags only:
 * never event titles, descriptions, attendee addresses or tokens.
 */
export async function audit(entry: {
  userId: string | null;
  actorType: ActorType;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  ip?: string | null;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId,
        actorType: entry.actorType,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ipHash: hashIp(entry.ip ?? null),
      },
    });
  } catch (err) {
    log.error("audit.write_failed", { action: entry.action, err });
  }
}
