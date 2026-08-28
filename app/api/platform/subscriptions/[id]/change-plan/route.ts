import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getSelfServicePlan,
  isPaymentFeatureEnabled,
  isPlanTier,
  isProviderManagedSubscription,
  updateRazorpaySubscriptionPlan,
  calculateProration,
} from "@stratxcel/payments-and-wallet";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function markPlanChangeReconciliationRequired(
  serviceDb: ReturnType<typeof getTenantServiceContext>["supabase"],
  input: {
    subscriptionId: string;
    tenantId: string;
    providerSubscriptionId: string;
    providerPlanId: string;
    providerStatus: string;
    targetPlanTier: string;
    reason: string;
  }
) {
  await serviceDb.from("payment_reconciliation_issues").insert({
    tenant_id: input.tenantId,
    purpose: "subscription_payment",
    failure_reason: `provider_plan_change_local_persist_failed:${input.reason}`,
    resolution_status: "open",
    order_id: input.providerSubscriptionId,
  });
  await serviceDb
    .from("subscriptions")
    .update({
      fulfilment_status: "reconciliation_required",
      provider_status: input.providerStatus,
      provider_plan_id: input.providerPlanId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.subscriptionId)
    .eq("tenant_id", input.tenantId);
}

/**
 * Schedules a Starter/Growth/Business plan change, effective at next renewal.
 * Provider-managed: validate locally first, mutate provider, then persist locally with
 * idempotent fallback + explicit reconciliation_required if persistence still fails.
 * subscription.updated can converge pending_plan_tier from provider plan evidence.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { tenantId, targetPlanTier, effectiveTiming } = body as {
    tenantId?: string;
    targetPlanTier?: string;
    effectiveTiming?: "immediate" | "cycle_end";
  };

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
    // Pre-validate without mutation — mirrors schedule_subscription_plan_change guards.
    if (sub.status !== "active") {
      return Response.json(
        { success: false, error: "subscription_not_active", status: sub.status },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (sub.plan_tier === targetPlanTier) {
      return Response.json(
        { success: false, error: "already_on_target_plan" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

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

    let proration = null;
    if (sub.current_period_start && sub.current_period_end) {
      try {
        proration = calculateProration({
          currentPlanTier: sub.plan_tier,
          targetPlanTier,
          periodStartIso: sub.current_period_start,
          periodEndIso: sub.current_period_end,
          alreadyPaidCents: typeof sub.price_cents === "number" ? sub.price_cents : undefined,
        });
      } catch {
        proration = null;
      }
    }

    if (!error && (data as { success?: boolean })?.success === true) {
      await serviceDb
        .from("subscriptions")
        .update({
          provider_plan_id: providerPlanId,
          provider_status: providerStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      return Response.json(
        { ...(data as object), providerPlanId, providerStatus, proration, effectiveTiming: effectiveTiming ?? "cycle_end" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // Idempotent direct persistence after provider success.
    const { error: directErr } = await serviceDb
      .from("subscriptions")
      .update({
        pending_plan_tier: targetPlanTier,
        plan_change_requested_at: new Date().toISOString(),
        provider_plan_id: providerPlanId,
        provider_status: providerStatus,
        fulfilment_status: sub.fulfilment_status === "reconciliation_required" ? "fulfilled" : sub.fulfilment_status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (!directErr) {
      return Response.json(
        {
          success: true,
          subscription_id: id,
          pending_plan_tier: targetPlanTier,
          providerPlanId,
          providerStatus,
          proration,
          effectiveTiming: effectiveTiming ?? "cycle_end",
          persistence: "direct_idempotent",
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    await markPlanChangeReconciliationRequired(serviceDb, {
      subscriptionId: id,
      tenantId,
      providerSubscriptionId: sub.provider_subscription_id,
      providerPlanId,
      providerStatus,
      targetPlanTier,
      reason: error?.message ?? directErr.message ?? (data as { reason?: string })?.reason ?? "local_persist_failed",
    });

    return Response.json(
      {
        success: false,
        error: "reconciliation_required",
        reason: "provider_plan_change_succeeded_local_persist_failed",
        providerPlanId,
        providerStatus,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
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
