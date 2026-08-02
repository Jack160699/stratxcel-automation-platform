export type WalletLedgerEntryType =
  | "credit_purchase"
  | "credit_bonus"
  | "reservation"
  | "reservation_release"
  | "debit_usage"
  | "refund"
  | "adjustment";

export interface WalletAccountRow {
  tenant_id: string;
  balance_cents: number;
  currency: string;
  updated_at: string;
}

export interface WalletLedgerEntryRow {
  id: string;
  tenant_id: string;
  entry_type: WalletLedgerEntryType;
  amount_cents: number;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
