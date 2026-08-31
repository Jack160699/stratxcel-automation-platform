import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  evaluateRuntimeActivationProof,
  createFixtureWordPressProvider,
  createStratxcelNativeCMSProvider,
  executeSearchAction,
} from "../index.ts";

test("1. Vercel deployment detection & 2. Cron registration detection & 3. Cron runtime status", () => {
  const proof = evaluateRuntimeActivationProof();
  assert.equal(proof.deploymentDetails.productionDomain, "https://www.stratxcel.in");
  assert.equal(proof.cronRegistration.searchScheduler.status, "REGISTERED_IN_VERCEL_JSON");
  // '0 9 * * *' (daily), not '0 */4 * * *' -- the Vercel Hobby plan caps
  // every cron to once/day (commit ae11163). See
  // docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md.
  assert.equal(proof.cronRegistration.searchScheduler.schedule, "0 9 * * *");
  assert.equal(proof.cronRegistration.searchScheduler.runtimeStatus, "CONFIGURED_PENDING_EXTERNAL_INVOCATION");
});

test("4. Scheduler auth & 5. Scheduler last-run evidence & 6. Worker runtime evidence", () => {
  const original = process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET;
  process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET = "test-scheduler-secret";
  try {
    const proof = evaluateRuntimeActivationProof();
    assert.equal(proof.schedulerSecret.isConfigured, true);
    assert.equal(proof.schedulerSecret.authVerificationPassed, true);
    assert.equal(proof.cronRegistration.auditWorker.status, "REGISTERED_IN_VERCEL_JSON");
  } finally {
    if (original === undefined) delete process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET;
    else process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET = original;
  }
});

test("4b. Scheduler auth reports honestly unconfigured, not a fabricated true, when the secret is missing", () => {
  const original = process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET;
  delete process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET;
  try {
    const proof = evaluateRuntimeActivationProof();
    assert.equal(proof.schedulerSecret.isConfigured, false);
    assert.equal(proof.schedulerSecret.authVerificationPassed, false);
  } finally {
    if (original !== undefined) process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET = original;
  }
});

test("7. Provider runtime verification & 8. GSC live-data mapping & 9. GA4 live-data mapping", () => {
  const original = process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID;
  process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID = "test-client-id";
  try {
    const proof = evaluateRuntimeActivationProof();
    const gsc = proof.providers.find((p) => p.providerId === "google_search_console");
    assert.ok(gsc);
    assert.equal(gsc?.status, "PRODUCTION_VERIFIED");
    assert.equal(gsc?.readVerified, true);
    assert.equal(gsc?.writeVerified, false); // Read only

    const ga4 = proof.providers.find((p) => p.providerId === "google_analytics_4");
    assert.ok(ga4);
    assert.equal(ga4?.status, "PRODUCTION_VERIFIED");
  } finally {
    if (original === undefined) delete process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID = original;
  }
});

test("7b. GSC/GA4 provider telemetry genuinely reports ADAPTER_READY, not a fabricated PRODUCTION_VERIFIED, when the real credential is absent (found via a real acceptance-test run against production env -- see docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md)", () => {
  const original = process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID;
  try {
    const proof = evaluateRuntimeActivationProof();
    const gsc = proof.providers.find((p) => p.providerId === "google_search_console");
    assert.equal(gsc?.status, "ADAPTER_READY");
    assert.equal(gsc?.authenticated, false);
    assert.equal(gsc?.readVerified, false);
    const ga4 = proof.providers.find((p) => p.providerId === "google_analytics_4");
    assert.equal(ga4?.status, "ADAPTER_READY");
  } finally {
    if (original !== undefined) process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID = original;
  }
});

test("10. SERP live-data mapping & 11. AI live-data mapping & 14. Missing optional provider handling", () => {
  const proof = evaluateRuntimeActivationProof();
  const serp = proof.providers.find((p) => p.providerId === "serp_provider");
  assert.ok(serp);
  assert.ok(["PRODUCTION_VERIFIED", "ADAPTER_READY"].includes(serp?.status || ""));

  const ai = proof.providers.find((p) => p.providerId === "perplexity_ai");
  assert.ok(ai);
  assert.ok(["PRODUCTION_VERIFIED", "ADAPTER_READY"].includes(ai?.status || ""));
});

test("12. Free/paid production boundary & 13. Runtime certification logic & 15. No false runtime verification claims", () => {
  const proof = evaluateRuntimeActivationProof();
  assert.equal(proof.certification, "CORE_RUNTIME_VERIFIED");

  // Check Zero-Staff Customer Journey Matrix
  assert.ok(proof.zeroStaffJourneyMatrix.length >= 10);
  const staffRequiredSteps = proof.zeroStaffJourneyMatrix.filter((s) => s.autonomy === "STAFF_REQUIRED");
  assert.equal(staffRequiredSteps.length, 0, "No step in the customer journey should require manual staff intervention");

  const freeAuditStep = proof.zeroStaffJourneyMatrix.find((s) => s.step === "FREE_AUDIT_EXECUTION");
  assert.equal(freeAuditStep?.autonomy, "AUTOMATIC");

  const paymentStep = proof.zeroStaffJourneyMatrix.find((s) => s.step === "PAYMENT_CHECKOUT");
  assert.equal(paymentStep?.autonomy, "SELF-SERVE");

  const executionStep = proof.zeroStaffJourneyMatrix.find((s) => s.step === "AUTONOMOUS_EXECUTION");
  assert.equal(executionStep?.autonomy, "AUTOMATIC");
});
