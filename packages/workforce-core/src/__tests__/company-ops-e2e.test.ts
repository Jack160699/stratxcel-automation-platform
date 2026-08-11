// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/company-ops-e2e.test.ts
import assert from "node:assert/strict";
import { createMissionBudget } from "../budgets/hierarchy.ts";
import {
  assertEngineeringNoHostTools,
  assertFinanceCannotCharge,
  assertNoCasualDestructiveDeletion,
  attemptFinanceCharge,
  buildAdminViewContract,
  buildCustomerLifecycleIntelligence,
  buildCustomerViewContract,
  buildFinanceSnapshot,
  buildMissionCostVisibility,
  buildOffboardingWorkflow,
  buildOnboardingReadiness,
  buildOperationsOversight,
  createInfrastructureIncidentHandoff,
  diagnoseEngineeringIssue,
  evaluateEntitlementHealth,
  FinanceChargeDeniedError,
  isPlanExhausted,
  listBlockedMissions,
  reconstructMissionFromEvents,
  surfacePaymentFailure,
} from "../company-ops/index.ts";
import { SecurityValidationError } from "../security/narrowing.ts";
import {
  assertRecoveryIdempotent,
  basePlannerInput,
  buildFullMissionReconstruction,
  createE2EHarness,
  fixtureCompanyOpsContext,
  fixtureEntitlementExhausted,
  fixtureEntitlementSocialPackage,
  proveTenantIsolation,
  runAllCoreScenarios,
  runScenarioUnavailableCapability,
} from "../e2e/index.ts";

function run() {
  // --- 6 E2E scenarios ---
  const scenarios = runAllCoreScenarios();
  assert.equal(scenarios.length, 6);
  for (const s of scenarios) {
    assert.equal(s.passed, true, `scenario ${s.name} failed`);
    assert.ok(s.assertions.length > 0, `scenario ${s.name} has no assertions`);
  }
  assert.ok(scenarios.some((s) => s.name === "audit_customer"));
  assert.ok(scenarios.some((s) => s.name === "crm_bottleneck"));
  assert.ok(scenarios.some((s) => s.name === "paid_content"));
  assert.ok(scenarios.some((s) => s.name === "seo_customer"));
  assert.ok(scenarios.some((s) => s.name === "website_customer"));
  assert.ok(scenarios.some((s) => s.name === "unavailable_capability"));

  const unavailable = runScenarioUnavailableCapability();
  assert.equal(unavailable.details.reelState, "WAITING_CAPABILITY");

  // --- Two-tenant concurrency ---
  const iso = proveTenantIsolation();
  assert.equal(iso.passed, true);
  assert.equal(iso.overlaps.length, 0);

  // --- Recovery / idempotency ---
  const harness = createE2EHarness();
  const plan = harness.runPlanner(
    basePlannerInput({
      connectedChannels: ["Instagram"],
      entitlementSnapshot: fixtureEntitlementSocialPackage(),
      workflowFocus: "social_package",
    }),
  );
  assertRecoveryIdempotent({
    tenantId: plan.tenantId,
    missionId: plan.missionId,
    stages: plan.workforcePlan.departmentStages,
  });

  // --- Usage / cost unknown handling ---
  const cost = buildMissionCostVisibility({
    tenantId: "t1",
    missionId: "m1",
    budget: { estimatedCents: null, reservedCents: 0, actualCents: null },
    providerReportedCents: null,
  });
  assert.equal(cost.estimated.known, false);
  assert.equal(cost.actual.known, false);
  assert.equal(cost.providerReported.known, false);
  if (!cost.providerReported.known) {
    assert.equal(cost.providerReported.reason, "provider_not_reported");
  }

  // --- Customer success readiness ---
  const csIncomplete = buildCustomerLifecycleIntelligence(
    fixtureCompanyOpsContext({
      brandBrainComplete: false,
      purchasedServices: ["social_package"],
      integrations: { social: false },
      approvalsWaiting: 1,
    }),
  );
  assert.ok(csIncomplete.readiness.missingRequired.includes("brand_brain"));
  assert.ok(csIncomplete.alerts.some((a) => a.code === "BRAND_BRAIN_INCOMPLETE"));
  assert.ok(csIncomplete.alerts.some((a) => a.code === "APPROVAL_WAITING"));
  assert.notEqual(csIncomplete.nextAction.kind, "none");

  const readiness = buildOnboardingReadiness(
    fixtureCompanyOpsContext({
      purchasedServices: ["social_package"],
      brandBrainComplete: true,
      integrations: { social: true },
    }),
  );
  assert.equal(readiness.items.find((i) => i.dimension === "whatsapp")?.status, "NOT_REQUIRED");
  assert.equal(readiness.items.find((i) => i.dimension === "ads")?.status, "NOT_REQUIRED");

  // --- Operations blocked mission view ---
  const ops = buildOperationsOversight([
    {
      tenantId: "t1",
      missionId: "m-blocked",
      status: "NEEDS_ATTENTION",
      stages: [
        {
          stageId: "s_media_reels",
          department: "media",
          state: "WAITING_CAPABILITY",
          blockedCapability: "media.video_generation",
          attempts: 1,
          maxAttempts: 3,
        },
      ],
      approvalsWaiting: 2,
      humanHandoffsOpen: 1,
      workerHealthy: true,
    },
  ]);
  assert.equal(ops.scope, "mission_execution");
  assert.equal(ops.blockedMissions.length, 1);
  assert.ok(ops.issues.some((i) => i.kind === "waiting_capability"));
  assert.equal(listBlockedMissions(ops.queue).length, 1);

  // --- Finance cannot charge ---
  const finance = buildFinanceSnapshot({
    tenantId: "t1",
    entitlementSnapshot: fixtureEntitlementSocialPackage(),
    paymentState: "current",
    budget: createMissionBudget(10000),
  });
  assert.equal(finance.chargingAuthority, "NONE");
  assert.equal(finance.canAutonomouslyCharge, false);
  const chargeAttempt = attemptFinanceCharge({
    tenantId: "t1",
    amountCents: 500,
    reason: "test",
  });
  assert.equal(chargeAttempt.charged, false);
  assert.equal(chargeAttempt.mutated, false);
  assert.throws(() => assertFinanceCannotCharge(), (err: unknown) => err instanceof FinanceChargeDeniedError);

  // --- Plan exhaustion ---
  const exhausted = evaluateEntitlementHealth(fixtureEntitlementExhausted(), "current");
  assert.ok(exhausted.some((h) => h.health === "EXHAUSTED"));
  assert.equal(isPlanExhausted(exhausted), true);

  // --- Payment failure surfaces but does not mutate ---
  const surfaced = surfacePaymentFailure("failed");
  assert.equal(surfaced.paymentState, "failed");
  assert.equal(surfaced.mutated, false);
  assert.equal(surfaced.customerVisibleMutation, false);
  const pausedHealth = evaluateEntitlementHealth(fixtureEntitlementSocialPackage(), "failed");
  assert.ok(pausedHealth.every((h) => h.health === "PAUSED"));

  // --- Engineering cannot access host terminal ---
  assert.throws(() => assertEngineeringNoHostTools(["terminal"]), (err: unknown) => err instanceof SecurityValidationError);
  assert.throws(() => assertEngineeringNoHostTools(["shell"]));
  assert.throws(() => assertEngineeringNoHostTools(["code_execution"]));
  const diagnosis = diagnoseEngineeringIssue({
    tenantId: "t1",
    missionId: "m1",
    summary: "OAuth integration disconnected for Instagram",
    signals: { integrationKey: "instagram" },
  });
  assert.equal(diagnosis.hostToolAccess, "DENIED");
  assert.equal(diagnosis.classification, "integration");
  const incident = createInfrastructureIncidentHandoff({
    tenantId: "t1",
    missionId: "m1",
    summary: "Worker queue down",
  });
  assert.equal(incident.hostToolAccess, "DENIED");
  assert.equal(incident.executionAuthority, "STRATXCEL_SERVICES_ONLY");

  // --- Historical mission reconstruction ---
  harness.emitPlanLifecycle(plan, {
    approvals: true,
    execution: true,
    receipt: true,
    result: true,
  });
  const reconstruction = buildFullMissionReconstruction(plan, harness.emitter.events);
  assert.equal(reconstruction.secretsPresent, false);
  assert.ok(reconstruction.timeline.some((t) => t.phase === "ceo_plan"));
  assert.ok(reconstruction.timeline.length > 0);

  assert.throws(() =>
    reconstructMissionFromEvents({
      tenantId: "t1",
      missionId: "m1",
      events: [
        {
          name: "workforce.plan.created",
          atIso: new Date().toISOString(),
          payload: {
            tenantId: "t1",
            missionId: "m1",
            data: { api_key: "sk-leak" },
          },
        },
      ],
    }),
  );

  // --- Customer + admin view contracts ---
  const customerView = buildCustomerViewContract({
    plan,
    nextAction: csIncomplete.nextAction,
  });
  assert.ok(customerView.yourBusiness);
  assert.ok(customerView.thirtyDayPlanSummary);
  assert.ok(customerView.whatNeedsYou.length >= 0);

  const adminView = buildAdminViewContract({
    plan: plan.workforcePlan,
    latencyMs: 1200,
    providers: [{ name: "mock", status: "ok" }],
  });
  assert.equal(adminView.credentialsIncluded, false);
  assert.ok(adminView.departments.length > 0);
  assert.ok(adminView.stages.length > 0);

  // --- Offboarding safe ---
  const offboarding = buildOffboardingWorkflow({
    tenantId: "t1",
    trigger: "data_deletion_request",
  });
  assert.equal(offboarding.deletionAuthority, "HUMAN_HANDOFF_ONLY");
  assert.equal(offboarding.automationPaused, true);
  assert.ok(offboarding.steps.some((s) => s.destructive && s.status === "HANDED_OFF"));
  assertNoCasualDestructiveDeletion(offboarding);

  console.log("company-ops-e2e.test.ts (@stratxcel/workforce-core): ALL PASS");
}

run();
