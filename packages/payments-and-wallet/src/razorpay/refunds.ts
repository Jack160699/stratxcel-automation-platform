import type { ServiceClient } from "../db.ts";
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
 * Marks a refund processed and routes product reversal atomically via process_refund_atomic_v4 RPC.
 * Production code MUST use the atomic v4 RPC.
 */
export async function markRefundProcessed(
  supabase: ServiceClient,
  input: { refundId: string; order: PaymentOrderRow }
): Promise<{ settled: boolean }> {
  const { data: refund, error: fetchError } = await supabase
    .from("payment_refunds")
    .select("*")
    .eq("id", input.refundId)
    .single();
  if (fetchError) throw new Error(`markRefundProcessed: ${fetchError.message}`);

  const { data: rpcData, error: rpcErr } = await supabase.rpc("process_refund_atomic_v4", {
    p_refund_id: input.refundId,
    p_payment_order_id: input.order.id,
    p_provider_refund_id: refund.provider_refund_id ?? null,
    p_provider_payment_id: input.order.provider_payment_id ?? null,
    p_actual_refund_amount_cents: refund.amount_cents,
    p_provider_refund_status: "processed",
  });

  if (rpcErr) {
    throw new Error(`process_refund_atomic_v4 RPC error: ${rpcErr.message}`);
  }

  if (!rpcData || typeof rpcData !== "object") {
    throw new Error("process_refund_atomic_v4 RPC returned invalid response");
  }

  const res = rpcData as { success?: boolean; status?: string; reason?: string };
  if (!res.success) {
    if (res.status === "MANUAL_REVIEW") {
      return { settled: false };
    }
    throw new Error(`process_refund_atomic_v4 RPC failed: ${res.reason}`);
  }

  return { settled: true };
}
