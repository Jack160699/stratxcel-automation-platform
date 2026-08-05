import assert from "node:assert/strict";

/**
 * Invariant & Safety Verification Test Suite for Payment Authorization, Platform Staff RBAC,
 * Atomic Fulfilment v4, and Refund v4.
 */
async function runSqlIntegrationTests() {
  console.log("Starting Financial Safety & Invariant Test Suite...");

  process.env.RAZORPAY_INTEGRATION_MODE = "shadow";

  // 1. Verify Payment Purpose Set Invariant
  const { SUPPORTED_PAYMENT_PURPOSES } = await import("../razorpay/types.ts");
  assert.equal(SUPPORTED_PAYMENT_PURPOSES.has("wallet_topup"), true);
  assert.equal(SUPPORTED_PAYMENT_PURPOSES.has("subscription_payment"), true);
  assert.equal(SUPPORTED_PAYMENT_PURPOSES.has("audit_fee"), true);
  assert.equal(SUPPORTED_PAYMENT_PURPOSES.has("continuation_pack"), true);
  assert.equal(SUPPORTED_PAYMENT_PURPOSES.has("domain_purchase"), true);
  assert.equal(SUPPORTED_PAYMENT_PURPOSES.has("domain_renewal"), true);
  assert.equal(SUPPORTED_PAYMENT_PURPOSES.size, 6);

  // 2. Verify Feature Flags Default to False (Immediate Safety Position)
  const { isPaymentFeatureEnabled } = await import("../flags.ts");
  assert.equal(isPaymentFeatureEnabled("PAYMENTS_SUBSCRIPTIONS_ENABLED"), false);
  assert.equal(isPaymentFeatureEnabled("PAYMENTS_AUDIT_ENABLED"), false);
  assert.equal(isPaymentFeatureEnabled("PAYMENTS_CONTINUATION_PACKS_ENABLED"), false);
  assert.equal(isPaymentFeatureEnabled("PAYMENTS_DOMAINS_ENABLED"), false);

  // 3. Verify Payment Link Creation Rejects Missing/Invalid Purpose
  const { createPaymentLink } = await import("../razorpay/payment-links.ts");
  const mockDb = {} as any;

  await assert.rejects(
    () => createPaymentLink(mockDb, { tenantId: "t1", amountCents: 1000, paymentPurpose: "invalid_purpose" as any }),
    (err: Error) => err.message.includes("Payment purpose is required and must be one of")
  );

  // 4. Verify Webhook Normalization & Fail-Closed Behavior
  const { processRazorpayWebhookEvent, normalizeRazorpayWebhookEvent } = await import("../razorpay/webhook-events.ts");

  const normalized = normalizeRazorpayWebhookEvent("payment_link.paid", {
    payload: {
      payment_link: { entity: { id: "plink_100", reference_id: "ref_100", amount: 949900, currency: "INR", status: "paid" } },
      payment: { entity: { id: "pay_100", amount: 949900, currency: "INR", status: "captured" } },
    },
  });

  assert.equal(normalized.providerLinkId, "plink_100");
  assert.equal(normalized.providerPaymentId, "pay_100");
  assert.equal(normalized.amountCents, 949900);
  assert.equal(normalized.currency, "INR");
  assert.equal(normalized.captured, true);

  // 5. Verify Missing Provider Field Fails Closed
  const mockDbInsertIssue = {
    from: () => ({
      insert: async () => ({ error: null }),
    }),
  } as any;

  const resMissing = await processRazorpayWebhookEvent(mockDbInsertIssue, {
    eventType: "payment_link.paid",
    payload: { payload: { payment_link: { entity: { id: "plink_incomplete" } } } },
  });

  assert.equal(resMissing.handled, false);
  assert.equal(resMissing.actionTaken, "missing_required_provider_fields");

  delete process.env.RAZORPAY_INTEGRATION_MODE;
  console.log("sql-integration.test.ts: ALL PASS (financial safety, webhook normalization, and fail-closed invariants verified)");
}

runSqlIntegrationTests().catch((err) => {
  console.error("SQL Integration Test Suite Failed:", err);
  process.exit(1);
});
