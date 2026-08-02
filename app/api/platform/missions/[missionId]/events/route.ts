import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { listMissionEvents } from "@stratxcel/missions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "mission:view");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();

  // Defense in depth: confirm this mission actually belongs to the tenant
  // the caller was just verified as a member of, rather than trusting that
  // missionId and tenantId in the request agree with each other.
  const { data: mission } = await supabase.from("missions").select("tenant_id").eq("id", missionId).maybeSingle();
  if (!mission || mission.tenant_id !== tenantId) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const events = await listMissionEvents(supabase, missionId);
  return Response.json({ events }, { headers: { "Cache-Control": "no-store" } });
}
