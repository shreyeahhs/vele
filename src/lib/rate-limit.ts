import "server-only";
import { db } from "@/server/db";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: Date;
}

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  windowSec: number;
}

/**
 * Fixed-window rate limiting on a Postgres table: one atomic upsert per
 * request, correct across multiple app instances, no extra service to run.
 */
export async function rateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / 1000 / rule.windowSec);
  const bucket = `rl:${key}:${window}`;
  const resetAt = new Date((window + 1) * rule.windowSec * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_buckets ("key", "count", "resetAt")
    VALUES (${bucket}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = rate_limit_buckets."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);
  return { ok: count <= rule.limit, remaining: Math.max(0, rule.limit - count), resetAt };
}

export const limits = {
  agentChat: { limit: 30, windowSec: 60 },
  publicSlots: { limit: 60, windowSec: 60 },
  publicBook: { limit: 5, windowSec: 600 },
  publicManage: { limit: 20, windowSec: 600 },
  webhook: { limit: 600, windowSec: 60 },
  mutation: { limit: 120, windowSec: 60 },
} satisfies Record<string, RateLimitRule>;

export async function purgeExpiredRateLimits(): Promise<number> {
  const res = await db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 60_000) } } });
  return res.count;
}
