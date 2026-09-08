import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getConnectorDefinition,
  getConnectorConnection,
  createConnectorConnection,
  disconnectConnectorConnection,
  updateConnectorHealth,
  updateConnectorBudgetAndUsage,
  setConnectorEnabled,
  resolveConnectorHealth,
  listCapabilityAssignments,
  discoverConnectorCapabilities,
} from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/admin/connectors/[key]?tenantId=<id>
 * Single-connector detail: definition + connection + real health check + assignments.
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

  return Response.json({
    definition: def,
    connection: connection
      ? {
          ...connection,
          last_verified_at: connection.last_verified_at ?? health.lastVerifiedAt ?? null,
        }
      : null,
    health,
    assignments,
  });
}

/**
 * POST /api/platform/admin/connectors/[key]
 * Connects or reconnects a connector: vaults secret, creates/updates row,
 * runs real health probe, and triggers live capability discovery.
 * Body: { tenantId?: string, rawSecret?: string, budgetLimitUsd?: number, rateLimitPerMinute?: number }
 */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const { key } = await params;
  const def = getConnectorDefinition(key);
  if (!def) return Response.json({ error: "UNKNOWN_CONNECTOR" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    tenantId?: string;
    rawSecret?: string;
    budgetLimitUsd?: number;
    rateLimitPerMinute?: number;
  };
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
      budgetLimitUsd: body.budgetLimitUsd,
      rateLimitPerMinute: body.rateLimitPerMinute,
    });

    const health = await resolveConnectorHealth(supabase as never, key, connection, tenantId);
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

    return Response.json({
      ok: true,
      connection: {
        ...connection,
        status: health.status,
        last_verified_at: health.lastVerifiedAt ?? null,
      },
      health,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "CONNECT_FAILED" }, { status: 400 });
  }
}

/**
 * PATCH /api/platform/admin/connectors/[key]?tenantId=<id>
 * Updates connector configuration: enabled flag, budget limits, or rate limits.
 * Body: { enabled?: boolean, budgetLimitUsd?: number | null, rateLimitPerMinute?: number | null }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
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

  const body = (await request.json().catch(() => ({}))) as {
    enabled?: boolean;
    budgetLimitUsd?: number | null;
    rateLimitPerMinute?: number | null;
  };

  if (body.enabled !== undefined) {
    await setConnectorEnabled(supabase as never, connection.id, body.enabled);
  }

  if (body.budgetLimitUsd !== undefined || body.rateLimitPerMinute !== undefined) {
    await updateConnectorBudgetAndUsage(supabase as never, connection.id, {
      budgetLimitUsd: body.budgetLimitUsd,
      rateLimitPerMinute: body.rateLimitPerMinute,
    });
  }

  return Response.json({ ok: true });
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
