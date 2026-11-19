import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { runMaintenance } from "@/server/services/maintenance";

export const maxDuration = 120;

/**
 * Periodic maintenance for deployments without a long-running process
 * (e.g. a scheduler calling this every 10 minutes). Requires
 * `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse(null, { status: 401 });
  return NextResponse.json(await runMaintenance());
}

export const GET = handle;
export const POST = handle;
