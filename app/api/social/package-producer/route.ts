import { NextResponse, type NextRequest } from "next/server";
import { runPackageAutopilotProducer } from "@/lib/social/package-producer";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET/POST /api/social/package-producer
 * The recurring Package Autopilot producer: ensures every active package's
 * current service period has its future slots planned, and prepares real
 * content (Brand-Brain-grounded, via Gemini) for whatever falls inside the
 * near-term preparation horizon. Same Vercel Cron auth convention as
 * /api/social/worker (see that route's doc comment) — CRON_SECRET bearer
 * token, fails closed if unset.
 *
 * Runs on its own, less time-sensitive schedule (see vercel.json) — the
 * ACTUAL publish of a due, already-prepared item happens on
 * /api/social/worker's tighter 15-minute cadence, not here.
 */
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return auth === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runPackageAutopilotProducer(createSupabaseServiceClient() as Parameters<typeof runPackageAutopilotProducer>[0]);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}

export const dynamic = "force-dynamic";
export const maxDuration = 120;
