import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireLocalAIAdmin } from "@/lib/local-ai/admin-auth";
import { getLocalAIConnectionStatus, refreshLocalAIConnectionStatus } from "@/lib/local-ai/connection";

/**
 * GET /api/admin/system/local-ai/status
 *
 * Cheap read by default (no network call to the Local AI machine). Pass
 * ?refresh=1 to force a real, live probe first -- used by the admin page
 * right after pairing and on its own periodic poll, so "Connected" is
 * never shown from a stale cached row.
 */
export async function GET(request: Request) {
  const auth = await requireLocalAIAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const service = createSupabaseServiceClient();
  const url = new URL(request.url);
  const connection = url.searchParams.get("refresh") === "1" ? await refreshLocalAIConnectionStatus(service) : await getLocalAIConnectionStatus(service);

  return NextResponse.json({ connection });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
