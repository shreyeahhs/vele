import "server-only";
import type { ContactSource } from "@/generated/prisma/client";
import { db } from "../db";

export interface ContactDTO {
  email: string;
  name: string | null;
  lastMetAt: string | null;
  source: ContactSource;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Remembers people the user has invited or been booked by. */
export async function rememberContacts(userId: string, people: Array<{ email: string; name?: string | null }>, source: ContactSource, metAt?: Date) {
  for (const p of people) {
    const email = p.email.trim().toLowerCase();
    if (!isEmail(email)) continue;
    await db.contact.upsert({
      where: { userId_email: { userId, email } },
      create: { userId, email, name: p.name?.trim() || null, source, lastMetAt: metAt && metAt <= new Date() ? metAt : null },
      update: {
        ...(p.name?.trim() ? { name: p.name.trim() } : {}),
        ...(metAt && metAt <= new Date() ? { lastMetAt: metAt } : {}),
      },
    });
  }
}

/**
 * Finds people by name for the assistant. Matching is on names and addresses
 * the user already has; there is no guessing and no directory lookup.
 */
export async function findContacts(userId: string, query: string, limit = 5): Promise<ContactDTO[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await db.contact.findMany({
    where: {
      userId,
      OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q.toLowerCase() } }],
    },
    orderBy: [{ lastMetAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    take: limit,
  });
  return rows.map((r) => ({ email: r.email, name: r.name, lastMetAt: r.lastMetAt?.toISOString() ?? null, source: r.source }));
}

export async function listContacts(userId: string, limit = 200): Promise<ContactDTO[]> {
  const rows = await db.contact.findMany({ where: { userId }, orderBy: [{ name: "asc" }], take: limit });
  return rows.map((r) => ({ email: r.email, name: r.name, lastMetAt: r.lastMetAt?.toISOString() ?? null, source: r.source }));
}
