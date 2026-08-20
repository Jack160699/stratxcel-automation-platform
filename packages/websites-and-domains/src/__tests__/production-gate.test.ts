/**
 * Production Configuration & Safety Gate Test Suite
 *
 * Verifies:
 * 1. Production with missing credentials → FAIL
 * 2. Production with sandbox registrar → FAIL
 * 3. Production with sandbox hosting → FAIL
 * 4. Production with missing live-purchase flag → FAIL
 * 5. Production with missing live-hosting flag → FAIL
 * 6. Production with complete configuration → PASS
 * 7. Security: Zero secret leakage in reports/exceptions
 */

import { strict as assert } from "node:assert";
import {
  validateProductionGate,
  assertDomainPurchaseAllowed,
  assertLiveHostingDeploymentAllowed,
  resolveAppEnvironment,
} from "../config/production-gate.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: unknown) {
    failed++;
    console.error(`  ✗ ${name}: ${(err as Error).message}`);
  }
}

console.log("\n==================================================");
console.log("PRODUCTION CONFIGURATION GATE TEST SUITE");
console.log("==================================================\n");

// Complete valid mock production environment dictionary
const completeProductionEnv: Record<string, string> = {
  APP_ENV: "production",
  DOMAIN_REGISTRAR_MODE: "live",
  ALLOW_LIVE_DOMAIN_PURCHASES: "true",
  DOMAIN_REGISTRAR_API_KEY: "mock_reg_key_12345",
  DOMAIN_REGISTRAR_API_SECRET: "mock_reg_secret_67890",
  HOSTING_PROVIDER_MODE: "live",
  ALLOW_LIVE_HOSTING_DEPLOYMENTS: "true",
  VERCEL_AUTH_TOKEN: "mock_vercel_token_abcde",
  VERCEL_PROJECT_ID: "prj_stratxcel_prod",
  RAZORPAY_KEY_ID: "rzp_live_111111",
  RAZORPAY_KEY_SECRET: "mock_rzp_secret_222222",
  RAZORPAY_WEBHOOK_SECRET: "mock_webhook_secret_333333",
  GEMINI_API_KEY: "mock_gemini_key_444444",
};

// 1. Production with missing credentials → FAIL
test("Production with missing credentials → FAIL (readyForLiveOperations: false)", () => {
  const incompleteEnv: Record<string, string> = {
    APP_ENV: "production",
    DOMAIN_REGISTRAR_MODE: "live",
    ALLOW_LIVE_DOMAIN_PURCHASES: "true",
    HOSTING_PROVIDER_MODE: "live",
    ALLOW_LIVE_HOSTING_DEPLOYMENTS: "true",
    // Missing registrar, hosting, razorpay, and AI credentials
  };

  const report = validateProductionGate(incompleteEnv);
  assert.equal(report.environment, "production");
  assert.equal(report.readyForLiveOperations, false);
  assert.ok(report.errors.length >= 4, `Expected at least 4 errors, got ${report.errors.length}`);
  assert.ok(report.errors.some((e) => e.includes("DOMAIN_REGISTRAR_API_KEY")));
  assert.ok(report.errors.some((e) => e.includes("VERCEL_AUTH_TOKEN")));
  assert.ok(report.errors.some((e) => e.includes("GEMINI_API_KEY")));
  assert.ok(report.errors.some((e) => e.includes("RAZORPAY_KEY_ID")));
});

// 2. Production with sandbox registrar → FAIL
test("Production with sandbox registrar → FAIL", () => {
  const sandboxRegistrarEnv = {
    ...completeProductionEnv,
    DOMAIN_REGISTRAR_MODE: "sandbox",
  };

  const report = validateProductionGate(sandboxRegistrarEnv);
  assert.equal(report.environment, "production");
  assert.equal(report.readyForLiveOperations, false);
  assert.ok(report.errors.some((e) => e.includes("DOMAIN_REGISTRAR_MODE must be 'live'")));
});

// 3. Production with sandbox hosting → FAIL
test("Production with sandbox hosting → FAIL", () => {
  const sandboxHostingEnv = {
    ...completeProductionEnv,
    HOSTING_PROVIDER_MODE: "sandbox",
  };

  const report = validateProductionGate(sandboxHostingEnv);
  assert.equal(report.environment, "production");
  assert.equal(report.readyForLiveOperations, false);
  assert.ok(report.errors.some((e) => e.includes("HOSTING_PROVIDER_MODE must be 'live'")));
});

// 4. Production with missing live-purchase flag → FAIL
test("Production with missing live-purchase flag → FAIL", () => {
  const noPurchaseFlagEnv = {
    ...completeProductionEnv,
    ALLOW_LIVE_DOMAIN_PURCHASES: "false",
  };

  const report = validateProductionGate(noPurchaseFlagEnv);
  assert.equal(report.readyForLiveOperations, false);
  assert.ok(report.errors.some((e) => e.includes("ALLOW_LIVE_DOMAIN_PURCHASES=true is missing")));
});

// 5. Production with missing live-hosting flag → FAIL
test("Production with missing live-hosting flag → FAIL", () => {
  const noHostingFlagEnv = {
    ...completeProductionEnv,
    ALLOW_LIVE_HOSTING_DEPLOYMENTS: "false",
  };

  const report = validateProductionGate(noHostingFlagEnv);
  assert.equal(report.readyForLiveOperations, false);
  assert.ok(report.errors.some((e) => e.includes("ALLOW_LIVE_HOSTING_DEPLOYMENTS=true is missing")));
});

// 6. Production with complete configuration → PASS
test("Production with complete configuration → PASS (readyForLiveOperations: true)", () => {
  const report = validateProductionGate(completeProductionEnv);
  assert.equal(report.environment, "production");
  assert.equal(report.readyForLiveOperations, true);
  assert.equal(report.errors.length, 0);
  assert.equal(report.domainRegistrarConfigured, true);
  assert.equal(report.hostingProviderConfigured, true);
  assert.equal(report.aiProviderConfigured, true);
  assert.equal(report.razorpayConfigured, true);
});

// 7. Security: Zero secret leakage in reports/exceptions
test("Security: Zero secret leakage in report serialized JSON", () => {
  const report = validateProductionGate(completeProductionEnv);
  const serialized = JSON.stringify(report);

  // Assert secret values are NOT in the report
  assert.equal(serialized.includes("mock_reg_secret_67890"), false);
  assert.equal(serialized.includes("mock_vercel_token_abcde"), false);
  assert.equal(serialized.includes("mock_rzp_secret_222222"), false);
  assert.equal(serialized.includes("mock_webhook_secret_333333"), false);
  assert.equal(serialized.includes("mock_gemini_key_444444"), false);
});

// 8. assertDomainPurchaseAllowed runtime exceptions
test("assertDomainPurchaseAllowed throws in production if ALLOW_LIVE_DOMAIN_PURCHASES != true", () => {
  assert.throws(
    () =>
      assertDomainPurchaseAllowed("live", {
        ALLOW_LIVE_DOMAIN_PURCHASES: "false",
        DOMAIN_REGISTRAR_API_KEY: "key",
        DOMAIN_REGISTRAR_API_SECRET: "secret",
      }),
    /ALLOW_LIVE_DOMAIN_PURCHASES=true is required/
  );
});

// 9. assertLiveHostingDeploymentAllowed runtime exceptions
test("assertLiveHostingDeploymentAllowed throws in production if ALLOW_LIVE_HOSTING_DEPLOYMENTS != true", () => {
  assert.throws(
    () =>
      assertLiveHostingDeploymentAllowed("live", {
        ALLOW_LIVE_HOSTING_DEPLOYMENTS: "false",
        VERCEL_AUTH_TOKEN: "token",
        VERCEL_PROJECT_ID: "proj",
      }),
    /ALLOW_LIVE_HOSTING_DEPLOYMENTS=true is required/
  );
});

console.log("\n==================================================");
console.log(`PRODUCTION GATE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log("==================================================\n");

if (failed > 0) process.exit(1);
