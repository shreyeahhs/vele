import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * One Prisma client per process. In development, Next.js hot reload would
 * otherwise create a new pool on every change.
 */
function create() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
  return new PrismaClient({ adapter, log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"] });
}

const globalForPrisma = globalThis as unknown as { __velePrisma?: ReturnType<typeof create> };

export const db = globalForPrisma.__velePrisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.__velePrisma = db;

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
