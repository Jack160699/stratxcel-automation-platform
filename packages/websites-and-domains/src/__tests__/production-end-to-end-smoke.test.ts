/**
 * Production End-to-End Website Factory Smoke Test Suite
 *
 * Runs the comprehensive 15-step production validation for:
 * "Obsidian Roasters — Premium Coffee Brand"
 */

import { strict as assert } from "node:assert";
import { productionEndToEndSmokeRunner } from "../smoke-test/end-to-end-smoke.ts";

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

async function runEndToEndSmokeSuite() {
  console.log("\n==================================================");
  console.log("PRODUCTION END-TO-END WEBSITE FACTORY SMOKE TEST");
  console.log("Project: Obsidian Roasters — Premium Coffee Brand");
  console.log("==================================================\n");

  const report = await productionEndToEndSmokeRunner.executeSmokeTest();

  // STEP 1 — Spec & Model Generation
  console.log("--- 1. Website Intelligence & Generation ---");
  await test("Generates 5-page editorial specification and luxury design system", () => {
    assert.equal(report.steps.step1_spec_generation.passed, true);
    assert.ok(report.steps.step1_spec_generation.details?.includes("5 pages"));
  });

  // STEP 2 — Preview QA
  console.log("\n--- 2. Preview QA ---");
  await test("Preview QA passes with WCAG AA compliance and zero broken links", () => {
    assert.equal(report.steps.step2_preview_qa.passed, true);
  });

  // STEP 3 — Customer Approval
  console.log("\n--- 3. Customer Approval ---");
  await test("Persists explicit customer approval (PREVIEW_READY -> CUSTOMER_APPROVED)", () => {
    assert.equal(report.steps.step3_customer_approval.passed, true);
  });

  // STEP 4 — Real Razorpay Payment
  console.log("\n--- 4. Real Razorpay Payment & Webhook Reconciliation ---");
  await test("Reconciles Razorpay HMAC webhook into PAYMENT_CONFIRMED", () => {
    assert.equal(report.steps.step4_real_payment.passed, true);
    assert.ok(report.steps.step4_real_payment.details?.includes("₹1,499.00"));
  });

  // STEP 5 — Real Domain Registration
  console.log("\n--- 5. Real Domain Registration (.in) ---");
  await test("Registers disposable .in domain with provider reference", () => {
    assert.equal(report.steps.step5_real_domain.passed, true);
    assert.ok(report.domain.endsWith(".in"));
  });

  // STEP 6 — Hosting
  console.log("\n--- 6. Hosting & Vercel Edge Runtime ---");
  await test("Attaches custom domain to Vercel production edge runtime", () => {
    assert.equal(report.steps.step6_hosting.passed, true);
  });

  // STEP 7 — DNS Configuration
  console.log("\n--- 7. DNS Configuration ---");
  await test("Configures apex A and CNAME DNS routing", () => {
    assert.equal(report.steps.step7_dns.passed, true);
  });

  // STEP 8 — SSL Active
  console.log("\n--- 8. SSL Verification ---");
  await test("Confirms HTTPS is ACTIVE with valid TLS 1.3 certificate", () => {
    assert.equal(report.steps.step8_ssl.passed, true);
  });

  // STEP 9 — Public Website QA & LIVE Transition
  console.log("\n--- 9. Public Website QA & LIVE Transition ---");
  await test("Public website is LIVE and passes end-to-end smoke QA", () => {
    assert.equal(report.steps.step9_public_qa.passed, true);
  });

  // STEP 10 — AI Business Agent Multi-Turn Commerce Flow
  console.log("\n--- 10. AI Business Agent Commerce Flow ---");
  await test("AI Agent recommends coffee, adds to cart, and creates checkout link", () => {
    assert.equal(report.steps.step10_ai_agent.passed, true);
  });

  // STEP 11 — Natural-Language Versioned Edit
  console.log("\n--- 11. Natural-Language Versioned Edit ---");
  await test("Applies natural-language edit and increments version lineage (v1 -> v2)", () => {
    assert.equal(report.steps.step11_natural_language_edit.passed, true);
  });

  // STEP 12 — Instant Safe Rollback
  console.log("\n--- 12. Instant Safe Rollback ---");
  await test("Rolls back website from v2 -> v1 preserving version history", () => {
    assert.equal(report.steps.step12_rollback.passed, true);
  });

  // STEP 13 — Safety Reset
  console.log("\n--- 13. Safety Reset ---");
  await test("Restores ALLOW_LIVE_DOMAIN_PURCHASES=false safety lock", () => {
    assert.equal(report.steps.step13_safety_reset.passed, true);
    assert.equal(report.liveLockRestored, true);
  });

  // STEP 14 — Unit Economics & Cost Accounting
  console.log("\n--- 14. Unit Economics & Cost Accounting ---");
  await test("Calculates total measured smoke test cost", () => {
    assert.equal(report.steps.step14_cost_accounting.passed, true);
    assert.ok(report.cost.totalCostUsd > 0);
    assert.ok(report.cost.totalCostInr > 0);
  });

  console.log("\n==================================================");
  console.log(`SMOKE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`TOTAL MEASURED COST: $${report.cost.totalCostUsd.toFixed(4)} (₹${report.cost.totalCostInr.toFixed(2)})`);
  console.log("==================================================\n");

  if (failed > 0) process.exit(1);
}

runEndToEndSmokeSuite();
