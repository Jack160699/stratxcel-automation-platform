import type { ServiceClient } from "./db.ts";

export interface AuditCreditCheckResult {
  eligible: boolean;
  creditAmountCents: number;
  auditOrderId: string | null;
}

export async function checkAuditCreditEligibility(
  supabase: ServiceClient,
  tenantId: string
): Promise<AuditCreditCheckResult> {
  const nowIso = new Date().toISOString();
  const { data: auditOrder, error } = await supabase
    .from("audit_orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "paid")
    .is("credited_towards_subscription_id", null)
    .gt("credit_expires_at", nowIso)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (error || !auditOrder) {
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
  const { error } = await supabase
    .from("audit_orders")
    .update({
      credited_towards_subscription_id: subscriptionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auditOrderId);

  return !error;
}
