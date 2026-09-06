import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireLocalAIAdmin } from "@/lib/local-ai/admin-auth";
import { disconnectLocalAIConnection } from "@/lib/local-ai/connection";

/**
 * POST /api/admin/system/local-ai/disconnect
 * Body: { connectionId: string }
 *
 * Deliberate, manual disconnect. Keeps the paired key -- Reconnect can
 * re-verify the same machine without asking for a new pairing code.
 */
export async function POST(request: Request) {
  const auth = await requireLocalAIAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { connectionId?: string } | null;
  if (!body?.connectionId) return NextResponse.json({ error: "connectionId is required" }, { status: 400 });

  const service = createSupabaseServiceClient();
  const result = await disconnectLocalAIConnection(service, body.connectionId);
  if (!result.ok) return NextResponse.json({ error: result.errorMessage }, { status: 400 });

  return NextResponse.json({ ok: true, connection: result.connection });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
