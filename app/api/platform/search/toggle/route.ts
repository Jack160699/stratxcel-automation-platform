import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { can } from "@/lib/rbac/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/search/toggle
 * Body: { tenantId, enabled }
 *
 * Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update
 * 22: search_projects.enabled already exists in the real production
 * schema and is already the real, live gate the daily scheduler filters
 * on (app/api/internal/search/scheduler/route.ts's `.eq("enabled", true)`)
 * -- but nothing anywhere ever let a customer actually change it. This is
 * the one missing write path, not a second/duplicate growth-state system.
 *
 * Turning growth OFF does not delete anything and does not touch
 * subscription/entitlement state (that stays independently enforced by
 * the scheduler's own separate `subscription.status === "active"` check)
 * -- it only pauses this tenant's inclusion in the daily continuous-growth
 * cycle. Requires an existing search_projects row: a tenant with no
 * project yet has nothing to toggle -- their first "Run Search Analysis"
 * (the existing, unchanged flow) is what creates one, defaulting to
 * enabled via the column's own real DB default.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { tenantId?: string; enabled?: boolean };

  if (!body.tenantId || typeof body.enabled !== "boolean") {
    return Response.json({ error: "SEARCH_TOGGLE_INVALID_REQUEST" }, { status: 400 });
  }

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  // Same permission as starting an analysis run -- toggling continuous
  // growth automation is the same class of consequential action.
  if (!can(ctx.role, "mission:create")) {
    return Response.json({ error: "SEARCH_TOGGLE_PERMISSION_DENIED" }, { status: 403 });
  }

  const { supabase } = getTenantServiceContext();

  const { data: project } = await supabase
    .from("search_projects")
    .select("id")
    .eq("tenant_id", body.tenantId)
    .maybeSingle();

  if (!project) {
    return Response.json({ error: "SEARCH_TOGGLE_NO_PROJECT", message: "Run your first Search Analysis before turning Growth on or off." }, { status: 400 });
  }

  const { error } = await supabase
    .from("search_projects")
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq("id", project.id)
    .eq("tenant_id", body.tenantId);

  if (error) {
    return Response.json({ error: "SEARCH_TOGGLE_UPDATE_FAILED", message: error.message }, { status: 500 });
  }

  return Response.json({ growthEnabled: body.enabled }, { status: 200 });
}
