import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) {
    return Response.json({ error: "tenantId query param is required" }, { status: 400 });
  }

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "wallet:view");
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      return Response.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  try {
    const { data: issues, error } = await supabase
      .from("payment_reconciliation_issues")
      .select("*")
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: `Failed to fetch reconciliation issues: ${error.message}` }, { status: 500 });
    }

    return Response.json({ issues: issues ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load reconciliation issues";
    return Response.json({ error: msg }, { status: 500 });
  }
}
