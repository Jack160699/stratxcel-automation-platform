import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { listLeads } from "@stratxcel/leads-and-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First API route for @stratxcel/leads-and-crm — the package and its
 * tenant-scoped crm_leads table (supabase/migrations/20260803122000_integration_shadow_tables.sql)
 * already existed with no route consuming them. Plain user-initiated read,
 * fully covered by crm_leads_tenant_read RLS — runs on the authenticated
 * session client. No dedicated Permission entry exists for CRM yet (the
 * closed union in lib/rbac/types.ts is missions/brand/wallet/approvals/
 * handoff/integration only), so this route gates on tenant membership
 * alone, same as app/api/platform/handoffs/route.ts.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const leads = await listLeads(ctx.supabase, tenantId);
  return Response.json({ leads }, { headers: { "Cache-Control": "no-store" } });
}
