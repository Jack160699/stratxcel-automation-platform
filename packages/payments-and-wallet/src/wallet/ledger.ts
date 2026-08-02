import type { ServiceClient } from "../db.ts";
import type { WalletAccountRow, WalletLedgerEntryRow, WalletLedgerEntryType } from "./types.ts";

export class InsufficientFundsError extends Error {
  readonly tenantId: string;
  readonly requiredCents: number;
  readonly availableCents: number;
  constructor(tenantId: string, requiredCents: number, availableCents: number) {
    super(`Insufficient funds for tenant ${tenantId}: need ${requiredCents}, have ${availableCents}`);
    this.name = "InsufficientFundsError";
    this.tenantId = tenantId;
    this.requiredCents = requiredCents;
    this.availableCents = availableCents;
  }
}

// amount_cents is always the signed delta applied to the wallet balance.
// Only "adjustment" is allowed to be either sign — every other entry type
// has one correct direction, enforced here so a caller can never silently
// credit a tenant via a mistyped "debit_usage" with a positive amount.
const ENTRY_TYPE_SIGN: Record<Exclude<WalletLedgerEntryType, "adjustment">, "positive" | "negative"> = {
  credit_purchase: "positive",
  credit_bonus: "positive",
  reservation: "negative",
  reservation_release: "positive",
  debit_usage: "negative",
  refund: "positive",
};

export function assertValidLedgerAmount(entryType: WalletLedgerEntryType, amountCents: number): void {
  if (entryType === "adjustment") return;
  const expectedSign = ENTRY_TYPE_SIGN[entryType];
  if (expectedSign === "positive" && amountCents < 0) {
    throw new Error(`Ledger entry '${entryType}' must have a non-negative amount, got ${amountCents}`);
  }
  if (expectedSign === "negative" && amountCents > 0) {
    throw new Error(`Ledger entry '${entryType}' must have a non-positive amount, got ${amountCents}`);
  }
}

export async function getWalletAccount(supabase: ServiceClient, tenantId: string): Promise<WalletAccountRow> {
  const { data, error } = await supabase.from("wallet_accounts").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`getWalletAccount: ${error.message}`);
  if (data) return data as WalletAccountRow;

  const { data: created, error: createError } = await supabase
    .from("wallet_accounts")
    .insert({ tenant_id: tenantId, balance_cents: 0 })
    .select("*")
    .single();
  if (createError) throw new Error(`getWalletAccount: failed to lazily create account: ${createError.message}`);
  return created as WalletAccountRow;
}

/**
 * Appends a ledger entry and updates the cached balance. This is a
 * read-modify-write, not a single atomic SQL statement — acceptable for
 * this foundation phase where nothing writes to the ledger concurrently
 * yet, but a real concurrency-safe implementation (a Postgres function
 * doing the increment server-side) is required before any live spend path
 * is wired up. Tracked as a follow-up, not silently glossed over.
 */
export async function appendLedgerEntry(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    entryType: WalletLedgerEntryType;
    amountCents: number;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ entry: WalletLedgerEntryRow; account: WalletAccountRow }> {
  assertValidLedgerAmount(input.entryType, input.amountCents);

  const account = await getWalletAccount(supabase, input.tenantId);
  const nextBalance = account.balance_cents + input.amountCents;

  if (nextBalance < 0) {
    throw new InsufficientFundsError(input.tenantId, -input.amountCents, account.balance_cents);
  }

  const { data: entry, error: entryError } = await supabase
    .from("wallet_ledger_entries")
    .insert({
      tenant_id: input.tenantId,
      entry_type: input.entryType,
      amount_cents: input.amountCents,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();
  if (entryError) throw new Error(`appendLedgerEntry: ${entryError.message}`);

  const { data: updatedAccount, error: updateError } = await supabase
    .from("wallet_accounts")
    .update({ balance_cents: nextBalance, updated_at: new Date().toISOString() })
    .eq("tenant_id", input.tenantId)
    .select("*")
    .single();
  if (updateError) throw new Error(`appendLedgerEntry: failed to update balance: ${updateError.message}`);

  return { entry: entry as WalletLedgerEntryRow, account: updatedAccount as WalletAccountRow };
}

export async function reserveFunds(
  supabase: ServiceClient,
  input: { tenantId: string; amountCents: number; referenceType: string; referenceId: string }
) {
  return appendLedgerEntry(supabase, {
    tenantId: input.tenantId,
    entryType: "reservation",
    amountCents: -Math.abs(input.amountCents),
    referenceType: input.referenceType,
    referenceId: input.referenceId,
  });
}

export async function releaseReservation(
  supabase: ServiceClient,
  input: { tenantId: string; amountCents: number; referenceType: string; referenceId: string }
) {
  return appendLedgerEntry(supabase, {
    tenantId: input.tenantId,
    entryType: "reservation_release",
    amountCents: Math.abs(input.amountCents),
    referenceType: input.referenceType,
    referenceId: input.referenceId,
  });
}
