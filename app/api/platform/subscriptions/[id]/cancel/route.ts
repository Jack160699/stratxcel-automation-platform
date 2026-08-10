import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import {
  cancelRazorpaySubscriptionAtPeriodEnd,
  isPaymentFeatureEnabled,
  isProviderManagedSubscription,
} from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cancel-at-period-end (default) or un-cancel a subscription the caller owns.
 * Provider-managed: provider cancel must succeed before local cancellation is scheduled.
 * Legacy Payment-Link subscriptions keep the local-only RPC path.
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

    if (error) {
      return Response.json(
        {
          success: false,
          error: `Provider cancelled but local update failed: ${error.message}`,
          providerStatus,
        },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = data as { success: boolean; reason?: string; access_until?: string };
    if (!result.success) {
      const status = result.reason === "subscription_not_found" ? 404 : result.reason === "tenant_mismatch" ? 403 : 400;
      return Response.json({ error: result.reason, success: false }, { status });
    }

    await serviceDb
      .from("subscriptions")
      .update({ provider_status: providerStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    return Response.json({ ...result, providerStatus }, { headers: { "Cache-Control": "no-store" } });
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
