// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/razorpay-adapter.test.ts
import assert from "node:assert/strict";
import type { ServiceClient } from "../db.ts";
import { createRazorpayAdapter, IntegrationDisabledError } from "../razorpay/adapter.ts";
import { getIntegrationMode, isPaymentFeatureEnabled } from "../flags.ts";
import { verifyRazorpayWebhookSignature } from "../razorpay/webhook.ts";

async function run() {
  const originalEnv = { ...process.env };

  try {
    // 1. Missing or unconfigured env var defaults to "disabled"
    delete process.env.RAZORPAY_INTEGRATION_MODE;
    assert.equal(getIntegrationMode("RAZORPAY_INTEGRATION_MODE"), "disabled");

    const fakeClient = {} as ServiceClient;
    let adapter = createRazorpayAdapter(fakeClient);
    assert.equal(adapter.mode, "disabled");

    // 2. disabled mode blocks order creation before provider call
    await assert.rejects(
      () => adapter.createOrder({ tenantId: "t1", amountCents: 10000 }),
      IntegrationDisabledError
    );

    // 3. disabled mode blocks payment-link creation before provider call
    await assert.rejects(
      () => adapter.createPaymentLink({ tenantId: "t1", amountCents: 10000 }),
      IntegrationDisabledError
    );

    // 4. Invalid mode defaults to "disabled" and blocks provider call
    process.env.RAZORPAY_INTEGRATION_MODE = "invalid_mode_xyz";
    assert.equal(getIntegrationMode("RAZORPAY_INTEGRATION_MODE"), "disabled");
    adapter = createRazorpayAdapter(fakeClient);
    assert.equal(adapter.mode, "disabled");

    await assert.rejects(
      () => adapter.createOrder({ tenantId: "t1", amountCents: 10000 }),
      IntegrationDisabledError
    );

    // 5. Request parameters cannot force or enable live mode
    process.env.RAZORPAY_INTEGRATION_MODE = "disabled";
    adapter = createRazorpayAdapter(fakeClient);
    await assert.rejects(
      // @ts-expect-error testing request param tampering attempt
      () => adapter.createOrder({ tenantId: "t1", amountCents: 10000, mode: "live" }),
      IntegrationDisabledError
    );

    // 6. Missing webhook secret fails closed
    const bodyStr = JSON.stringify({ event: "payment_link.paid" });
    const verifiedMissingSecret = verifyRazorpayWebhookSignature(bodyStr, "sig_dummy", "");
    assert.equal(verifiedMissingSecret, false, "Missing webhook secret MUST fail closed");

    // 7. Webhook signature verification uses correct configured secret
    const secret = "test_webhook_secret_key_123";
    const crypto = await import("node:crypto");
    const validSig = crypto.createHmac("sha256", secret).update(bodyStr).digest("hex");
    const verifiedValidSecret = verifyRazorpayWebhookSignature(bodyStr, validSig, secret);
    assert.equal(verifiedValidSecret, true, "Valid webhook signature MUST verify successfully");

    const invalidSig = crypto.createHmac("sha256", "wrong_secret_key_999").update(bodyStr).digest("hex");
    const verifiedInvalidSecret = verifyRazorpayWebhookSignature(bodyStr, invalidSig, secret);
    assert.equal(verifiedInvalidSecret, false, "Invalid webhook signature MUST fail closed");

    // 8. Payment feature flags default to false unless explicitly set to "true"
    delete process.env.PAYMENTS_SUBSCRIPTIONS_ENABLED;
    assert.equal(isPaymentFeatureEnabled("PAYMENTS_SUBSCRIPTIONS_ENABLED"), false);

    console.log("razorpay-adapter.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
  } finally {
    process.env = originalEnv;
  }
}

run();
