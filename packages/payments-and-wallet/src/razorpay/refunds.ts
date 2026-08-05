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
 * Marks a refund processed and routes product reversal atomically via process_refund_atomic_v5 RPC.
 * Production code MUST use the atomic v5 RPC and pass authentic provider evidence.
 */
export async function markRefundProcessed(
  supabase: ServiceClient,
  input: {
    refundId: string;
    order: PaymentOrderRow;
    providerRefundId: string;
    providerPaymentId: string;
    actualRefundAmountCents: number;
    providerRefundStatus: string;
    providerEventId?: string | null;
  }
): Promise<{ settled: boolean }> {
  if (!input.providerRefundId || !input.providerPaymentId || !input.actualRefundAmountCents || !input.providerRefundStatus) {
    throw new Error("markRefundProcessed: Missing required provider refund evidence");
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc("process_refund_atomic_v5", {
    p_refund_id: input.refundId,
    p_payment_order_id: input.order.id,
    p_provider_refund_id: input.providerRefundId,
    p_provider_payment_id: input.providerPaymentId,
    p_actual_refund_amount_cents: input.actualRefundAmountCents,
    p_provider_refund_status: input.providerRefundStatus,
    p_provider_event_id: input.providerEventId ?? null,
  });

  if (rpcErr) {
    throw new Error(`process_refund_atomic_v5 RPC error: ${rpcErr.message}`);
  }

  if (!rpcData || typeof rpcData !== "object") {
    throw new Error("process_refund_atomic_v5 RPC returned invalid response");
  }

  const res = rpcData as { success?: boolean; status?: string; reason?: string };
  if (!res.success) {
    if (res.status === "MANUAL_REVIEW") {
      return { settled: false };
    }
    throw new Error(`process_refund_atomic_v5 RPC failed: ${res.reason}`);
  }

  return { settled: true };
}
