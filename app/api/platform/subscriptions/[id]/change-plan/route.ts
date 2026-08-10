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
 * Provider-managed: Razorpay plan update must succeed before local pending_plan_tier is set.
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

  const { data: sub, error: subErr } = await serviceDb
    .from("subscriptions")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (subErr) return Response.json({ error: `Failed to load subscription: ${subErr.message}` }, { status: 500 });
  if (!sub) return Response.json({ error: "subscription_not_found" }, { status: 404 });

  const providerManaged =
    isProviderManagedSubscription(sub) && isPaymentFeatureEnabled("PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED");

  if (providerManaged) {
    let providerPlanId: string;
    let providerStatus: string;
    try {
      const provider = await updateRazorpaySubscriptionPlan(sub.provider_subscription_id, targetPlanTier);
      providerPlanId = provider.providerPlanId;
      providerStatus = provider.providerStatus;
    } catch (providerErr) {
      console.error("[Subscription Change Plan] Razorpay plan update failed", providerErr);
      return Response.json(
        {
          success: false,
          error: "provider_plan_update_failed",
          reason: providerErr instanceof Error ? providerErr.message : "provider_plan_update_failed",
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { data, error } = await serviceDb.rpc("schedule_subscription_plan_change", {
      p_subscription_id: id,
      p_tenant_id: tenantId,
      p_target_plan_tier: targetPlanTier,
    });

    if (error) {
      return Response.json(
        {
          success: false,
          error: `Provider plan change succeeded but local schedule failed: ${error.message}`,
          providerPlanId,
          providerStatus,
        },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = data as { success: boolean; reason?: string };
    if (!result.success) {
      const status = result.reason === "subscription_not_found" ? 404 : result.reason === "tenant_mismatch" ? 403 : 400;
      return Response.json({ error: result.reason, success: false }, { status });
    }

    await serviceDb
      .from("subscriptions")
      .update({
        provider_plan_id: providerPlanId,
        provider_status: providerStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return Response.json({ ...result, providerPlanId, providerStatus }, { headers: { "Cache-Control": "no-store" } });
  }

  // Legacy Payment-Link path: local schedule only.
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
