import type { ServiceClient } from "../db.ts";
import { appendLedgerEntry } from "../wallet/ledger.ts";
import type { PaymentOrderRow } from "./types.ts";

/**
 * Settles a CAPTURED payment into the wallet ledger, idempotently:
 * reference_type='payment_order' + reference_id=order.id on the ledger
 * entry is checked before crediting, so a webhook redelivered after
 * successful settlement (a very common real-world case — providers retry
 * on any non-2xx, and a network blip after we've already committed can
 * make an already-processed webhook look "unacknowledged" to Razorpay) can
 * never double-credit the wallet. This is a second layer of idempotency on
 * top of recordWebhookEventOnce's unique-provider-event-id protection: that
 * one prevents replaying the same *event*, this one prevents crediting the
 * same *payment* twice even via two different (but logically related)
 * events (e.g. payment.captured redelivered under a different event ID
 * after an ID-generation quirk on the provider's side).
 */
export async function settlePaymentToWallet(
  supabase: ServiceClient,
  order: PaymentOrderRow
): Promise<{ settled: boolean }> {
  const { data: existingEntry } = await supabase
    .from("wallet_ledger_entries")
    .select("id")
    .eq("tenant_id", order.tenant_id)
    .eq("reference_type", "payment_order")
    .eq("reference_id", order.id)
    .eq("entry_type", "credit_purchase")
    .maybeSingle();

  if (existingEntry) return { settled: false };

  await appendLedgerEntry(supabase, {
    tenantId: order.tenant_id,
    entryType: "credit_purchase",
    amountCents: order.amount_cents,
    referenceType: "payment_order",
    referenceId: order.id,
    metadata: { provider: order.provider, mode: order.mode },
  });

  return { settled: true };
}
