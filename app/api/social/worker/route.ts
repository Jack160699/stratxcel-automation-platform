import { NextResponse, type NextRequest } from "next/server";
import { runWorkerBatch } from "@/lib/social/worker";
import { runPackageAutopilotBatch } from "@/lib/social/package-autopilot";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET/POST /api/social/worker
 * The ONLY externally-reachable trigger for the publishing worker.
 * Authenticated via Vercel's built-in Cron convention: set an environment
 * variable named exactly CRON_SECRET, and Vercel automatically attaches
 * `Authorization: Bearer <CRON_SECRET>` to requests it sends to Cron Job
 * paths (see vercel.json). Any other caller must present that same header
 * value manually.
 *
 * The admin "Run worker now" button does NOT call this route — it invokes
 * runWorkerBatch() directly from a server action, in-process, so no secret
 * ever needs to travel over the network or near client code. This route
 * exists purely for Vercel Cron and for ops to trigger a run out-of-band
 * (e.g. via curl) if needed.
 */
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // fail closed if the secret isn't configured
  return auth === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runWorkerBatch();
  // Package Autopilot's execution tick shares this same cron slot (every 15
  // minutes) rather than adding a new one — publishing due package items
  // should stay close to their scheduled time, unlike planning/preparation
  // which runs on its own, less time-sensitive cron
  // (app/api/social/package-producer/route.ts). A failure here never blocks
  // or is blocked by the regular job worker above.
  const packageResult = await runPackageAutopilotBatch(createSupabaseServiceClient() as Parameters<typeof runPackageAutopilotBatch>[0]).catch((err) => ({
    processed: 0,
    error: err instanceof Error ? err.message : "package batch failed",
  }));
  return NextResponse.json({ ...result, packageAutopilot: packageResult });
}

export async function POST(req: NextRequest) {
  return GET(req);
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
