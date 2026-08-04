import type { ServiceClient } from "../db.ts";
import { appendLedgerEntryAtomic } from "../wallet/ledger.ts";
import type { PaymentOrderRow } from "./types.ts";

/**
 * Settles a CAPTURED payment into the wallet ledger atomically:
 * Uses atomic PostgreSQL function / appendLedgerEntryAtomic with unique
 * constraint protection so double settlement is physically impossible.
 */
export async function settlePaymentToWallet(
  supabase: ServiceClient,
  order: PaymentOrderRow
): Promise<{ settled: boolean }> {
  const result = await appendLedgerEntryAtomic(supabase, {
    tenantId: order.tenant_id,
    entryType: "credit_purchase",
    amountCents: order.amount_cents,
    referenceType: "payment_order",
    referenceId: order.id,
    metadata: { provider: order.provider, mode: order.mode },
  });

  return { settled: result.settled };
}
