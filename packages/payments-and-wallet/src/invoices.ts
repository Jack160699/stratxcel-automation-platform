import type { ServiceClient } from "./db.ts";

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  tenant_id: string;
  payment_order_id: string;
  invoice_type: "subscription" | "audit" | "continuation_pack" | "domain";
  subscription_id: string | null;
  audit_order_id: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  currency: string;
  total_cents: number;
  taxable_value_cents: number;
  gst_cents: number;
  gst_rate_percent: number;
  tax_treatment: "UNDETERMINED" | "CGST_SGST" | "IGST";
  place_of_supply_state: string | null;
  legal_business_name: string | null;
  gstin: string | null;
  billing_address: string | null;
  billing_state: string | null;
  pin_code: string | null;
  payment_reference: string | null;
  status: "issued" | "void" | "credited";
  created_at: string;
}

export interface BillingProfileRow {
  tenant_id: string;
  legal_business_name: string | null;
  gstin: string | null;
  billing_address: string | null;
  billing_state: string | null;
  pin_code: string | null;
  updated_at: string;
}

/**
 * Best-effort GST invoice issuance for a captured payment order. Never called from
 * inside the payment-fulfilment transaction — a failure here must never roll back or
 * block a real payment. Callers should catch and log, not propagate.
 */
export async function issueInvoiceForPaymentOrder(
  supabase: ServiceClient,
  paymentOrderId: string
): Promise<{ issued: boolean; alreadyIssued?: boolean; invoiceId?: string; invoiceNumber?: string; reason?: string }> {
  const { data, error } = await supabase.rpc("issue_invoice_for_payment_order", {
    p_payment_order_id: paymentOrderId,
  });
  if (error) throw new Error(`issue_invoice_for_payment_order RPC failed: ${error.message}`);
  const result = data as { issued: boolean; already_issued?: boolean; invoice_id?: string; invoice_number?: string; reason?: string };
  return {
    issued: result.issued,
    alreadyIssued: result.already_issued,
    invoiceId: result.invoice_id,
    invoiceNumber: result.invoice_number,
    reason: result.reason,
  };
}

export async function listInvoicesForTenant(supabase: ServiceClient, tenantId: string): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list invoices: ${error.message}`);
  return (data as InvoiceRow[]) ?? [];
}

export async function getBillingProfile(supabase: ServiceClient, tenantId: string): Promise<BillingProfileRow | null> {
  const { data, error } = await supabase.from("billing_profiles").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`Failed to load billing profile: ${error.message}`);
  return (data as BillingProfileRow) ?? null;
}

export interface BillingProfileInput {
  legalBusinessName?: string | null;
  gstin?: string | null;
  billingAddress?: string | null;
  billingState?: string | null;
  pinCode?: string | null;
}

/** GSTIN is a loose format check only — never a source of truth for tax validity. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isPlausibleGstin(value: string): boolean {
  return GSTIN_PATTERN.test(value.trim().toUpperCase());
}

export async function upsertBillingProfile(
  supabase: ServiceClient,
  tenantId: string,
  input: BillingProfileInput,
  updatedBy?: string | null
): Promise<BillingProfileRow> {
  if (input.gstin && input.gstin.trim() !== "" && !isPlausibleGstin(input.gstin)) {
    throw new Error("GSTIN does not match the expected 15-character format");
  }

  const { data, error } = await supabase
    .from("billing_profiles")
    .upsert(
      {
        tenant_id: tenantId,
        legal_business_name: input.legalBusinessName?.trim() || null,
        gstin: input.gstin ? input.gstin.trim().toUpperCase() : null,
        billing_address: input.billingAddress?.trim() || null,
        billing_state: input.billingState?.trim() || null,
        pin_code: input.pinCode?.trim() || null,
        updated_by: updatedBy ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    )
    .select("*")
    .single();

  if (error) throw new Error(`Failed to save billing profile: ${error.message}`);
  return data as BillingProfileRow;
}
