/**
 * Points your Telegram bot at this deployment. Run once per public URL:
 *   pnpm telegram:webhook https://your-domain.example
 * Uses TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment.
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

async function main() {
  const base = process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!base || !/^https:\/\//.test(base)) {
    console.error("Pass the public https:// URL of this deployment, e.g. pnpm telegram:webhook https://vele.example.com");
    process.exit(1);
  }
  const { registerTelegramWebhook } = await import("../src/server/messaging/telegram");
  const url = new URL("/api/webhooks/telegram", base).toString();
  const res = await registerTelegramWebhook(url);
  console.log(res.ok ? `Telegram will now deliver messages to ${url}` : `Telegram refused: ${res.description ?? "unknown error"}`);
  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
