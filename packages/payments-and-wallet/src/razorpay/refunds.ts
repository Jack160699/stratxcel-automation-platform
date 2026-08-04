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
 * Marks a refund processed and reverses the wallet credit atomically.
 * Updates order state to REFUNDED or PARTIALLY_REFUNDED.
 * Surfaces any non-idempotent state transition failures so caller can retry.
 */
export async function markRefundProcessed(
  supabase: ServiceClient,
  input: { refundId: string; order: PaymentOrderRow }
): Promise<{ settled: boolean }> {
  const { data: refund, error: fetchError } = await supabase.from("payment_refunds").select("*").eq("id", input.refundId).single();
  if (fetchError) throw new Error(`markRefundProcessed: ${fetchError.message}`);

  // Atomically reverse wallet credit
  const atomicResult = await appendLedgerEntryAtomic(supabase, {
    tenantId: input.order.tenant_id,
    entryType: "adjustment",
    amountCents: -Math.abs(refund.amount_cents),
    referenceType: "payment_refund",
    referenceId: input.refundId,
    metadata: { paymentOrderId: input.order.id, reason: "razorpay_refund_reversal" },
  });

  const { error: updateError } = await supabase
    .from("payment_refunds")
    .update({ status: "PROCESSED", processed_at: new Date().toISOString() })
    .eq("id", input.refundId);
  if (updateError) throw new Error(`markRefundProcessed db update: ${updateError.message}`);

  // Calculate total cumulative processed refunds for this payment order
  const { data: processedRefunds, error: sumError } = await supabase
    .from("payment_refunds")
    .select("amount_cents")
    .eq("payment_order_id", input.order.id)
    .eq("status", "PROCESSED");

  if (sumError) throw new Error(`markRefundProcessed calculate sum: ${sumError.message}`);

  const totalRefunded = (processedRefunds ?? []).reduce((sum, r) => sum + (r.amount_cents || 0), 0);
  const nextOrderState = totalRefunded >= input.order.amount_cents ? "REFUNDED" : "PARTIALLY_REFUNDED";

  // State transition: surface error if state transition fails unexpectedly (treat already-correct state as idempotent)
  if (input.order.state !== nextOrderState) {
    if (input.order.state === "REFUNDED" && nextOrderState === "PARTIALLY_REFUNDED") {
      // Order is already in terminal REFUNDED state; do not attempt invalid backwards transition
    } else {
      await transitionPaymentOrder(supabase, {
        orderId: input.order.id,
        nextState: nextOrderState,
      });
    }
  }

  return { settled: atomicResult.settled };
}
