export interface CreateOrderResult {
  orderId: string;
  amountCents: number;
  currency: string;
  mode: "shadow" | "live";
}

export interface CreatePaymentLinkResult {
  linkId: string;
  shortUrl: string | null;
  amountCents: number;
  currency: string;
  mode: "shadow" | "live";
}

export interface PaymentsAdapter {
  readonly mode: "disabled" | "shadow" | "live";
  createOrder(input: { tenantId: string; amountCents: number; currency?: string; receipt?: string }): Promise<CreateOrderResult>;
  createPaymentLink(input: {
    tenantId: string;
    amountCents: number;
    currency?: string;
    description?: string;
    customerContact?: string;
  }): Promise<CreatePaymentLinkResult>;
}

export type PaymentMode = "test" | "live";

export interface PaymentOrderRow {
  id: string;
  tenant_id: string;
  provider: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  amount_cents: number;
  currency: string;
  state: "CREATED" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  mode: PaymentMode;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RazorpayWebhookEventRow {
  id: string;
  provider_event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
}

export type PaymentRefundStatus = "PENDING" | "PROCESSED" | "FAILED";

export interface PaymentRefundRow {
  id: string;
  tenant_id: string;
  payment_order_id: string;
  provider_refund_id: string | null;
  amount_cents: number;
  status: PaymentRefundStatus;
  reason: string | null;
  requested_by: string | null;
  created_at: string;
  processed_at: string | null;
}
