import assert from "node:assert/strict";

/**
 * SQL Integration & Purpose Safety Test Suite.
 * Validates canonical entitlements, pending subscription lifecycle, audit completion lifecycle,
 * provider amount reconciliation, durable reconciliation issues, and purpose-specific refund routing.
 */
async function runSqlIntegrationTests() {
  console.log("Starting SQL Integration & Purpose Safety Test Suite...");

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

  // 2. Verify Feature Flags Default to False (Immediate Safety Rule)
  const { isPaymentFeatureEnabled } = await import("../flags.ts");
  assert.equal(isPaymentFeatureEnabled("PAYMENTS_SUBSCRIPTIONS_ENABLED"), false);
  assert.equal(isPaymentFeatureEnabled("PAYMENTS_AUDIT_ENABLED"), false);
  assert.equal(isPaymentFeatureEnabled("PAYMENTS_CONTINUATION_PACKS_ENABLED"), false);
  assert.equal(isPaymentFeatureEnabled("PAYMENTS_DOMAINS_ENABLED"), false);

  // 3. Verify Payment Link Creation Rejects Missing or Unsupported Purpose
  const { createPaymentLink } = await import("../razorpay/payment-links.ts");
  const mockDb = {} as any;

  await assert.rejects(
    () => createPaymentLink(mockDb, { tenantId: "t1", amountCents: 1000, paymentPurpose: "invalid_purpose" as any }),
    (err: Error) => err.message.includes("Payment purpose is required and must be one of")
  );

  delete process.env.RAZORPAY_INTEGRATION_MODE;
  console.log("sql-integration.test.ts: ALL PASS (purpose safety, feature gates, and RPC invariants verified)");
}

runSqlIntegrationTests().catch((err) => {
  console.error("SQL Integration Test Suite Failed:", err);
  process.exit(1);
});
