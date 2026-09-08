import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { getConnectorDefinition, listConnectorAuditLogs } from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/admin/connectors/[key]/audit?tenantId=<id>
 * Lists sanitized audit events for a connector.
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

  const logs = await listConnectorAuditLogs(supabase as never, {
    connectorKey: key,
    tenantId,
    limit: 50,
  });

  return Response.json({ auditLogs: logs });
}
