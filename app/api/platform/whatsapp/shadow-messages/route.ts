import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { listShadowMessagesForTenant } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plain user-initiated read, covered by whatsapp_shadow_tenant_read RLS
 * (see supabase/migrations/20260803122000_integration_shadow_tables.sql) —
 * runs on the authenticated session client, not the service-role client.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const messages = await listShadowMessagesForTenant(ctx.supabase, tenantId);
  return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}
