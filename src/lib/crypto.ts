import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Secrets Vele hands out (booking manage links, private booking invites,
 * messaging link codes) are random tokens stored only as SHA-256 hashes, so
 * a database leak does not leak working links.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hmacSha256(secret: string, data: string | Buffer, encoding: "hex" | "base64url" = "hex"): string {
  return createHmac("sha256", secret).update(data).digest(encoding);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Salted hash of an IP for audit and rate-limit keys; the raw IP is never stored. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(`${env().AUTH_SECRET ?? "dev"}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}
