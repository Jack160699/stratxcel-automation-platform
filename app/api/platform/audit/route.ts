import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { listAuditEvents } from "@stratxcel/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plain user-initiated read, covered by audit_events_tenant_read RLS (see
 * supabase/migrations/20260803120000_platform_tenants_rbac_audit.sql) —
 * runs on the authenticated session client, not the service-role client.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const events = await listAuditEvents(ctx.supabase, tenantId, 100);
  return Response.json({ events }, { headers: { "Cache-Control": "no-store" } });
}
