import type { ServiceClient } from "../db.ts";
import { appendLedgerEntry } from "../wallet/ledger.ts";
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
 * Marks a refund processed and reverses the wallet credit — mirrors
 * settlePaymentToWallet's idempotency approach (check for an existing
 * ledger entry referencing this specific refund before writing another).
 * Also transitions payment_orders to PARTIALLY_REFUNDED or REFUNDED based on total refund sum.
 */
export async function markRefundProcessed(
  supabase: ServiceClient,
  input: { refundId: string; order: PaymentOrderRow }
): Promise<{ settled: boolean }> {
  const { data: existingEntry } = await supabase
    .from("wallet_ledger_entries")
    .select("id")
    .eq("tenant_id", input.order.tenant_id)
    .eq("reference_type", "payment_refund")
    .eq("reference_id", input.refundId)
    .maybeSingle();

  const { data: refund, error: fetchError } = await supabase.from("payment_refunds").select("*").eq("id", input.refundId).single();
  if (fetchError) throw new Error(`markRefundProcessed: ${fetchError.message}`);

  if (!existingEntry) {
    await appendLedgerEntry(supabase, {
      tenantId: input.order.tenant_id,
      entryType: "adjustment",
      amountCents: -Math.abs(refund.amount_cents),
      referenceType: "payment_refund",
      referenceId: input.refundId,
      metadata: { paymentOrderId: input.order.id, reason: "razorpay_refund_reversal" },
    });
  }

  const { error } = await supabase
    .from("payment_refunds")
    .update({ status: "PROCESSED", processed_at: new Date().toISOString() })
    .eq("id", input.refundId);
  if (error) throw new Error(`markRefundProcessed: ${error.message}`);

  // Calculate cumulative processed refunds for this payment order
  const { data: processedRefunds } = await supabase
    .from("payment_refunds")
    .select("amount_cents")
    .eq("payment_order_id", input.order.id)
    .eq("status", "PROCESSED");

  const totalRefunded = (processedRefunds ?? []).reduce((sum, r) => sum + (r.amount_cents || 0), 0);
  const nextOrderState = totalRefunded >= input.order.amount_cents ? "REFUNDED" : "PARTIALLY_REFUNDED";

  if (input.order.state !== nextOrderState) {
    try {
      await transitionPaymentOrder(supabase, {
        orderId: input.order.id,
        nextState: nextOrderState,
      });
    } catch {
      // Ignore transition error if state already updated
    }
  }

  return { settled: !existingEntry };
}
