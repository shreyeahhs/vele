/**
 * Development seed: creates the demo account (demo@vele.local) with a sample
 * week to explore the app with. Sign in with the credentials it prints.
 * Run with `pnpm db:seed`. Refuses to run against production.
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed demo data in production.");
    process.exit(1);
  }
  // Imported after the environment is loaded: the database client reads it on import.
  const { ensureDemoUser, DEMO_EMAIL, DEMO_PASSWORD } = await import("../src/server/services/demo");
  const { db } = await import("../src/server/db");
  const userId = await ensureDemoUser();
  const events = await db.calendarEvent.count({ where: { userId } });
  console.log(`Demo account ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD} (${events} events).`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
