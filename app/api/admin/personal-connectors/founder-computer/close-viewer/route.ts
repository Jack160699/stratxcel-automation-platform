import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getConnectorConnection,
  updateConnectorConnectionMetadata,
  recordConnectorAudit,
} from "@stratxcel/connectors";
import { buildReleaseViewerMetadata } from "@/lib/founder-computer/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/personal-connectors/founder-computer/close-viewer
 * Called when the Founder closes or releases the remote browser viewer.
 * Sets controlLock back to AVAILABLE and records an audit event.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
  }

  const { supabase } = getTenantServiceContext();
  const conn = await getConnectorConnection(supabase as never, "founder_computer", null);
  if (!conn) {
    return NextResponse.json({ ok: false, error: "Founder Computer not initialized" }, { status: 400 });
  }

  const existingMeta = (conn.metadata as Record<string, unknown>) || {};
  const updatedMeta = buildReleaseViewerMetadata(existingMeta);

  await updateConnectorConnectionMetadata(supabase as never, conn.id, updatedMeta);

  await recordConnectorAudit(supabase as never, {
    connectorKey: "founder_computer",
    connectionId: conn.id,
    tenantId: null,
    actorKind: "founder",
    actorId: admin.userId ?? null,
    eventType: "viewer_closed",
    status: "success",
    metadata: {
      userId: admin.userId,
      email: admin.email,
    },
  });

  return NextResponse.json({
    ok: true,
    controlLock: "AVAILABLE",
    message: "Founder browser viewer closed. Control released to available pool.",
  });
}
