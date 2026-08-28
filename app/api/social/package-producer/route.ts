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
// Debug Silent Automation Failure mission: confirmed live via Vercel
// runtime logs -- this exact route hit "Vercel Runtime Timeout Error:
// Task timed out after 120 seconds" mid-run, after ~24 successful real
// Gemini calls (visible ai_execution_success events, real cost/tokens
// logged) -- genuine progress, just not enough budget to finish preparing
// a full near-term batch (prepareNearTermPackageItems processes up to 20
// due items per run, each needing 1-2 real AI calls plus quality-gate
// retries). Not a crash or a config error -- a real, honest resource
// budget that was too small for the real workload. Matches the same
// maxDuration=300 budget this codebase already uses for every other
// AI-heavy route (see app/api/platform/social/autopilot/route.ts's own
// comment on this exact pattern).
export const maxDuration = 300;
