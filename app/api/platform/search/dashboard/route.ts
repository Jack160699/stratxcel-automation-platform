import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { getSearchGrowthDashboardData } from "@stratxcel/search-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");

  if (!tenantId) {
    return Response.json({ error: "MISSING_TENANT_ID" }, { status: 400 });
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
