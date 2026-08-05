import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) {
    return Response.json({ error: "tenantId query param is required" }, { status: 400 });
  }

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  // Only true platform staff (platform_owner, platform_admin, finance_reviewer) can view global cross-tenant reconciliation logs
  const staffAuth = await requirePlatformStaff(ctx.userId, ["platform_owner", "platform_admin", "finance_reviewer"]);
  if (!staffAuth.ok) {
    return Response.json({ error: staffAuth.error }, { status: staffAuth.status });
  }

  const { supabase } = getTenantServiceContext();
  try {
    const { data: issues, error } = await supabase
      .from("payment_reconciliation_issues")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: `Failed to fetch global reconciliation issues: ${error.message}` }, { status: 500 });
    }

    return Response.json({ issues: issues ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load global reconciliation issues";
    return Response.json({ error: msg }, { status: 500 });
  }
}
