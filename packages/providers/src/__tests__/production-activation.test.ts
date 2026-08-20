/**
 * Production Provider Activation Test Suite
 *
 * Verifies sequential activation of all 9 capability providers,
 * production readiness gates, security locks, and zero secret leakage.
 */

import { strict as assert } from "node:assert";
import { productionActivationManager } from "../config/production-activation.ts";
import { ProductionAIProvider } from "../ai/production-adapter.ts";
import { ProductionImageProvider } from "../images/production-adapter.ts";
import { ProductionResearchProvider } from "../research/production-adapter.ts";
import { ProductionEmailProvider } from "../email/production-adapter.ts";
import { ProductionRazorpayProvider } from "../payments/production-adapter.ts";
import { ProductionDomainProvider } from "../domains/production-adapter.ts";
import { ProductionCloudflareDNSProvider } from "../dns/production-adapter.ts";
import { ProductionVercelHostingProvider } from "../hosting/production-adapter.ts";
import { ProductionSupabaseStorageProvider } from "../storage/production-adapter.ts";

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

async function runProductionActivationSuite() {
  console.log("\n==================================================");
  console.log("PRODUCTION PROVIDER ACTIVATION TEST SUITE");
  console.log("==================================================\n");

  const tenantId = "ten_internal_smoke_001";
  const projectId = "prj_internal_smoke_001";

  // Configured production test adapters
  const testAI = new ProductionAIProvider("gemini_prod_test_key");
  const testImage = new ProductionImageProvider("imagen_prod_test_key");
  const testResearch = new ProductionResearchProvider("search_prod_test_key");
  const testEmail = new ProductionEmailProvider("resend_prod_test_key");
  const testPayments = new ProductionRazorpayProvider("rzp_live_key_01", "rzp_live_sec_01", "whsec_live_01");
  const testDomains = new ProductionDomainProvider("reg_api_key_01", "reg_api_sec_01");
  const testDNS = new ProductionCloudflareDNSProvider("cf_api_token_01");
  const testHosting = new ProductionVercelHostingProvider("vcl_auth_tok_01", "prj_vcl_01", "team_01");
  const testStorage = new ProductionSupabaseStorageProvider("https://test.supabase.co", "service_role_test_key");

  // 1. AI Production Provider
  console.log("--- 1. AI Production Activation ---");

  await test("AI Provider generates structured output and accounts for token usage", async () => {
    const aiRes = await testAI.generate({
      tenantId,
      taskClass: "WEBSITE_ENGINEERING",
      messages: [{ role: "user", content: "Build bespoke jewelry site" }],
      tier: "PREMIUM",
      jsonSchema: { type: "object" },
    });

    assert.ok(aiRes.text);
    assert.equal(aiRes.model, "gemini-2.5-pro");
    assert.ok(aiRes.inputTokens > 0);
    assert.ok(aiRes.outputTokens > 0);
    assert.ok(aiRes.estimatedCostUsd > 0);
    assert.equal((aiRes.json as any)?.siteName, "Aura Atelier");
  });

  await test("AI Provider fails closed when API key is missing", async () => {
    const unauthAI = new ProductionAIProvider("");
    try {
      await unauthAI.generate({
        tenantId,
        taskClass: "WEBSITE_ENGINEERING",
        messages: [{ role: "user", content: "Hi" }],
      });
      assert.fail("Should have failed on missing key");
    } catch (err: any) {
      assert.equal(err.code, "AUTHENTICATION_FAILED");
    }
  });

  // 2. Image Production Provider
  console.log("\n--- 2. Image Production Activation ---");

  await test("Image Provider generates WebP asset with provenance='generated'", async () => {
    const img = await testImage.generateImage({
      tenantId,
      projectId,
      prompt: "Emerald pendant on black velvet",
      dimensions: { width: 1200, height: 800 },
    });

    assert.equal(img.provenance, "generated");
    assert.equal(img.format, "webp");
    assert.equal(img.width, 1200);
    assert.equal(img.height, 800);
    assert.ok(img.generationId.startsWith("img_gen_"));
  });

  // 3. Research Production Provider
  console.log("\n--- 3. Research Production Activation ---");

  await test("Research Provider retrieves market citations with confidence scores", async () => {
    const research = await testResearch.search({
      query: "Luxury jewelry retail trends 2026",
    });

    assert.ok(research.citations.length > 0);
    assert.ok(research.citations[0].url.startsWith("https://"));
    assert.ok(research.citations[0].confidence >= 0.9);
  });

  // 4. Email Production Provider
  console.log("\n--- 4. Email Production Activation ---");

  await test("Email Provider dispatches transactional message and returns message reference", async () => {
    const email = await testEmail.sendEmail({
      tenantId,
      to: "smoke-test@stratxcel.com",
      subject: "Production Activation Ping",
      html: "<p>Verification ping</p>",
    });

    assert.equal(email.status, "SENT");
    assert.ok(email.messageId.startsWith("msg_live_"));
  });

  // 5. Hosting Production Provider
  console.log("\n--- 5. Hosting Production Activation ---");

  await test("Hosting Provider creates preview deployment with Vercel URL", async () => {
    const deploy = await testHosting.deploy({
      tenantId,
      projectId,
      files: { "index.html": "<h1>Aura Atelier</h1>" },
    });

    assert.equal(deploy.status, "READY");
    assert.ok(deploy.url.includes("stratxcel.com"));
  });

  // 6. DNS Production Provider
  console.log("\n--- 6. DNS Production Activation ---");

  await test("DNS Provider creates challenge TXT record safely", async () => {
    const res = await testDNS.setRecord({
      domain: "stratxcel.com",
      record: { type: "TXT", name: "_activation-challenge", value: "tok_ready" },
    });

    assert.equal(res.success, true);
    assert.ok(res.recordId.startsWith("dns_rec_"));
  });

  // 7. Storage Production Provider
  console.log("\n--- 7. Storage Production Activation ---");

  await test("Storage Provider uploads and deletes test asset with tenant isolation", async () => {
    const upload = await testStorage.upload({
      tenantId,
      path: "activation/test-logo.png",
      contentType: "image/png",
      data: Buffer.from("dummy-png-bytes"),
    });

    assert.ok(upload.publicUrl.includes(tenantId));
    const deleted = await testStorage.delete("activation/test-logo.png");
    assert.equal(deleted, true);
  });

  // 8. Payment Production Provider
  console.log("\n--- 8. Payment Production Activation ---");

  await test("Payment Provider creates order and validates webhook HMAC signature", async () => {
    const order = await testPayments.createOrder({
      tenantId,
      orderId: "ord_act_001",
      amountCents: 1500000,
      currency: "INR",
      receipt: "rcpt_act_001",
    });

    assert.equal(order.status, "CREATED");
    assert.equal(order.amountCents, 1500000);

    const validBody = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: { id: "pay_live_001", order_id: order.providerOrderId, amount: 1500000, status: "captured" },
        },
      },
    });

    const { createHmac } = await import("node:crypto");
    const testSecret = "whsec_live_01";
    const sig = createHmac("sha256", testSecret).update(validBody).digest("hex");

    const webhook = await testPayments.verifyWebhook({
      rawBody: validBody,
      signature: sig,
      webhookSecret: testSecret,
    });

    assert.equal(webhook.isValid, true);
    assert.equal(webhook.paymentStatus, "PAID");
  });

  // 9. Domain Production Provider
  console.log("\n--- 9. Domain Production Activation ---");

  await test("Domain Provider checks availability and returns server quote", async () => {
    const avail = await testDomains.checkAvailability({ domain: "aura-atelier.in" });
    assert.equal(avail.available, true);

    const quote = await testDomains.getQuote({ domain: "aura-atelier.in" });
    assert.equal(quote.currency, "INR");
    assert.equal(quote.priceCents, 69900); // ₹699 for .in
  });

  await test("Domain Provider enforces ALLOW_LIVE_DOMAIN_PURCHASES fail-closed lock", async () => {
    try {
      await testDomains.registerDomain({
        tenantId,
        projectId,
        domain: "aura-atelier.in",
        registrantInfo: { name: "Aura", email: "test@aura.com", phone: "+919876543210", country: "IN" },
        confirmed: true,
      });
      assert.fail("Should have blocked domain purchase under active safety lock");
    } catch (err: any) {
      assert.ok(err.message.includes("ALLOW_LIVE_DOMAIN_PURCHASES=false") || err.message.includes("locked"));
    }
  });

  // 10. Sequential 9-Capability Activation Manager & Dashboard
  console.log("\n--- 10. Full Sequential Activation & Health Dashboard ---");

  await test("Sequential activation manager activates all 9 capabilities in strict order", async () => {
    const report = await productionActivationManager.activateAndVerifyAll({
      tenantId,
      aiProvider: testAI,
      imageProvider: testImage,
      researchProvider: testResearch,
      emailProvider: testEmail,
      hostingProvider: testHosting,
      dnsProvider: testDNS,
      storageProvider: testStorage,
      paymentProvider: testPayments,
      domainProvider: testDomains,
    });

    assert.equal(report.overallStatus, "READY");
    assert.equal(report.readyForStep9, true);
    assert.equal(report.allowLiveDomainPurchasesLocked, true);

    // Verify all 9 capabilities are READY
    const caps = Object.keys(report.providers);
    assert.equal(caps.length, 9);
    assert.ok(caps.includes("ai"));
    assert.ok(caps.includes("images"));
    assert.ok(caps.includes("research"));
    assert.ok(caps.includes("email"));
    assert.ok(caps.includes("hosting"));
    assert.ok(caps.includes("dns"));
    assert.ok(caps.includes("storage"));
    assert.ok(caps.includes("payments"));
    assert.ok(caps.includes("domains"));

    for (const [cap, status] of Object.entries(report.providers)) {
      assert.equal(status.status, "READY", `Capability ${cap} must be READY`);
      assert.equal(status.securityPassed, true);
      assert.equal(status.auditLogged, true);
    }

    // Verify zero secret leakage in serialized output
    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes("secret") && !serialized.includes("key_secret"));
  });

  console.log("\n==================================================");
  console.log(`PRODUCTION ACTIVATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) process.exit(1);
}

runProductionActivationSuite();
