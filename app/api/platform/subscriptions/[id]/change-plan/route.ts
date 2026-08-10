import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getSelfServicePlan,
  isPaymentFeatureEnabled,
  isPlanTier,
  isProviderManagedSubscription,
  updateRazorpaySubscriptionPlan,
} from "@stratxcel/payments-and-wallet";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Schedules a Starter/Growth/Business plan change, effective at next renewal.
 * For provider-managed subscriptions, also schedules the Razorpay plan change at cycle end.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { tenantId, targetPlanTier } = body as { tenantId?: string; targetPlanTier?: string };

  if (!tenantId || !isPlanTier(targetPlanTier)) {
    return Response.json({ error: "Invalid tenantId or targetPlanTier" }, { status: 400 });
  }

  if (!getSelfServicePlan(targetPlanTier)) {
    return Response.json({ error: "target_plan_not_self_service" }, { status: 400 });
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

  const { data: sub } = await serviceDb.from("subscriptions").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();

  if (sub && isProviderManagedSubscription(sub) && isPaymentFeatureEnabled("PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED")) {
    try {
      const provider = await updateRazorpaySubscriptionPlan(sub.provider_subscription_id, targetPlanTier);
      await serviceDb
        .from("subscriptions")
        .update({
          provider_plan_id: provider.providerPlanId,
          provider_status: provider.providerStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    } catch (providerErr) {
      console.error("[Subscription Change Plan] Razorpay plan update failed", providerErr);
      return Response.json(
        {
          ...result,
          providerSyncWarning: providerErr instanceof Error ? providerErr.message : "provider_plan_update_failed",
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
