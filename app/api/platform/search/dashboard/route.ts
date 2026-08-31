import { getTenantServiceContext, requireTenantReadContext } from "@/lib/tenants/tenant-context";
import { getSearchGrowthDashboardData } from "@stratxcel/search-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Root-caused live via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md:
 * this route went straight to `getTenantServiceContext()` (a raw,
 * RLS-bypassing service-role client) with a `tenantId` taken directly from
 * an unauthenticated query parameter -- no session check, no membership
 * check. Every sibling route in this directory (`../route.ts`,
 * `../run/route.ts`, `../actions/execute/route.ts`) calls
 * `requireTenantContext`/`requireTenantReadContext` first and only reaches
 * for the service client after that passes; this one skipped that step, a
 * real cross-tenant read: any caller supplying a different tenantId could
 * read that tenant's full search-growth dashboard (competitor
 * intelligence, strategy mode, AI-search visibility, connector state).
 * Fixed to match the established, correct pattern.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");

  if (!tenantId) {
    return Response.json({ error: "MISSING_TENANT_ID" }, { status: 400 });
  }

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { supabase } = getTenantServiceContext();

  try {
    const dashboardData = await getSearchGrowthDashboardData(supabase, tenantId);
    return Response.json(dashboardData, { status: 200 });
  } catch (err) {
    return Response.json(
      { error: "DASHBOARD_DATA_FETCH_FAILED", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
