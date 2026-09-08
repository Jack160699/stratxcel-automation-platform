import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getConnectorConnection,
  resolveConnectorHealth,
  updateConnectorHealth,
} from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/personal-connectors/founder-computer/health
 * Runs the health probe for the Founder Computer connector and persists the result.
 * Health is metadata-driven — no live browser call is made.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { supabase } = getTenantServiceContext();
  const connection = await getConnectorConnection(supabase as never, "founder_computer", null);

  const health = await resolveConnectorHealth(
    supabase as never,
    "founder_computer",
    connection,
    null
  );

  if (connection) {
    await updateConnectorHealth(supabase as never, {
      connectionId: connection.id,
      status: health.status,
      discoveredCapabilities: health.discoveredCapabilities,
      lastError: health.lastError,
      lastVerifiedAt: health.lastVerifiedAt ?? null,
      metadata: health.details ?? {},
    });
  }

  return NextResponse.json({
    connectionId: connection?.id ?? null,
    status: health.status,
    discoveredCapabilities: health.discoveredCapabilities,
    lastError: health.lastError,
    lastVerifiedAt: health.lastVerifiedAt,
    details: health.details ?? {},
    checkedBy: admin.email ?? "founder",
    checkedAt: new Date().toISOString(),
  });
}
