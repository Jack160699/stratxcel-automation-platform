import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { listOpenHandoffs } from "@stratxcel/human-handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plain user-initiated read, covered by human_handoffs_tenant_read RLS
 * (see supabase/migrations/20260803121500_approvals_wallet_handoff.sql) —
 * runs on the authenticated session client, not the service-role client.
 * No separate permission gate: any tenant member may see open handoffs,
 * matching how /api/platform/approvals leaves viewing ungated and only
 * gates the decide action.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const handoffs = await listOpenHandoffs(ctx.supabase, tenantId);
  return Response.json({ handoffs }, { headers: { "Cache-Control": "no-store" } });
}
