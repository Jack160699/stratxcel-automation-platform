import type { ServiceClient } from "../db.ts";
import { assertPaymentTransition, type PaymentState } from "./payment-state-machine.ts";
import type { PaymentOrderRow } from "./types.ts";

export async function getPaymentOrderByProviderOrderId(
  supabase: ServiceClient,
  providerOrderId: string
): Promise<PaymentOrderRow | null> {
  const { data, error } = await supabase
    .from("payment_orders")
    .select("*")
    .eq("provider", "razorpay")
    .eq("provider_order_id", providerOrderId)
    .maybeSingle();
  if (error) throw new Error(`getPaymentOrderByProviderOrderId: ${error.message}`);
  return (data as PaymentOrderRow) ?? null;
}

export async function transitionPaymentOrder(
  supabase: ServiceClient,
  input: { orderId: string; nextState: PaymentState; providerPaymentId?: string }
): Promise<PaymentOrderRow> {
  const { data: current, error: fetchError } = await supabase.from("payment_orders").select("*").eq("id", input.orderId).single();
  if (fetchError) throw new Error(`transitionPaymentOrder: ${fetchError.message}`);

  assertPaymentTransition(current.state as PaymentState, input.nextState);

  const { data, error } = await supabase
    .from("payment_orders")
    .update({
      state: input.nextState,
      provider_payment_id: input.providerPaymentId ?? current.provider_payment_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.orderId)
    .select("*")
    .single();
  if (error) throw new Error(`transitionPaymentOrder: ${error.message}`);
  return data as PaymentOrderRow;
}
