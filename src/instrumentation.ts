/**
 * Runs once when the server starts. On a long-running Node server this keeps
 * maintenance going without any external scheduler (every 10 minutes);
 * serverless deployments call /api/cron instead. Both are idempotent.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test" || process.env.DISABLE_INTERNAL_CRON === "true") return;
  const { runMaintenance } = await import("./server/services/maintenance");
  const tick = () => runMaintenance().catch(() => undefined);
  setTimeout(tick, 30_000);
  setInterval(tick, 10 * 60_000).unref?.();
}
