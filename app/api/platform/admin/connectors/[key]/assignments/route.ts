import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { getConnectorDefinition, getConnectorConnection, createConnectorConnection, resolveConnectorHealth, updateConnectorHealth, createCapabilityAssignment, listCapabilityAssignments } from "@stratxcel/connectors";
import type { ConnectorAutonomy } from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_AUTONOMY: ConnectorAutonomy[] = ["read", "prepare", "execute", "approval_required", "disabled"];

/** GET /api/platform/admin/connectors/[key]/assignments?tenantId=<id> */
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
  if (!connection) return Response.json({ assignments: [] });
  const assignments = await listCapabilityAssignments(supabase as never, connection.id);
  return Response.json({ assignments });
}

/**
 * POST /api/platform/admin/connectors/[key]/assignments
 * Assigns one of the connector's real, discovered capabilities to a
 * company/department/agent with an autonomy level (Sections 29-30).
 * Creates the connector_connections anchor row first if one doesn't exist
 * yet (e.g. assigning an mcp_managed connector like aws, which is never
 * "connected" with a secret).
 * Body: { tenantId?: string, capabilityKey: string, department?: string, agentDefinitionId?: string, autonomy: ConnectorAutonomy }
 */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const { key } = await params;
  const def = getConnectorDefinition(key);
  if (!def) return Response.json({ error: "UNKNOWN_CONNECTOR" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    tenantId?: string;
    capabilityKey?: string;
    department?: string;
    agentDefinitionId?: string;
    autonomy?: string;
  };
  if (!body.capabilityKey) return Response.json({ error: "capabilityKey is required" }, { status: 400 });
  if (!body.autonomy || !VALID_AUTONOMY.includes(body.autonomy as ConnectorAutonomy)) {
    return Response.json({ error: `autonomy must be one of ${VALID_AUTONOMY.join(", ")}` }, { status: 400 });
  }
  if (!def.declaredCapabilities.includes(body.capabilityKey)) {
    return Response.json({ error: `${body.capabilityKey} is not a declared capability of ${key} -- see the connector definition` }, { status: 400 });
  }

  const tenantId = def.scopeLevel === "platform" ? null : (body.tenantId ?? null);
  if (def.scopeLevel === "company" && !tenantId) {
    return Response.json({ error: "tenantId is required for a company-scoped connector" }, { status: 400 });
  }

  const { supabase } = getTenantServiceContext();

  let connection = await getConnectorConnection(supabase as never, key, tenantId);
  if (!connection) {
    connection = await createConnectorConnection(supabase as never, { connectorKey: key, tenantId, rawSecret: null, connectedByUserId: admin.userId });
    const health = await resolveConnectorHealth(supabase as never, key, connection, tenantId);
    await updateConnectorHealth(supabase as never, { connectionId: connection.id, status: health.status, discoveredCapabilities: health.discoveredCapabilities, lastError: health.lastError });
  }

  const assignment = await createCapabilityAssignment(supabase as never, {
    connectionId: connection.id,
    capabilityKey: body.capabilityKey,
    tenantId,
    department: body.department ?? null,
    agentDefinitionId: body.agentDefinitionId ?? null,
    autonomy: body.autonomy as ConnectorAutonomy,
  });

  return Response.json({ ok: true, assignment });
}
