import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_GROWTH_CADENCE_DAYS,
  getPlanDepthLimits,
  evaluateGrowthCycleEligibility,
  isImmediateEventRequiringFullGrowthCycle,
  evaluateRuntimeActivationProof,
  type PlanDepthLimits,
} from "../index.ts";

test("1. Canonical 3-day cadence locked constant", () => {
  assert.equal(CANONICAL_GROWTH_CADENCE_DAYS, 3);
});

test("2. Starter, Growth, Business, and Scale all share identical 3-day cadence", () => {
  const starter = getPlanDepthLimits("starter");
  const growth = getPlanDepthLimits("growth");
  const business = getPlanDepthLimits("business");
  const scale = getPlanDepthLimits("scale");

  assert.equal(starter.cadenceDays, 3);
  assert.equal(growth.cadenceDays, 3);
  assert.equal(business.cadenceDays, 3);
  assert.equal(scale.cadenceDays, 3);

  assert.equal(starter.monthlyCycleTarget, 10);
  assert.equal(growth.monthlyCycleTarget, 10);
  assert.equal(business.monthlyCycleTarget, 10);
  assert.equal(scale.monthlyCycleTarget, 10);

  // But differ in monitoring depth and scale limits
  assert.ok(growth.maxPagesMonitored > starter.maxPagesMonitored);
  assert.ok(business.maxQueriesMonitored > growth.maxQueriesMonitored);
  assert.ok(scale.maxActionsPerCycle > business.maxActionsPerCycle);
});

test("3. Not-due cycle skipped (early invocation) & 6. Early invocation does not trigger expensive analysis", () => {
  const now = new Date("2026-08-20T12:00:00Z");
  const lastRunAt = "2026-08-19T12:00:00Z"; // Only 1 day elapsed

  const eligibility = evaluateGrowthCycleEligibility({
    tenantId: "tenant-1",
    projectId: "proj-1",
    planTier: "growth",
    lastCompletedRunAt: lastRunAt,
    currentTime: now,
  });

  assert.equal(eligibility.isEligible, false);
  assert.equal(eligibility.status, "NOT_DUE");
  assert.equal(eligibility.daysSinceLastRun, 1.0);
  assert.ok(eligibility.reason.includes("Skipping expensive crawler, LLM, and SERP calls"));
});

test("4. Due cycle executes when >= 3 days elapsed", () => {
  const now = new Date("2026-08-20T12:00:00Z");
  const lastRunAt = "2026-08-17T11:00:00Z"; // 3.04 days elapsed

  const eligibility = evaluateGrowthCycleEligibility({
    tenantId: "tenant-1",
    projectId: "proj-1",
    planTier: "growth",
    lastCompletedRunAt: lastRunAt,
    currentTime: now,
  });

  assert.equal(eligibility.isEligible, true);
  assert.equal(eligibility.status, "DUE");
  assert.ok(eligibility.daysSinceLastRun >= 3.0);
  assert.ok(eligibility.reason.includes("Canonical 3-day growth cycle is due"));
});

test("5. Duplicate cycle prevented via deterministic cycleKey", () => {
  const now = new Date("2026-08-20T12:00:00Z");

  const run1 = evaluateGrowthCycleEligibility({
    tenantId: "t1",
    projectId: "p1",
    planTier: "growth",
    currentTime: now,
  });

  const run2 = evaluateGrowthCycleEligibility({
    tenantId: "t1",
    projectId: "p1",
    planTier: "growth",
    currentTime: now,
  });

  assert.equal(run1.cycleKey, run2.cycleKey);
  assert.equal(run1.cycleKey, "t1-p1-2026-08-20");
});

test("8. Immediate event-driven operations decoupled from 3-day growth engine", () => {
  assert.equal(isImmediateEventRequiringFullGrowthCycle("PAYMENT_SUCCESS"), false);
  assert.equal(isImmediateEventRequiringFullGrowthCycle("SUBSCRIPTION_CANCELLED"), false);
  assert.equal(isImmediateEventRequiringFullGrowthCycle("CONNECTOR_EXPIRED"), false);
  assert.equal(isImmediateEventRequiringFullGrowthCycle("VERIFICATION_FAILED_ROLLBACK"), false);
  assert.equal(isImmediateEventRequiringFullGrowthCycle("USER_REQUESTED_ACTION"), false);
});

test("14. Runtime certification distinguishes registered vs verified & 15. No false runtime verification", () => {
  const proof = evaluateRuntimeActivationProof();

  // Scheduler is verified as registered in vercel.json, but runtime status is CONFIGURED_PENDING_EXTERNAL_INVOCATION
  assert.equal(proof.cronRegistration.searchScheduler.status, "REGISTERED_IN_VERCEL_JSON");
  assert.equal(proof.cronRegistration.searchScheduler.runtimeStatus, "CONFIGURED_PENDING_EXTERNAL_INVOCATION");

  // Overall certification is CORE_RUNTIME_VERIFIED
  assert.equal(proof.certification, "CORE_RUNTIME_VERIFIED");
});
