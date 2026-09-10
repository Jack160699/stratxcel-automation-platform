import { requireTenantReadContext, requireTenantReadPermission, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { PermissionDeniedError } from "@/lib/rbac/policy";
import { fetchMissionControlData } from "@/lib/missions/mission-control-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const { missionId } = await params;
  const tenantId = new URL(request.url).searchParams.get("tenantId");

  if (!tenantId) {
    return Response.json({ error: "tenantId query param is required" }, { status: 400 });
  }

  let isDevAdmin = false;
  if (process.env.NODE_ENV !== "production") {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    isDevAdmin = cookieStore.get("sx_dev_admin")?.value === "1";
  }

  if (!isDevAdmin) {
    const ctx = await requireTenantReadContext(tenantId);
    if (!ctx.ok) {
      return Response.json({ error: ctx.error }, { status: ctx.status });
    }

    try {
      requireTenantReadPermission(ctx, "mission:view");
    } catch (err) {
      if (err instanceof PermissionDeniedError) {
        return Response.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }
  }

  // Use service client to read related tables (worker_heartbeats, approvals, etc.)
  const { supabase } = getTenantServiceContext();
  const data = await fetchMissionControlData(supabase, missionId, tenantId);

  if (!data) {
    return Response.json({ error: "Mission not found or unauthorized" }, { status: 404 });
  }

  return Response.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
