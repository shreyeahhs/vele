#!/usr/bin/env node
// First-run helper: creates `.env` from `.env.example` and fills in freshly
// generated secrets. Existing values are never overwritten.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const examplePath = ".env.example";
const envPath = ".env";

const generated = {
  AUTH_SECRET: () => randomBytes(32).toString("base64"),
  CRON_SECRET: () => randomBytes(24).toString("base64url"),
  TELEGRAM_WEBHOOK_SECRET: () => randomBytes(24).toString("base64url"),
  WHATSAPP_VERIFY_TOKEN: () => randomBytes(18).toString("base64url"),
};

const source = existsSync(envPath) ? readFileSync(envPath, "utf8") : readFileSync(examplePath, "utf8");
let changed = 0;
const lines = source.split(/\r?\n/).map((line) => {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (!match) return line;
  const [, key, value] = match;
  if (value.trim() === "" && generated[key]) {
    changed++;
    return `${key}=${generated[key]()}`;
  }
  return line;
});

writeFileSync(envPath, lines.join("\n"));
console.log(existsSync(envPath) ? `.env ready (${changed} secret(s) generated).` : ".env created.");
console.log("Next: pnpm db:start && pnpm db:migrate && pnpm db:seed && pnpm dev");
