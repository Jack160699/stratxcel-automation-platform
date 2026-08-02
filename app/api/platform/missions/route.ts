import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
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
 * requireTenantContext's session client only has RLS-granted SELECT on
 * these tables (see supabase/migrations/20260803121000_missions.sql) — it
 * exists purely to prove "is this user actually a member of this tenant,
 * and with what role," never to perform the mutation itself. The actual
 * read/write goes through the service-role client once that check passes,
 * matching the OwnerContext/ServiceContext split lib/social/db-context.ts
 * already uses for the same reason.
 */
export async function GET(request: Request) {
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
  const missions = await listMissionsForTenant(supabase, tenantId);
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
  const mission = await createAndEstimateMission(supabase, {
    tenantId: body.tenantId,
    createdBy: ctx.userId,
    goalText: body.goalText,
  });

  return Response.json({ mission }, { status: 201 });
}
