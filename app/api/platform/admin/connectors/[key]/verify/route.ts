import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getConnectorDefinition,
  getConnectorConnection,
  resolveConnectorHealth,
  updateConnectorHealth,
  discoverConnectorCapabilities,
  recordConnectorAudit,
} from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/admin/connectors/[key]/verify?tenantId=<id>
 * Triggers an on-demand live health verification and capability discovery probe.
 */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const { key } = await params;
  const def = getConnectorDefinition(key);
  if (!def) return Response.json({ error: "UNKNOWN_CONNECTOR" }, { status: 404 });

  const url = new URL(request.url);
  const tenantId = def.scopeLevel === "platform" ? null : url.searchParams.get("tenantId");
  const { supabase } = getTenantServiceContext();

  const connection = await getConnectorConnection(supabase as never, key, tenantId);
  const health = await resolveConnectorHealth(supabase as never, key, connection, tenantId);

  if (connection) {
    await updateConnectorHealth(supabase as never, {
      connectionId: connection.id,
      status: health.status,
      discoveredCapabilities: health.discoveredCapabilities,
      lastError: health.lastError,
      lastVerifiedAt: health.lastVerifiedAt,
    });

    if (health.status === "healthy" || health.status === "connected") {
      await discoverConnectorCapabilities(supabase as never, {
        connectionId: connection.id,
        connectorKey: key,
        tenantId,
        actorKind: "founder",
        actorId: admin.userId,
      });
    }

    await recordConnectorAudit(supabase as never, {
      connectorKey: key,
      connectionId: connection.id,
      tenantId,
      actorKind: "founder",
      actorId: admin.userId,
      eventType: "verified",
      status: health.status === "healthy" || health.status === "connected" ? "success" : "failure",
      metadata: { status: health.status, lastError: health.lastError },
    });
  }

  return Response.json({
    ok: true,
    health,
    lastVerifiedAt: health.lastVerifiedAt ?? null,
  });
}
