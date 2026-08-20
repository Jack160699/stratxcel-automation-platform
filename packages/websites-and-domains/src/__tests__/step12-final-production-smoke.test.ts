/**
 * Stratxcel AI Website Factory — Step 12 Final Real Production Smoke Test Suite
 *
 * Validates the complete customer promise from raw Hinglish prompt to live domain,
 * AI agent interaction, versioned edit, and instant rollback.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { step12FinalProductionSmokeRunner } from "../smoke-test/step12-final-smoke.ts";

describe("Step 12: Final Real Production Website Factory Smoke Test", () => {
  it("Executes the complete 20-step production workflow with 100% success", async () => {
    const report = await step12FinalProductionSmokeRunner.executeFinalSmokeTest();

    // 1. Customer Prompt & Smart Brief
    assert.equal(report.steps.step1_smart_brief.passed, true);
    assert.ok(report.steps.step1_smart_brief.details?.includes("Hinglish"));

    // 2. Pre-Generation Summary
    assert.equal(report.steps.step2_pregen_summary.passed, true);

    // 3. Website Generation
    assert.equal(report.steps.step3_generation.passed, true);
    assert.ok(report.steps.step3_generation.details?.includes("5-page"));

    // 4. Preview URL & Security
    assert.equal(report.steps.step4_preview_url.passed, true);
    assert.ok(report.steps.step4_preview_url.details?.includes("HMAC-SHA256"));

    // 5. Real Browser QA (Multi-Viewport & Technical)
    assert.equal(report.steps.step5_real_browser_qa.passed, true);
    assert.ok(report.steps.step5_real_browser_qa.details?.includes("375px"));

    // 6. Customer Approval Gating
    assert.equal(report.steps.step6_customer_approval.passed, true);

    // 7. Real Razorpay Payment & HMAC Webhook Reconciliation
    assert.equal(report.steps.step7_real_payment.passed, true);
    assert.ok(report.steps.step7_real_payment.details?.includes("₹1499.00"));

    // 8. Controlled Domain Purchase
    assert.equal(report.steps.step8_domain_purchase.passed, true);
    assert.ok(report.domain.endsWith(".in"));

    // 9. Real Domain Verification
    assert.equal(report.steps.step9_domain_verification.passed, true);

    // 10. Vercel Hosting Attachment
    assert.equal(report.steps.step10_vercel_attachment.passed, true);

    // 11. DNS Resolution
    assert.equal(report.steps.step11_dns_configuration.passed, true);

    // 12. Real SSL Certificate
    assert.equal(report.steps.step12_ssl_verification.passed, true);

    // 13. Live Public Website
    assert.equal(report.steps.step13_live_website.passed, true);

    // 14. Public AI Agent Interaction
    assert.equal(report.steps.step14_public_agent.passed, true);

    // 15. Natural-Language Versioned Edit (v1 -> v2)
    assert.equal(report.steps.step15_natural_language_edit.passed, true);

    // 16. Publish Updated Version
    assert.equal(report.steps.step16_publish_v2.passed, true);

    // 17. Instant Safe Rollback (v2 -> v1)
    assert.equal(report.steps.step17_rollback.passed, true);

    // 18. Fail-Closed Live Purchase Lock Restored
    assert.equal(report.steps.step18_safety_reset.passed, true);
    assert.equal(report.safetyLockRestored, true);

    // 19. Unit Economics & Cost Accounting
    assert.equal(report.steps.step19_unit_economics.passed, true);
    assert.ok(report.cost.totalCostUsd > 0);
    assert.ok(report.cost.totalCostInr > 0);

    // Overall Status
    assert.equal(report.overallStatus, "PASS");
  });
});
