import type { ServiceClient } from "../db.ts";
import { getIntegrationMode, getRazorpayCredentials } from "../flags.ts";
import type { CreateOrderResult, CreatePaymentLinkResult, PaymentsAdapter } from "./types.ts";

export class IntegrationDisabledError extends Error {
  constructor(integration: string) {
    super(`${integration} integration is disabled — set its _INTEGRATION_MODE env var to "shadow" to enable shadow-mode testing`);
    this.name = "IntegrationDisabledError";
  }
}

/**
 * Shadow mode never calls Razorpay's API, even the test endpoint — it only
 * records what order/payment-link *would* be created into payment_orders
 * (state CREATED, mode 'test'). Making a real call, even against
 * RAZORPAY_TEST_KEY_ID, is a deliberate later step that needs the account
 * owner to confirm test credentials are actually configured first; this
 * phase only proves the interface, state machine, and bookkeeping are
 * correct. Order creation and payment-link creation share the same
 * disabled/shadow/live gating and the same underlying payment_orders row
 * shape — a payment link is just an order with a shareable URL attached.
 */
export function createRazorpayAdapter(supabase: ServiceClient): PaymentsAdapter {
  const mode = getIntegrationMode("RAZORPAY_INTEGRATION_MODE");

  return {
    mode,
    async createOrder(input): Promise<CreateOrderResult> {
      if (mode === "disabled") throw new IntegrationDisabledError("Razorpay");

      if (mode === "shadow") {
        const { data, error } = await supabase
          .from("payment_orders")
          .insert({
            tenant_id: input.tenantId,
            provider: "razorpay",
            amount_cents: input.amountCents,
            currency: input.currency ?? "INR",
            mode: "test",
            metadata: { receipt: input.receipt ?? null, kind: "order" },
          })
          .select("id")
          .single();
        if (error) throw new Error(`Razorpay shadow order failed: ${error.message}`);
        return { orderId: data.id as string, amountCents: input.amountCents, currency: input.currency ?? "INR", mode: "shadow" };
      }

      // mode === "live" — gated entirely behind the env var; not reachable
      // from any default configuration and not called anywhere in this
      // codebase yet.
      const { keyId, keySecret } = getRazorpayCredentials(mode)!;

      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: input.amountCents,
          currency: input.currency ?? "INR",
          receipt: input.receipt,
        }),
      });
      if (!response.ok) {
        throw new Error(`Razorpay live order creation failed: HTTP ${response.status}`);
      }
      const result = (await response.json()) as { id: string; amount: number; currency: string };
      return { orderId: result.id, amountCents: result.amount, currency: result.currency, mode };
    },

    async createPaymentLink(input): Promise<CreatePaymentLinkResult> {
      if (mode === "disabled") throw new IntegrationDisabledError("Razorpay");

      if (mode === "shadow") {
        const { data, error } = await supabase
          .from("payment_orders")
          .insert({
            tenant_id: input.tenantId,
            provider: "razorpay",
            amount_cents: input.amountCents,
            currency: input.currency ?? "INR",
            mode: "test",
            metadata: { description: input.description ?? null, customerContact: input.customerContact ?? null, kind: "payment_link" },
          })
          .select("id")
          .single();
        if (error) throw new Error(`Razorpay shadow payment link failed: ${error.message}`);
        return { linkId: data.id as string, shortUrl: null, amountCents: input.amountCents, currency: input.currency ?? "INR", mode: "shadow" };
      }

      const { keyId, keySecret } = getRazorpayCredentials(mode)!;

      const response = await fetch("https://api.razorpay.com/v1/payment_links", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: input.amountCents,
          currency: input.currency ?? "INR",
          description: input.description,
          customer: input.customerContact ? { contact: input.customerContact } : undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(`Razorpay live payment link creation failed: HTTP ${response.status}`);
      }
      const result = (await response.json()) as { id: string; short_url?: string; amount: number; currency: string };
      return { linkId: result.id, shortUrl: result.short_url ?? null, amountCents: result.amount, currency: result.currency, mode };
    },
  };
}
