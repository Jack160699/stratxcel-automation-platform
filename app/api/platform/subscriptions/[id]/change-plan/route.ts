import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { isPlanTier } from "@stratxcel/payments-and-wallet";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Schedules a Launch <-> Growth plan change, effective at the subscription's next
 * renewal (no mid-cycle proration is invented — see billing page copy). The target
 * plan tier is validated server-side against the canonical plan list; Custom Growth
 * is rejected here too since it is quote-led, not a self-service target.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { tenantId, targetPlanTier } = body as { tenantId?: string; targetPlanTier?: string };

  if (!tenantId || !isPlanTier(targetPlanTier)) {
    return Response.json({ error: "Invalid tenantId or targetPlanTier" }, { status: 400 });
  }

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "wallet:topup");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase: serviceDb } = getTenantServiceContext();

  const { data, error } = await serviceDb.rpc("schedule_subscription_plan_change", {
    p_subscription_id: id,
    p_tenant_id: tenantId,
    p_target_plan_tier: targetPlanTier,
  });

  if (error) return Response.json({ error: `Failed to schedule plan change: ${error.message}` }, { status: 500 });

  const result = data as { success: boolean; reason?: string };
  if (!result.success) {
    const status = result.reason === "subscription_not_found" ? 404 : result.reason === "tenant_mismatch" ? 403 : 400;
    return Response.json({ error: result.reason }, { status });
  }

  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
