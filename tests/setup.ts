import { existsSync } from "node:fs";

// Load .env for integration tests, then point Prisma at the isolated test database.
if (existsSync(".env")) process.loadEnvFile(".env");
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.EMAIL_PROVIDER = "console";
// Live model tests are opt-in (LIVE_AI=1) so the normal suite never spends API credit.
if (!process.env.LIVE_AI) {
  process.env.GEMINI_API_KEY = "";
  process.env.GEMINI_API_KEYS = "";
}
