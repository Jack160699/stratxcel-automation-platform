import type { ServiceClient } from "../db.ts";
import { appendLedgerEntryAtomic } from "../wallet/ledger.ts";
import { transitionPaymentOrder } from "./payment-orders.ts";
import type { PaymentOrderRow, PaymentRefundRow } from "./types.ts";

export async function requestRefund(
  supabase: ServiceClient,
  input: { tenantId: string; paymentOrderId: string; amountCents: number; reason?: string; requestedBy?: string | null }
): Promise<PaymentRefundRow> {
  const { data, error } = await supabase
    .from("payment_refunds")
    .insert({
      tenant_id: input.tenantId,
      payment_order_id: input.paymentOrderId,
      amount_cents: input.amountCents,
      reason: input.reason ?? null,
      requested_by: input.requestedBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`requestRefund: ${error.message}`);
  return data as PaymentRefundRow;
}

/**
 * Marks a refund processed and routes reversal by payment purpose.
 * Calls atomic process_refund_atomic_v3 PostgreSQL function when rpc method is available.
 * Only wallet_topup refunds reverse the wallet.
 * Other purposes perform product-specific reversals.
 */
export async function markRefundProcessed(
  supabase: ServiceClient,
  input: { refundId: string; order: PaymentOrderRow }
): Promise<{ settled: boolean }> {
  const { data: refund, error: fetchError } = await supabase.from("payment_refunds").select("*").eq("id", input.refundId).single();
  if (fetchError) throw new Error(`markRefundProcessed: ${fetchError.message}`);

  if (typeof supabase?.rpc === "function") {
    const { data: rpcData, error: rpcErr } = await supabase.rpc("process_refund_atomic_v3", {
      p_refund_id: input.refundId,
      p_payment_order_id: input.order.id,
      p_provider_refund_id: refund.provider_refund_id ?? null,
      p_amount_cents: refund.amount_cents,
    });

    if (rpcErr) {
      throw new Error(`markRefundProcessed RPC error: ${rpcErr.message}`);
    }

    if (!rpcData || typeof rpcData !== "object") {
      throw new Error("markRefundProcessed RPC returned invalid response");
    }

    const res = rpcData as { success?: boolean; status?: string; reason?: string };
    if (!res.success) {
      if (res.status === "MANUAL_REVIEW") {
        return { settled: false };
      }
      throw new Error(`markRefundProcessed RPC failed: ${res.reason}`);
    }

    return { settled: true };
  }

  // Fallback for non-RPC test mocks
  const purpose = input.order.payment_purpose;
  let settled = false;

  if (purpose === "wallet_topup") {
    // ONLY wallet_topup reverses wallet credit
    const atomicResult = await appendLedgerEntryAtomic(supabase, {
      tenantId: input.order.tenant_id,
      entryType: "adjustment",
      amountCents: -Math.abs(refund.amount_cents),
      referenceType: "payment_refund",
      referenceId: input.refundId,
      metadata: { paymentOrderId: input.order.id, reason: "razorpay_refund_reversal" },
    });
    settled = atomicResult.settled;
  } else if (purpose === "subscription_payment") {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, status")
      .eq("payment_link_id", (input.order.metadata as Record<string, unknown>)?.link_id)
      .maybeSingle();
    if (sub && sub.status !== "refunded" && sub.status !== "cancelled") {
      await supabase
        .from("subscriptions")
        .update({ status: "refunded", refunded_at: new Date().toISOString(), fulfilment_status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", sub.id);
    }
    settled = true;
  } else if (purpose === "audit_fee") {
    const { data: auditOrder } = await supabase
      .from("audit_orders")
      .select("id, credited_towards_subscription_id")
      .eq("payment_link_id", (input.order.metadata as Record<string, unknown>)?.link_id)
      .maybeSingle();
    if (auditOrder && !auditOrder.credited_towards_subscription_id) {
      await supabase
        .from("audit_orders")
        .update({ status: "pending_payment", updated_at: new Date().toISOString() })
        .eq("id", auditOrder.id);
    }
    settled = true;
  } else if (purpose === "continuation_pack") {
    const { data: pack } = await supabase
      .from("continuation_packs")
      .select("id, metric, extra_units, subscription_id, tenant_id, status")
      .eq("payment_link_id", (input.order.metadata as Record<string, unknown>)?.link_id)
      .maybeSingle();
    if (pack && pack.status === "applied") {
      const { data: entitlement } = await supabase
        .from("usage_entitlements")
        .select("id, limit_amount, current_usage")
        .eq("tenant_id", pack.tenant_id)
        .eq("metric", pack.metric)
        .maybeSingle();
      if (entitlement) {
        const newLimit = Math.max(entitlement.current_usage, entitlement.limit_amount - pack.extra_units);
        await supabase
          .from("usage_entitlements")
          .update({ limit_amount: newLimit, updated_at: new Date().toISOString() })
          .eq("id", entitlement.id);
      }
      await supabase
        .from("continuation_packs")
        .update({ status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", pack.id);
    }
    settled = true;
  } else if (purpose === "domain_purchase" || purpose === "domain_renewal") {
    const { data: domain } = await supabase
      .from("domains")
      .select("id, status")
      .eq("payment_link_id", (input.order.metadata as Record<string, unknown>)?.link_id)
      .maybeSingle();
    if (domain) {
      if (domain.status === "paid_pending_registration" || domain.status === "renewal_paid_pending_provider" || domain.status === "pending_payment") {
        await supabase
          .from("domains")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", domain.id);
      }
    }
    settled = true;
  } else {
    console.error(`[Refund] Unknown payment_purpose for order ${input.order.id}: ${purpose}`);
    settled = false;
  }

  const { error: updateError } = await supabase
    .from("payment_refunds")
    .update({ status: "PROCESSED", processed_at: new Date().toISOString() })
    .eq("id", input.refundId);
  if (updateError) throw new Error(`markRefundProcessed db update: ${updateError.message}`);

  const { data: processedRefunds, error: sumError } = await supabase
    .from("payment_refunds")
    .select("amount_cents")
    .eq("payment_order_id", input.order.id)
    .eq("status", "PROCESSED");

  if (sumError) throw new Error(`markRefundProcessed calculate sum: ${sumError.message}`);

  const totalRefunded = (processedRefunds ?? []).reduce((sum, r) => sum + (r.amount_cents || 0), 0);
  const nextOrderState = totalRefunded >= input.order.amount_cents ? "REFUNDED" : "PARTIALLY_REFUNDED";

  if (input.order.state !== nextOrderState) {
    if (input.order.state === "REFUNDED" && nextOrderState === "PARTIALLY_REFUNDED") {
    } else {
      await transitionPaymentOrder(supabase, {
        orderId: input.order.id,
        nextState: nextOrderState,
      });
    }
  }

  return { settled };
}
