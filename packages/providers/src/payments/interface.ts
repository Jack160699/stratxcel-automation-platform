/**
 * Payment Provider Interface & Mock Adapter
 *
 * Wraps Razorpay or any future payment provider into a normalized contract.
 */

import type { CapabilityHealthResult } from "../config/health.ts";

export type NormalizedPaymentStatus =
  | "CREATED"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "CANCELLED";

export interface CreatePaymentOrderInput {
  tenantId: string;
  projectId?: string;
  orderId: string;
  amountCents: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface PaymentOrderResult {
  providerOrderId: string;
  amountCents: number;
  currency: string;
  status: NormalizedPaymentStatus;
  provider: string;
  clientPayload: Record<string, unknown>;
}

export interface VerifyWebhookInput {
  rawBody: string;
  signature: string;
  webhookSecret: string;
}

export interface PaymentWebhookResult {
  isValid: boolean;
  event: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  amountCents?: number;
  currency?: string;
  paymentStatus: NormalizedPaymentStatus;
  notes?: Record<string, string>;
}

export interface RefundInput {
  tenantId: string;
  providerPaymentId: string;
  amountCents: number;
  reason?: string;
}

export interface RefundResult {
  refundId: string;
  providerPaymentId: string;
  amountCents: number;
  status: "PROCESSED" | "PENDING" | "FAILED";
  provider: string;
}

export interface PaymentProvider {
  name: string;
  createOrder: (input: CreatePaymentOrderInput) => Promise<PaymentOrderResult>;
  verifyWebhook: (input: VerifyWebhookInput) => Promise<PaymentWebhookResult>;
  processRefund: (input: RefundInput) => Promise<RefundResult>;
  healthCheck: () => Promise<CapabilityHealthResult>;
}

export class MockPaymentProvider implements PaymentProvider {
  public name = "mock_razorpay";

  public async createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrderResult> {
    const providerOrderId = `order_mock_${Date.now()}`;
    return {
      providerOrderId,
      amountCents: input.amountCents,
      currency: input.currency,
      status: "CREATED",
      provider: this.name,
      clientPayload: { orderId: providerOrderId, amount: input.amountCents, currency: input.currency },
    };
  }

  public async verifyWebhook(input: VerifyWebhookInput): Promise<PaymentWebhookResult> {
    if (!input.signature || input.signature === "invalid") {
      return { isValid: false, event: "unknown", paymentStatus: "FAILED" };
    }
    return {
      isValid: true,
      event: "payment.captured",
      providerOrderId: "order_mock_123",
      providerPaymentId: "pay_mock_123",
      amountCents: 899900,
      currency: "INR",
      paymentStatus: "PAID",
    };
  }

  public async processRefund(input: RefundInput): Promise<RefundResult> {
    return {
      refundId: `rfnd_mock_${Date.now()}`,
      providerPaymentId: input.providerPaymentId,
      amountCents: input.amountCents,
      status: "PROCESSED",
      provider: this.name,
    };
  }

  public async healthCheck(): Promise<CapabilityHealthResult> {
    return {
      capability: "payments",
      provider: this.name,
      status: "READY",
      isReady: true,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export const mockPaymentProvider = new MockPaymentProvider();
