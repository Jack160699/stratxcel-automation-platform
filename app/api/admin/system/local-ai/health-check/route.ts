import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isAuthorizedCron, requireLocalAIAdmin } from "@/lib/local-ai/admin-auth";
import { refreshLocalAIConnectionStatus } from "@/lib/local-ai/connection";

/**
 * POST /api/admin/system/local-ai/health-check
 *
 * The "automatic reconnect/health-check without re-entering a code" path:
 * runs a real probe against the currently-paired machine and persists the
 * result. Dual-authorized -- Vercel's scheduled cron (see vercel.json,
 * CRON_SECRET bearer, same convention as /api/social/package-producer)
 * calls this on a fixed interval so a restart or a temporary tunnel drop
 * is caught without anyone watching the dashboard; an authenticated
 * platform admin can also trigger the same real check on demand.
 */
export async function POST(request: Request) {
  const isCron = isAuthorizedCron(request);
  if (!isCron) {
    const auth = await requireLocalAIAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const service = createSupabaseServiceClient();
  const connection = await refreshLocalAIConnectionStatus(service);
  return NextResponse.json({ connection });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
