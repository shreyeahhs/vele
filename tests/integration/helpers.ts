import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { provisionUser } from "@/server/services/provisioning";

/** Empties every application table in the test database. */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  if (list) await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export async function createUser(name = "Alex Test", email?: string) {
  const user = await db.user.create({
    data: { id: randomUUID(), name, email: email ?? `${randomUUID().slice(0, 8)}@example.test`, emailVerified: true, timezone: "Europe/London", onboardedAt: new Date() },
  });
  await provisionUser(user.id);
  return user;
}

export async function calendarsOf(userId: string) {
  const cals = await db.calendar.findMany({ where: { userId }, orderBy: { position: "asc" } });
  return { work: cals.find((c) => c.name === "Work")!, personal: cals.find((c) => c.name === "Personal")! };
}
