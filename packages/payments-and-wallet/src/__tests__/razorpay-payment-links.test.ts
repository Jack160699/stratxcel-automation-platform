// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/razorpay-payment-links.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { ServiceClient } from "../db.ts";
import { createPaymentLink, generatePaymentLinkReferenceId } from "../razorpay/payment-links.ts";
import { verifyRazorpayCallbackSignature, verifyRazorpayWebhookSignature } from "../razorpay/webhook.ts";

function testReferenceIdGeneration() {
  const ref1 = generatePaymentLinkReferenceId();
  const ref2 = generatePaymentLinkReferenceId();

  assert.ok(ref1.startsWith("pl_"));
  assert.ok(ref2.startsWith("pl_"));
  assert.notEqual(ref1, ref2, "Generated reference IDs must be unique");
}

function testCallbackSignatureVerification() {
  const secret = "test_webhook_secret_key";
  const params = {
    paymentLinkId: "plink_123456789",
    paymentLinkReferenceId: "pl_ref_987654321",
    paymentLinkStatus: "paid",
    paymentId: "pay_1122334455",
  };

  const payloadStr = `${params.paymentLinkId}|${params.paymentLinkReferenceId}|${params.paymentLinkStatus}|${params.paymentId}`;
  const validSig = crypto.createHmac("sha256", secret).update(payloadStr, "utf8").digest("hex");

  assert.equal(
    verifyRazorpayCallbackSignature({
      ...params,
      signature: validSig,
      secret,
    }),
    true,
    "Valid callback signature must verify to true"
  );

  assert.equal(
    verifyRazorpayCallbackSignature({
      ...params,
      signature: "invalid_hex_signature",
      secret,
    }),
    false,
    "Invalid signature must verify to false"
  );
}

async function testRealCreatePaymentLinkCompensationScenarios() {
  process.env.RAZORPAY_INTEGRATION_MODE = "live";
  process.env.RAZORPAY_KEY_ID = "rzp_test_key_123";
  process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_456";

  const mockTenantId = "tenant-uuid-111";

  // Scenario 1: Razorpay creation succeeds & DB insert succeeds
  const mockFetchSuccess = (async (url: string | URL | Request) => {
    const urlStr = url.toString();
    if (urlStr.includes("payment_links")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "plink_live_11", short_url: "https://rzp.io/i/11", status: "created", amount: 50000, currency: "INR" }),
      } as Response;
    }
    throw new Error("Unexpected URL");
  }) as typeof fetch;

  const mockDbSuccess = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: {
              id: "link-uuid-11",
              tenant_id: mockTenantId,
              provider_link_id: "plink_live_11",
              reference_id: "pl_ref_11",
              amount_cents: 50000,
              currency: "INR",
              status: "created",
              mode: "live",
            },
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as ServiceClient;

  const link = await createPaymentLink(mockDbSuccess, { tenantId: mockTenantId, amountCents: 50000 }, mockFetchSuccess);
  assert.equal(link.provider_link_id, "plink_live_11");

  // Scenario 2: Razorpay creation succeeds, DB insert fails, cancellation succeeds (2xx)
  let cancelCalledWithId: string | null = null;
  const mockFetchDbFailCancelSuccess = (async (url: string | URL | Request) => {
    const urlStr = url.toString();
    if (urlStr.endsWith("/cancel")) {
      cancelCalledWithId = urlStr.split("/").slice(-2)[0];
      return { ok: true, status: 200, json: async () => ({ status: "cancelled" }) } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "plink_orphan_22", status: "created", amount: 50000, currency: "INR" }),
    } as Response;
  }) as typeof fetch;

  const mockDbFail = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { message: "DB Connection Error" } }),
        }),
      }),
    }),
  } as unknown as ServiceClient;

  await assert.rejects(
    () => createPaymentLink(mockDbFail, { tenantId: mockTenantId, amountCents: 50000 }, mockFetchDbFailCancelSuccess),
    (err: Error) => err.message.includes("automatically cancelled")
  );
  assert.equal(cancelCalledWithId, "plink_orphan_22", "Compensation cancelled correct link ID");

  // Scenario 3: Razorpay creation succeeds, DB insert fails, cancellation returns non-2xx
  const mockFetchDbFailCancel500 = (async (url: string | URL | Request) => {
    const urlStr = url.toString();
    if (urlStr.endsWith("/cancel")) {
      return { ok: false, status: 500, json: async () => ({ error: "Internal Razorpay Error" }) } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "plink_orphan_33", status: "created", amount: 50000, currency: "INR" }),
    } as Response;
  }) as typeof fetch;

  await assert.rejects(
    () => createPaymentLink(mockDbFail, { tenantId: mockTenantId, amountCents: 50000 }, mockFetchDbFailCancel500),
    (err: Error) => err.message.includes("Compensation cancellation failed (HTTP 500)") && err.message.includes("Manual review required")
  );

  // Scenario 4: Razorpay creation succeeds, DB insert fails, cancellation network throws
  const mockFetchDbFailCancelNetworkErr = (async (url: string | URL | Request) => {
    const urlStr = url.toString();
    if (urlStr.endsWith("/cancel")) {
      throw new Error("Network Unreachable");
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "plink_orphan_44", status: "created", amount: 50000, currency: "INR" }),
    } as Response;
  }) as typeof fetch;

  await assert.rejects(
    () => createPaymentLink(mockDbFail, { tenantId: mockTenantId, amountCents: 50000 }, mockFetchDbFailCancelNetworkErr),
    (err: Error) => err.message.includes("Compensation cancellation failed (HTTP network_error)")
  );

  delete process.env.RAZORPAY_INTEGRATION_MODE;
}

async function run() {
  testReferenceIdGeneration();
  testCallbackSignatureVerification();
  await testRealCreatePaymentLinkCompensationScenarios();
  console.log("razorpay-payment-links.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
