import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireLocalAIAdmin } from "@/lib/local-ai/admin-auth";
import { reconnectLocalAIConnection } from "@/lib/local-ai/connection";

/**
 * POST /api/admin/system/local-ai/reconnect
 * Body: { connectionId: string }
 *
 * Re-runs a real probe against the SAME stored key -- no new pairing code
 * required, satisfying "automatic reconnect ... without asking me to
 * enter another code" for the manual/on-demand case (the scheduled
 * health-check route covers the fully automatic case).
 */
export async function POST(request: Request) {
  const auth = await requireLocalAIAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { connectionId?: string } | null;
  if (!body?.connectionId) return NextResponse.json({ error: "connectionId is required" }, { status: 400 });

  const service = createSupabaseServiceClient();
  const result = await reconnectLocalAIConnection(service, body.connectionId);
  if (!result.ok) return NextResponse.json({ error: result.errorMessage }, { status: 400 });

  return NextResponse.json({ ok: true, connection: result.connection });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
