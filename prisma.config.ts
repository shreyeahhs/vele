import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env on its own. Node's built-in loader keeps the CLI
// in sync with Next.js without another dependency; real environment variables
// (CI, production) always win because loadEnvFile never overwrites them.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
