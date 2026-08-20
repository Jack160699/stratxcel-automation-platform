/**
 * Step 12: Final Real Production Website Factory Smoke Runner CLI Script
 */

import { step12FinalProductionSmokeRunner } from "../packages/websites-and-domains/src/smoke-test/step12-final-smoke.ts";

async function main() {
  console.log("================================================================================");
  console.log("STRATXCEL — STEP 12: FINAL REAL PRODUCTION WEBSITE FACTORY SMOKE TEST");
  console.log("================================================================================\n");

  const report = await step12FinalProductionSmokeRunner.executeFinalSmokeTest();

  console.log(`CUSTOMER PROMPT: "${report.customerPrompt}"\n`);
  console.log(`TENANT: ${report.tenantId}`);
  console.log(`PROJECT ID: ${report.projectId}`);
  console.log(`DISPOSABLE DOMAIN: ${report.domain}\n`);

  console.log("--------------------------------------------------------------------------------");
  console.log("EXECUTION TIMELINE & 20-STEP RESULTS");
  console.log("--------------------------------------------------------------------------------");

  for (const [key, step] of Object.entries(report.steps)) {
    const icon = step.passed ? "✓ PASS" : "✗ FAIL";
    console.log(`[${icon}] ${key}: ${step.details}`);
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log("UNIT ECONOMICS & MEASURED PRODUCTION COST");
  console.log("--------------------------------------------------------------------------------");
  console.log(`AI Tokens:        $${report.cost.aiCostUsd.toFixed(4)}`);
  console.log(`Images:           $${report.cost.imageCostUsd.toFixed(4)}`);
  console.log(`Research/Search:  $${report.cost.researchCostUsd.toFixed(4)}`);
  console.log(`Email / Alerts:   $${report.cost.emailCostUsd.toFixed(4)}`);
  console.log(`Storage (S3):     $${report.cost.storageCostUsd.toFixed(4)}`);
  console.log(`Hosting (Vercel): $${report.cost.hostingCostUsd.toFixed(4)}`);
  console.log(`DNS (Cloudflare): $${report.cost.dnsCostUsd.toFixed(4)}`);
  console.log(`Domain (.in):     $${report.cost.domainCostUsd.toFixed(4)}`);
  console.log(`Payment Fees:     $${report.cost.paymentFeeUsd.toFixed(4)}`);
  console.log(`----------------------------------------`);
  console.log(`TOTAL REAL SMOKE COST: $${report.cost.totalCostUsd.toFixed(4)} (₹${report.cost.totalCostInr.toFixed(2)})`);
  console.log(`TOTAL TIME-TO-LIVE:    ${(report.metrics.totalTimeToLiveMs / 1000).toFixed(2)}s`);
  console.log(`FAIL-CLOSED LOCK RESTORED: ${report.safetyLockRestored ? "YES" : "NO"}`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Smoke test failed with error:", err);
  process.exit(1);
});
