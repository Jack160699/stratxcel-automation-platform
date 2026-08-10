import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import {
  cancelRazorpaySubscriptionAtPeriodEnd,
  isPaymentFeatureEnabled,
  isProviderManagedSubscription,
} from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function markCancelReconciliationRequired(
  serviceDb: ReturnType<typeof getTenantServiceContext>["supabase"],
  input: {
    subscriptionId: string;
    tenantId: string;
    providerSubscriptionId: string;
    providerStatus: string;
    reason: string;
  }
) {
  await serviceDb.from("payment_reconciliation_issues").insert({
    tenant_id: input.tenantId,
    purpose: "subscription_payment",
    failure_reason: `provider_cancel_local_persist_failed:${input.reason}`,
    resolution_status: "open",
    order_id: input.providerSubscriptionId,
  });
  await serviceDb
    .from("subscriptions")
    .update({
      fulfilment_status: "reconciliation_required",
      provider_status: input.providerStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.subscriptionId)
    .eq("tenant_id", input.tenantId);
}

/**
 * Cancel-at-period-end (default) or un-cancel a subscription the caller owns.
 * Provider-managed: validate locally first, mutate provider, then persist locally with
 * idempotent fallback + explicit reconciliation_required if persistence still fails.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { tenantId, cancel } = body as { tenantId?: string; cancel?: boolean };

  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "wallet:topup");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase: serviceDb } = getTenantServiceContext();
  const wantCancel = cancel !== false;

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

  if (providerManaged && wantCancel) {
    // Pre-validate without mutation — mirrors set_subscription_cancellation guards.
    if (!["active", "past_due"].includes(sub.status)) {
      return Response.json(
        { success: false, error: "subscription_not_cancellable_in_current_state", status: sub.status },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    let providerStatus: string;
    try {
      const provider = await cancelRazorpaySubscriptionAtPeriodEnd(sub.provider_subscription_id, true);
      providerStatus = provider.providerStatus;
    } catch (providerErr) {
      console.error("[Subscription Cancel] Razorpay cancel_at_cycle_end failed", providerErr);
      return Response.json(
        {
          success: false,
          error: "provider_cancel_failed",
          reason: providerErr instanceof Error ? providerErr.message : "provider_cancel_failed",
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { data, error } = await serviceDb.rpc("set_subscription_cancellation", {
      p_subscription_id: id,
      p_tenant_id: tenantId,
      p_cancel: true,
    });

    if (!error && (data as { success?: boolean })?.success === true) {
      await serviceDb
        .from("subscriptions")
        .update({ provider_status: providerStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
      return Response.json({ ...(data as object), providerStatus }, { headers: { "Cache-Control": "no-store" } });
    }

    // Idempotent direct persistence after provider success.
    const { error: directErr } = await serviceDb
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        cancel_requested_at: sub.cancel_requested_at ?? new Date().toISOString(),
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
          cancel_at_period_end: true,
          providerStatus,
          persistence: "direct_idempotent",
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    await markCancelReconciliationRequired(serviceDb, {
      subscriptionId: id,
      tenantId,
      providerSubscriptionId: sub.provider_subscription_id,
      providerStatus,
      reason: error?.message ?? directErr.message ?? (data as { reason?: string })?.reason ?? "local_persist_failed",
    });

    return Response.json(
      {
        success: false,
        error: "reconciliation_required",
        reason: "provider_cancel_succeeded_local_persist_failed",
        providerStatus,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Legacy Payment-Link path (and provider-managed un-cancel): local RPC only.
  const { data, error } = await serviceDb.rpc("set_subscription_cancellation", {
    p_subscription_id: id,
    p_tenant_id: tenantId,
    p_cancel: wantCancel,
  });

  if (error) return Response.json({ error: `Failed to update cancellation: ${error.message}` }, { status: 500 });

  const result = data as { success: boolean; reason?: string; access_until?: string };
  if (!result.success) {
    const status = result.reason === "subscription_not_found" ? 404 : result.reason === "tenant_mismatch" ? 403 : 400;
    return Response.json({ error: result.reason }, { status });
  }

  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
