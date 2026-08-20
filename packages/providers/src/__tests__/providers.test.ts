/**
 * Provider Integration Layer Test Suite
 *
 * Verifies all 9 capability providers, model router fallback, resilience retries,
 * error normalization, and unified safe health assessments.
 */

import { strict as assert } from "node:assert";
import { providerManager } from "../config/provider-config.ts";
import { MockAIProvider, AIRouter } from "../ai/mock-adapter.ts";
import { mockImageProvider } from "../images/interface.ts";
import { mockResearchProvider } from "../research/interface.ts";
import { mockEmailProvider } from "../email/interface.ts";
import { mockPaymentProvider } from "../payments/interface.ts";
import { mockDomainProvider } from "../domains/interface.ts";
import { mockDNSProvider } from "../dns/interface.ts";
import { mockHostingProvider } from "../hosting/interface.ts";
import { mockStorageProvider } from "../storage/interface.ts";
import { withResilience } from "../resilience/retry.ts";
import { normalizeProviderError, ProviderError } from "../resilience/errors.ts";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: unknown) {
    failed++;
    console.error(`  ✗ ${name}: ${(err as Error).message}`);
  }
}

async function runProvidersSuite() {
  console.log("\n==================================================");
  console.log("PROVIDER INTEGRATION LAYER TEST SUITE");
  console.log("==================================================\n");

  const tenantId = "ten_prov_001";
  const projectId = "prj_prov_001";

  // 1. AI Provider & Router
  console.log("--- 1. AI Provider & Model Routing ---");

  await test("Generates structured AI response and tracks tokens/costs", async () => {
    const res = await providerManager.providers.ai.executeWithFallback({
      tenantId,
      taskClass: "WEBSITE_ENGINEERING",
      messages: [{ role: "user", content: "Generate luxury boutique landing page" }],
      tier: "PREMIUM",
    });

    assert.ok(res.text.includes("luxury boutique"));
    assert.equal(res.model, "mock-premium");
    assert.equal(res.inputTokens, 50);
    assert.equal(res.outputTokens, 80);
    assert.ok(res.estimatedCostUsd > 0);
  });

  await test("Executes fallback to secondary provider when primary fails", async () => {
    const router = new AIRouter();
    const failingProvider = {
      name: "failing_primary",
      generate: async () => {
        throw new ProviderError({
          message: "API key expired",
          code: "AUTHENTICATION_FAILED",
          provider: "failing_primary",
          capability: "ai",
        });
      },
      healthCheck: async () => ({
        capability: "ai",
        provider: "failing_primary",
        status: "FAILED" as const,
        isReady: false,
        lastCheckedAt: new Date().toISOString(),
      }),
    };

    router.registerProvider(failingProvider);
    router.registerProvider(new MockAIProvider());

    const res = await router.executeWithFallback({
      tenantId,
      taskClass: "WEBSITE_ENGINEERING",
      messages: [{ role: "user", content: "Fallback test" }],
      preferredProvider: "failing_primary" as any,
    });

    assert.ok(res.text);
    assert.equal(res.provider, "mock_ai");
  });

  // 2. Image Provider
  console.log("\n--- 2. Image Provider ---");

  await test("Generates image with normalized dimensions and provenance='generated'", async () => {
    const img = await mockImageProvider.generateImage({
      tenantId,
      projectId,
      prompt: "Luxury silk shirt on marble table",
      dimensions: { width: 1920, height: 1080 },
    });

    assert.equal(img.provenance, "generated");
    assert.equal(img.width, 1920);
    assert.equal(img.height, 1080);
    assert.equal(img.format, "webp");
    assert.ok(img.imageUrl.includes("photo-mock-gen"));
  });

  // 3. Research Provider
  console.log("\n--- 3. Research Provider ---");

  await test("Extracts search insights, citations, and confidence scores", async () => {
    const research = await mockResearchProvider.search({
      query: "Italian menswear boutique trends in Bengaluru",
      maxResults: 5,
    });

    assert.equal(research.query, "Italian menswear boutique trends in Bengaluru");
    assert.ok(research.citations.length >= 1);
    assert.equal(research.citations[0].confidence, 0.95);
    assert.ok(research.extractedSummary.includes("strong consumer interest"));
  });

  // 4. Email Provider
  console.log("\n--- 4. Email Provider ---");

  await test("Sends transactional notification and normalizes delivery status", async () => {
    const email = await mockEmailProvider.sendEmail({
      tenantId,
      to: "customer@luxury.com",
      subject: "Order Confirmation - Aura Atelier",
      html: "<p>Your bespoke order is confirmed.</p>",
    });

    assert.equal(email.status, "SENT");
    assert.ok(email.messageId.startsWith("msg_"));
  });

  // 5. Payment Provider
  console.log("\n--- 5. Payment Provider ---");

  await test("Creates normalized payment order and verifies webhook signatures", async () => {
    const order = await mockPaymentProvider.createOrder({
      tenantId,
      orderId: "ord_1001",
      amountCents: 899900,
      currency: "INR",
      receipt: "rcpt_1001",
    });

    assert.equal(order.status, "CREATED");
    assert.equal(order.amountCents, 899900);
    assert.equal(order.currency, "INR");

    const webhook = await mockPaymentProvider.verifyWebhook({
      rawBody: "{}",
      signature: "valid_hmac_sig",
      webhookSecret: "whsec_live",
    });

    assert.equal(webhook.isValid, true);
    assert.equal(webhook.paymentStatus, "PAID");
  });

  // 6. Domain & DNS Providers
  console.log("\n--- 6. Domain & DNS Providers ---");

  await test("Checks domain availability, generates quote, and registers with confirmation", async () => {
    const avail = await mockDomainProvider.checkAvailability({ domain: "auraboutique.in" });
    assert.equal(avail.available, true);

    const quote = await mockDomainProvider.getQuote({ domain: "auraboutique.in" });
    assert.equal(quote.priceCents, 119900);
    assert.equal(quote.currency, "INR");

    const reg = await mockDomainProvider.registerDomain({
      tenantId,
      projectId,
      domain: "auraboutique.in",
      registrantInfo: { name: "Aura", email: "aura@test.com", phone: "+919876543210", country: "IN" },
      confirmed: true,
    });

    assert.equal(reg.status, "REGISTERED");
  });

  await test("Manages DNS records (A & CNAME)", async () => {
    const records = await mockDNSProvider.getRecords("auraboutique.in");
    assert.ok(records.some((r) => r.type === "A"));
    assert.ok(records.some((r) => r.type === "CNAME"));

    const setRes = await mockDNSProvider.setRecord({
      domain: "auraboutique.in",
      record: { type: "TXT", name: "_stratxcel-challenge", value: "tok_xyz123" },
    });

    assert.equal(setRes.success, true);
  });

  // 7. Hosting & Storage Providers
  console.log("\n--- 7. Hosting & Storage Providers ---");

  await test("Deploys preview site and attaches custom domain", async () => {
    const deploy = await mockHostingProvider.deploy({
      tenantId,
      projectId,
      files: { "index.html": "<h1>Aura</h1>" },
    });

    assert.equal(deploy.status, "READY");
    assert.ok(deploy.url.includes("stratxcel.com"));

    const attach = await mockHostingProvider.attachDomain({
      projectId,
      domain: "auraboutique.in",
    });

    assert.equal(attach.verified, true);
  });

  await test("Uploads and manages storage assets with tenant isolation", async () => {
    const upload = await mockStorageProvider.upload({
      tenantId,
      path: "assets/logo.png",
      contentType: "image/png",
      data: Buffer.from("dummy-png-bytes"),
    });

    assert.ok(upload.publicUrl.includes(tenantId));
    assert.equal(upload.sizeBytes, 15);
  });

  // 8. Resilience, Retry, & Error Normalization
  console.log("\n--- 8. Resilience & Error Normalization ---");

  await test("Retries retryable operations with exponential backoff", async () => {
    let attempts = 0;
    const result = await withResilience(
      async () => {
        attempts++;
        if (attempts < 2) {
          throw new ProviderError({
            message: "Temporary rate limit",
            code: "RATE_LIMITED",
            provider: "test_service",
            capability: "test",
          });
        }
        return "success_after_retry";
      },
      { maxRetries: 3, initialDelayMs: 10 }
    );

    assert.equal(result, "success_after_retry");
    assert.equal(attempts, 2);
  });

  await test("Normalizes HTTP errors into standardized error taxonomy", () => {
    const err429 = normalizeProviderError(new Error("HTTP 429 Too Many Requests"), "ai", "gemini");
    assert.equal(err429.code, "RATE_LIMITED");

    const err401 = normalizeProviderError(new Error("Unauthorized: Invalid API Key"), "payments", "razorpay");
    assert.equal(err401.code, "AUTHENTICATION_FAILED");
  });

  // 9. Unified Health Check
  console.log("\n--- 9. Unified System Health Assessment ---");

  await test("Evaluates system health across all capabilities without secret leakage", async () => {
    const report = await providerManager.evaluateSystemHealth();
    assert.equal(report.overallStatus, "READY");
    assert.equal(report.isReadyForLiveOperations, true);
    assert.ok(report.capabilities.images.isReady);
    assert.ok(report.capabilities.payments.isReady);
    assert.ok(report.capabilities.domains.isReady);
    assert.ok(report.capabilities.hosting.isReady);

    // Verify zero secret leakage in serialized report
    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes("secret") && !serialized.includes("key"));
  });

  console.log("\n==================================================");
  console.log(`PROVIDER INTEGRATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) process.exit(1);
}

runProvidersSuite();
