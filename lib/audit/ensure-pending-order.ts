import type { ServiceClient } from "@stratxcel/payments-and-wallet";

export const AUDIT_FEE_CENTS = 99900;

export interface EnsurePendingAuditOrderInput {
  tenantId: string;
  guestEmail?: string | null;
  gstInvoice?: Record<string, unknown> | null;
}

export async function ensurePendingAuditOrder(
  service: ServiceClient,
  input: EnsurePendingAuditOrderInput
): Promise<{ auditOrderId: string; paymentLinkId: string | null; created: boolean }> {
  const { data: existing } = await service
    .from("audit_orders")
    .select("id, payment_link_id")
    .eq("tenant_id", input.tenantId)
    .eq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (input.guestEmail || input.gstInvoice) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.guestEmail) patch.guest_email = input.guestEmail;
      if (input.gstInvoice) {
        const { data: current } = await service.from("audit_orders").select("deep_dive_answers").eq("id", existing.id).single();
        patch.deep_dive_answers = { ...(current?.deep_dive_answers ?? {}), gstInvoice: input.gstInvoice };
      }
      await service.from("audit_orders").update(patch).eq("id", existing.id);
    }
    return { auditOrderId: existing.id, paymentLinkId: existing.payment_link_id ?? null, created: false };
  }

  const { data: created, error } = await service
    .from("audit_orders")
    .insert({
      tenant_id: input.tenantId,
      business_name: "Pending — completed in intake",
      audit_fee_cents: AUDIT_FEE_CENTS,
      status: "pending_payment",
      guest_email: input.guestEmail ?? null,
      deep_dive_answers: input.gstInvoice ? { gstInvoice: input.gstInvoice } : {},
      list_price_cents: AUDIT_FEE_CENTS,
      discount_cents: 0,
    })
    .select("id, payment_link_id")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "Could not create audit order");
  }

  return { auditOrderId: created.id, paymentLinkId: created.payment_link_id ?? null, created: true };
}
