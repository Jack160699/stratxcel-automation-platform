import type { ServiceClient } from "./db.ts";

export interface AuditCreditCheckResult {
  eligible: boolean;
  creditAmountCents: number;
  auditOrderId: string | null;
}

function isPromoFundedAudit(order: {
  fulfilment_source?: string | null;
  actual_paid_cents?: number | null;
}): boolean {
  return order.fulfilment_source === "promo" || order.actual_paid_cents === 0;
}

/**
 * Subscription ₹999 credit requires proven cash payment provenance.
 * Go Free / promo complimentary Audits are explicitly ineligible.
 */
export function isAuditCreditProvenanceEligible(order: {
  fulfilment_source?: string | null;
  actual_paid_cents?: number | null;
  credit_eligible_from?: string | null;
  audit_completed_at?: string | null;
  credit_consumed_at?: string | null;
  credit_expires_at?: string | null;
  audit_fee_cents?: number | null;
}): boolean {
  if (isPromoFundedAudit(order)) return false;
  if (!order.audit_completed_at) return false;
  if (!order.credit_eligible_from) return false;
  if (order.credit_consumed_at) return false;
  if (!order.credit_expires_at) return false;
  if (new Date(order.credit_expires_at).getTime() <= Date.now()) return false;
  const cashPaid = order.actual_paid_cents ?? order.audit_fee_cents ?? 99900;
  return cashPaid > 0;
}

/**
 * Checks provisional subscription credit eligibility for a tenant.
 * Commercial Rule:
 * Credit is eligible ONLY AFTER the audit is completed/delivered (audit_completed_at is not null),
 * status is paid/completed, credit_consumed_at is null, credit_expires_at > now,
 * AND the Audit was cash-paid (not Go Free / promo complimentary fulfilment).
 */
export async function checkAuditCreditEligibility(
  supabase: ServiceClient,
  tenantId: string
): Promise<AuditCreditCheckResult> {
  const nowIso = new Date().toISOString();
  const { data: auditOrder, error } = await supabase
    .from("audit_orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .not("audit_completed_at", "is", null)
    .is("credit_consumed_at", null)
    .gt("credit_expires_at", nowIso)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (error || !auditOrder) {
    return { eligible: false, creditAmountCents: 0, auditOrderId: null };
  }

  if (!isAuditCreditProvenanceEligible(auditOrder)) {
    return { eligible: false, creditAmountCents: 0, auditOrderId: null };
  }

  return {
    eligible: true,
    creditAmountCents: auditOrder.audit_fee_cents ?? 99900,
    auditOrderId: auditOrder.id,
  };
}

export async function applyAuditCreditToSubscription(
  supabase: ServiceClient,
  auditOrderId: string,
  subscriptionId: string
): Promise<boolean> {
  const { data: order } = await supabase
    .from("audit_orders")
    .select(
      "id, fulfilment_source, actual_paid_cents, audit_fee_cents, credit_eligible_from, audit_completed_at, credit_consumed_at, credit_expires_at"
    )
    .eq("id", auditOrderId)
    .maybeSingle();

  if (!order || !isAuditCreditProvenanceEligible(order)) {
    return false;
  }

  const { error } = await supabase
    .from("audit_orders")
    .update({
      credit_consumed_at: new Date().toISOString(),
      credit_consumed_subscription_id: subscriptionId,
      credited_towards_subscription_id: subscriptionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auditOrderId)
    .is("credit_consumed_at", null)
    .not("credit_eligible_from", "is", null);

  return !error;
}
