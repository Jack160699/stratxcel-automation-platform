import { requireTenantContext, requireTenantReadContext, requireTenantReadPermission, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { createAndEstimateMission, listMissionsForTenant } from "@stratxcel/missions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First real server-side wiring of the Phase 2/3 platform modules:
 * tenant auth -> RBAC -> @stratxcel/missions. tenantId travels as a query
 * param / body field rather than a path segment because there's no
 * tenant-switcher UI yet (dashboard work is a later phase) — this is an
 * interim contract, not the final API shape.
 *
 * GET is a plain user-initiated read, fully covered by missions_tenant_read
 * RLS (see supabase/migrations/20260803121000_missions.sql) — it runs on
 * requireTenantContext's own session client (ctx.supabase), never a
 * service-role client. POST (mission creation) stays on the service client:
 * there is no INSERT policy granting authenticated users write access to
 * missions, matching the OwnerContext/ServiceContext split
 * lib/social/db-context.ts uses for the same reason.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requireTenantReadPermission(ctx, "mission:view");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const missions = await listMissionsForTenant(ctx.supabase, tenantId);
  return Response.json({ missions }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { tenantId?: string; goalText?: string };
  if (!body.tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });
  if (!body.goalText || !body.goalText.trim()) return Response.json({ error: "goalText is required" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "mission:create");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const { retrieveHermesMissionContext, createEngineeringBrief, isCorePlatformCodingDenied } = await import("@/lib/hermes/operating-brain");
  const { delegateHermesSpecialist } = await import("@/lib/hermes/specialists");
  const { requiresOwnerApproval } = await import("@/lib/hermes/coding-boundary");
  const hermesContext = await retrieveHermesMissionContext(supabase as never, body.tenantId).catch(() => null);
  if (isCorePlatformCodingDenied(body.goalText)) {
    return Response.json({
      status: "ENGINEERING_REQUIRED",
      brief: createEngineeringBrief({ missingCapability: "core platform coding", goal: body.goalText }),
    }, { status: 409 });
  }
  if (requiresOwnerApproval(body.goalText)) {
    return Response.json({
      status: "APPROVAL_REQUIRED",
      blocker: "OWNER_APPROVAL",
      message: "This action is high-risk and needs explicit owner approval before Hermes can proceed.",
      hermesContext,
    }, { status: 409 });
  }
  const specialist = delegateHermesSpecialist(body.goalText);
  const mission = await createAndEstimateMission(supabase, {
    tenantId: body.tenantId,
    createdBy: ctx.userId,
    goalText: body.goalText,
  });

  return Response.json({ mission, hermesContext, specialist }, { status: 201 });
}
