import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { can } from "@/lib/rbac/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/search/view-mode
 * Body: { tenantId, viewMode: "simple" | "detailed" }
 *
 * Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update
 * 23: the existing Growth toggle (app/api/platform/search/toggle/route.ts)
 * controls search_projects.enabled -- a completely different concept
 * (whether the daily scheduler runs continuous-growth automation for this
 * tenant at all). Collapsing "how much dashboard detail a customer wants
 * to see" into that same field would mean turning down detail could
 * accidentally pause real backend automation, or vice versa. This is a
 * deliberately separate column (search_projects.view_mode) and a
 * deliberately separate route: it only ever changes which of the two
 * existing dashboard components renders the SAME already-computed
 * SearchGrowthDashboardData -- never subscription, entitlement, the
 * website connection, the scheduler, or billing.
 *
 * Gated on mission:view (the weakest real permission, held by every role
 * including viewer) rather than mission:create -- unlike the Growth
 * automation toggle, changing display detail is not a consequential
 * backend action.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { tenantId?: string; viewMode?: string };

  if (!body.tenantId || (body.viewMode !== "simple" && body.viewMode !== "detailed")) {
    return Response.json({ error: "SEARCH_VIEW_MODE_INVALID_REQUEST" }, { status: 400 });
  }

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  if (!can(ctx.role, "mission:view")) {
    return Response.json({ error: "SEARCH_VIEW_MODE_PERMISSION_DENIED" }, { status: 403 });
  }

  const { supabase } = getTenantServiceContext();

  const { data: project } = await supabase
    .from("search_projects")
    .select("id")
    .eq("tenant_id", body.tenantId)
    .maybeSingle();

  if (!project) {
    return Response.json({ error: "SEARCH_VIEW_MODE_NO_PROJECT", message: "Run your first Search Analysis before choosing a dashboard view." }, { status: 400 });
  }

  const { error } = await supabase
    .from("search_projects")
    .update({ view_mode: body.viewMode, updated_at: new Date().toISOString() })
    .eq("id", project.id)
    .eq("tenant_id", body.tenantId);

  if (error) {
    return Response.json({ error: "SEARCH_VIEW_MODE_UPDATE_FAILED", message: error.message }, { status: 500 });
  }

  return Response.json({ viewMode: body.viewMode }, { status: 200 });
}
