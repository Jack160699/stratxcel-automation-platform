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
 * Provider-managed Razorpay subscriptions also cancel_at_cycle_end at the provider.
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

  const { data, error } = await serviceDb.rpc("set_subscription_cancellation", {
    p_subscription_id: id,
    p_tenant_id: tenantId,
    p_cancel: cancel !== false,
  });

  if (error) return Response.json({ error: `Failed to update cancellation: ${error.message}` }, { status: 500 });

  const result = data as { success: boolean; reason?: string; access_until?: string };
  if (!result.success) {
    const status = result.reason === "subscription_not_found" ? 404 : result.reason === "tenant_mismatch" ? 403 : 400;
    return Response.json({ error: result.reason }, { status });
  }

  const { data: sub } = await serviceDb.from("subscriptions").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();

  if (
    sub &&
    isProviderManagedSubscription(sub) &&
    isPaymentFeatureEnabled("PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED") &&
    cancel !== false
  ) {
    try {
      const provider = await cancelRazorpaySubscriptionAtPeriodEnd(sub.provider_subscription_id, true);
      await serviceDb
        .from("subscriptions")
        .update({ provider_status: provider.providerStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
    } catch (providerErr) {
      console.error("[Subscription Cancel] Razorpay cancel_at_cycle_end failed", providerErr);
      return Response.json(
        {
          ...result,
          providerSyncWarning: providerErr instanceof Error ? providerErr.message : "provider_cancel_failed",
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
