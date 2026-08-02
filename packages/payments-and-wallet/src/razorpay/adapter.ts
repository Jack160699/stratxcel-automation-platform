import type { ServiceClient } from "../db.ts";
import { getIntegrationMode } from "../flags.ts";
import type { CreateOrderResult, PaymentsAdapter } from "./types.ts";

export class IntegrationDisabledError extends Error {
  constructor(integration: string) {
    super(`${integration} integration is disabled — set its _INTEGRATION_MODE env var to "shadow" to enable shadow-mode testing`);
    this.name = "IntegrationDisabledError";
  }
}

/**
 * Shadow mode never calls Razorpay's API, even the test endpoint — it only
 * records what order *would* be created into payment_shadow_orders. Making
 * a real call, even against RAZORPAY_TEST_KEY_ID, is a deliberate later
 * step that needs the account owner to confirm test credentials are
 * actually configured first; this phase only proves the interface and
 * bookkeeping are correct.
 */
export function createRazorpayAdapter(supabase: ServiceClient): PaymentsAdapter {
  const mode = getIntegrationMode("RAZORPAY_INTEGRATION_MODE");

  return {
    mode,
    async createOrder(input): Promise<CreateOrderResult> {
      if (mode === "disabled") throw new IntegrationDisabledError("Razorpay");

      if (mode === "shadow") {
        const { data, error } = await supabase
          .from("payment_shadow_orders")
          .insert({
            tenant_id: input.tenantId,
            provider: "razorpay_test",
            amount_cents: input.amountCents,
            currency: input.currency ?? "INR",
            metadata: { receipt: input.receipt ?? null },
          })
          .select("id")
          .single();
        if (error) throw new Error(`Razorpay shadow order failed: ${error.message}`);
        return { orderId: data.id as string, amountCents: input.amountCents, currency: input.currency ?? "INR", mode: "shadow" };
      }

      // mode === "live" — gated entirely behind the env var; not reachable
      // from any default configuration and not called anywhere yet.
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        throw new Error("RAZORPAY_INTEGRATION_MODE is 'live' but RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are not set");
      }

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
      return { orderId: result.id, amountCents: result.amount, currency: result.currency, mode: "live" };
    },
  };
}
