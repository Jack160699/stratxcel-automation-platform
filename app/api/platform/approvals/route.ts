import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { listPendingApprovals } from "@stratxcel/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plain user-initiated read, covered by approvals_tenant_read RLS (see
 * supabase/migrations/20260803121500_approvals_wallet_handoff.sql) — runs
 * on the authenticated session client, not the service-role client.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "approval:decide");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const approvals = await listPendingApprovals(ctx.supabase, tenantId);
  return Response.json({ approvals }, { headers: { "Cache-Control": "no-store" } });
}
