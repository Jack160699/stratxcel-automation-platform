import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getConnectorDefinition,
  getConnectorConnection,
  createConnectorConnection,
  disconnectConnectorConnection,
  updateConnectorHealth,
  resolveConnectorHealth,
  listCapabilityAssignments,
} from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/admin/connectors/[key]?tenantId=<id>
 * Single-connector detail: definition + connection + a freshly computed
 * real health check + its capability assignments.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
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
  const assignments = connection ? await listCapabilityAssignments(supabase as never, connection.id) : [];

  return Response.json({ definition: def, connection, health, assignments });
}

/**
 * POST /api/platform/admin/connectors/[key]
 * Connects a connector: vaults the raw secret and creates/updates the
 * connection row, then runs a real health check immediately so the
 * response reflects genuine reachability, not just "secret accepted".
 * Body: { tenantId?: string, rawSecret?: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const { key } = await params;
  const def = getConnectorDefinition(key);
  if (!def) return Response.json({ error: "UNKNOWN_CONNECTOR" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { tenantId?: string; rawSecret?: string };
  const tenantId = def.scopeLevel === "platform" ? null : (body.tenantId ?? null);
  if (def.scopeLevel === "company" && !tenantId) {
    return Response.json({ error: "tenantId is required for a company-scoped connector" }, { status: 400 });
  }

  const { supabase } = getTenantServiceContext();

  try {
    const connection = await createConnectorConnection(supabase as never, {
      connectorKey: key,
      tenantId,
      rawSecret: body.rawSecret ?? null,
      connectedByUserId: admin.userId,
    });
    const health = await resolveConnectorHealth(supabase as never, key, connection, tenantId);
    await updateConnectorHealth(supabase as never, { connectionId: connection.id, status: health.status, discoveredCapabilities: health.discoveredCapabilities, lastError: health.lastError });
    return Response.json({ ok: true, connection: { ...connection, status: health.status }, health });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "CONNECT_FAILED" }, { status: 400 });
  }
}

/**
 * DELETE /api/platform/admin/connectors/[key]?tenantId=<id>
 * Disconnects: revokes the vaulted secret entirely (never just a status flag).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const { key } = await params;
  const def = getConnectorDefinition(key);
  if (!def) return Response.json({ error: "UNKNOWN_CONNECTOR" }, { status: 404 });

  const url = new URL(request.url);
  const tenantId = def.scopeLevel === "platform" ? null : url.searchParams.get("tenantId");
  const { supabase } = getTenantServiceContext();

  const connection = await getConnectorConnection(supabase as never, key, tenantId);
  if (!connection) return Response.json({ error: "NOT_CONNECTED" }, { status: 404 });

  await disconnectConnectorConnection(supabase as never, connection.id);
  return Response.json({ ok: true });
}
