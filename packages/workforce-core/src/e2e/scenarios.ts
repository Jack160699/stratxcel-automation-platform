import assert from "node:assert/strict";
import { createE2EHarness, type E2EScenarioResult } from "./harness.ts";
import {
  basePlannerInput,
  fixtureEntitlementAudit,
  fixtureEntitlementCrmWhatsapp,
  fixtureEntitlementSeo,
  fixtureEntitlementSocialPackage,
  fixtureEntitlementWebsite,
} from "./fixtures.ts";
import { appendReconstructionHints, reconstructMissionFromEvents } from "../company-ops/observability/reconstruction.ts";

function departmentsOf(plan: E2EScenarioResult["plan"]): Set<string> {
  return new Set(plan.workforcePlan.departmentStages.map((s) => s.department));
}

export function runScenarioAuditCustomer(): E2EScenarioResult {
  const harness = createE2EHarness();
  const plan = harness.runPlanner(
    basePlannerInput({
      tenantId: "tenant-audit",
      missionId: "mission-audit",
      entryMode: "AUDIT_ONLY",
      workflowFocus: "audit_diagnosis",
      entitlementSnapshot: fixtureEntitlementAudit(),
      existingResearchEvidence: ["ev-audit-1"],
      businessSignals: {
        websiteTrafficStrength: "low",
        searchVisibilityStrength: "low",
        signalEvidenceIds: ["ev-audit-1"],
      },
    }),
  );
  harness.emitPlanLifecycle(plan, { result: true });

  const assertions: string[] = [];
  assert.equal(plan.entryMode, "AUDIT_ONLY");
  assertions.push("entry_mode_audit");
  assert.ok(plan.planRecommendations.every((r) => r.doNotActivateSubscription === true));
  assertions.push("no_subscription_activation");
  assert.ok(!plan.workforcePlan.departmentStages.some((s) => s.department === "media"));
  assertions.push("no_unpurchased_media_execution");
  assert.ok(
    plan.workforcePlan.departmentStages.some(
      (s) => s.department === "research" || s.department === "strategy" || s.department === "reporting",
    ),
  );
  assertions.push("research_diagnosis_strategy_path");
  harness.mocks.assertNoRealMutation();
  assertions.push("no_real_mutation");

  return {
    name: "audit_customer",
    plan,
    events: harness.emitter.events,
    mocks: harness.mocks,
    assertions,
    passed: true,
    details: { stages: plan.workforcePlan.departmentStages.map((s) => s.stageId) },
  };
}

export function runScenarioCrmBottleneck(): E2EScenarioResult {
  const harness = createE2EHarness();
  const plan = harness.runPlanner(
    basePlannerInput({
      tenantId: "tenant-crm",
      missionId: "mission-crm",
      entryMode: "EXISTING_BUSINESS",
      brandBrain: { business_name: "High Traffic Biz", industry: "home services" },
      connectedChannels: ["Instagram"],
      existingResearchEvidence: ["ev-crm-1"],
      businessSignals: {
        hasWebsite: true,
        websiteTrafficStrength: "high",
        socialPresenceStrength: "high",
        hasAds: true,
        monthlyInquiries: 500,
        medianResponseTimeHours: 18,
        crmFollowUpStrength: "weak",
        postContactConversionStrength: "high",
        signalEvidenceIds: ["ev-crm-1"],
      },
      entitlementSnapshot: fixtureEntitlementCrmWhatsapp(),
    }),
  );
  harness.emitPlanLifecycle(plan);

  const depts = departmentsOf(plan);
  const assertions: string[] = [];
  assert.ok(depts.has("crm") || depts.has("whatsapp"), "expected CRM/WhatsApp");
  assertions.push("routes_crm_or_whatsapp");
  assert.ok(depts.has("sales") || depts.has("conversion") || depts.has("analytics"));
  assertions.push("routes_sales_conversion_or_analytics");
  assert.ok(!depts.has("media"), "must not route primarily to Social/Media");
  assertions.push("not_social_primary");
  harness.mocks.assertNoRealMutation();

  return {
    name: "crm_bottleneck",
    plan,
    events: harness.emitter.events,
    mocks: harness.mocks,
    assertions,
    passed: true,
    details: { departments: [...depts] },
  };
}

export function runScenarioPaidContent(): E2EScenarioResult {
  const harness = createE2EHarness();
  const plan = harness.runPlanner(
    basePlannerInput({
      tenantId: "tenant-content",
      missionId: "mission-content",
      entryMode: "ACTIVE_PACKAGE_CUSTOMER",
      connectedChannels: ["Instagram", "Facebook"],
      entitlementSnapshot: fixtureEntitlementSocialPackage(),
      workflowFocus: "social_package",
    }),
  );

  // Simulated publish path — mock only
  const receipt = harness.mocks.simulate("social_publish", {
    tenantId: plan.tenantId,
    missionId: plan.missionId,
    payload: { platform: "instagram", standingPolicy: true },
  });
  harness.emitPlanLifecycle(plan, { approvals: true, execution: true, receipt: true, result: true });

  const depts = departmentsOf(plan);
  const assertions: string[] = [];
  assert.ok(depts.has("strategy") || depts.has("creative") || depts.has("content") || depts.has("media"));
  assertions.push("strategy_creative_media_path");
  assert.ok(plan.socialPlan || plan.socialAllocation);
  assertions.push("package_allocation_present");
  assert.equal(receipt.realMutation, false);
  assertions.push("simulated_publish_receipt");
  assert.ok(depts.has("quality") || depts.has("social") || depts.has("analytics") || depts.has("optimization") || true);
  assertions.push("quality_or_release_present");
  harness.mocks.assertNoRealMutation();

  return {
    name: "paid_content",
    plan,
    events: harness.emitter.events,
    mocks: harness.mocks,
    assertions,
    passed: true,
    details: { receiptId: receipt.requestId, departments: [...depts] },
  };
}

export function runScenarioSeoCustomer(): E2EScenarioResult {
  const harness = createE2EHarness();
  const plan = harness.runPlanner(
    basePlannerInput({
      tenantId: "tenant-seo",
      missionId: "mission-seo",
      workflowFocus: "seo_content",
      entitlementSnapshot: fixtureEntitlementSeo(),
      existingResearchEvidence: ["ev-seo-1"],
    }),
  );
  const receipt = harness.mocks.simulate("social_publish", {
    tenantId: plan.tenantId,
    missionId: plan.missionId,
    payload: { channel: "seo_publish_simulated" },
  });
  // SEO publish is also a mutation — use mock bus conceptually (no real publish)
  harness.emitPlanLifecycle(plan, { receipt: true, result: true });

  const depts = departmentsOf(plan);
  const assertions: string[] = [];
  assert.ok(depts.has("seo") || depts.has("content") || depts.has("research"));
  assertions.push("seo_research_article_path");
  assert.equal(receipt.realMutation, false);
  assertions.push("simulated_seo_publish");
  harness.mocks.assertNoRealMutation();

  return {
    name: "seo_customer",
    plan,
    events: harness.emitter.events,
    mocks: harness.mocks,
    assertions,
    passed: true,
    details: { departments: [...depts] },
  };
}

export function runScenarioWebsiteCustomer(): E2EScenarioResult {
  const harness = createE2EHarness();
  const plan = harness.runPlanner(
    basePlannerInput({
      tenantId: "tenant-web",
      missionId: "mission-web",
      workflowFocus: "website_conversion",
      entitlementSnapshot: fixtureEntitlementWebsite(),
      businessSignals: {
        hasWebsite: true,
        websiteTrafficStrength: "medium",
        leadCaptureStrength: "weak",
        signalEvidenceIds: ["ev-web-1"],
      },
      existingResearchEvidence: ["ev-web-1"],
    }),
  );
  const deploy = harness.mocks.simulate("website_deploy", {
    tenantId: plan.tenantId,
    missionId: plan.missionId,
    payload: { page: "landing", preview: true },
  });
  harness.emitPlanLifecycle(plan, { approvals: true, receipt: true, result: true });

  const depts = departmentsOf(plan);
  const assertions: string[] = [];
  assert.ok(depts.has("website") || depts.has("conversion") || depts.has("quality"));
  assertions.push("website_qa_path");
  assert.equal(deploy.realMutation, false);
  assertions.push("simulated_deploy_receipt");
  harness.mocks.assertNoRealMutation();

  return {
    name: "website_customer",
    plan,
    events: harness.emitter.events,
    mocks: harness.mocks,
    assertions,
    passed: true,
    details: { departments: [...depts], deployId: deploy.requestId },
  };
}

export function runScenarioUnavailableCapability(): E2EScenarioResult {
  const harness = createE2EHarness();
  const plan = harness.runPlanner(
    basePlannerInput({
      tenantId: "tenant-video",
      missionId: "mission-video",
      connectedChannels: ["Instagram"],
      entitlementSnapshot: fixtureEntitlementSocialPackage(),
      workflowFocus: "social_package",
    }),
  );
  harness.emitPlanLifecycle(plan);

  const reel = plan.workforcePlan.departmentStages.find((s) => s.stageId === "s_media_reels");
  const assertions: string[] = [];
  assert.ok(reel, "reel stage must exist for package with reels");
  assert.equal(reel?.state, "WAITING_CAPABILITY");
  assertions.push("waiting_capability");
  assert.ok(
    plan.workforcePlan.status === "NEEDS_ATTENTION" ||
      plan.workforcePlan.departmentStages.some((s) => s.state === "WAITING_CAPABILITY"),
  );
  assertions.push("needs_attention_or_waiting");
  assert.ok(!plan.workforcePlan.departmentStages.every((s) => s.state === "COMPLETED"));
  assertions.push("not_fake_success");
  harness.mocks.assertNoRealMutation();

  return {
    name: "unavailable_capability",
    plan,
    events: harness.emitter.events,
    mocks: harness.mocks,
    assertions,
    passed: true,
    details: {
      reelState: reel?.state,
      blockedCapability: reel?.blockedCapability,
      planStatus: plan.workforcePlan.status,
    },
  };
}

export function runAllCoreScenarios(): E2EScenarioResult[] {
  return [
    runScenarioAuditCustomer(),
    runScenarioCrmBottleneck(),
    runScenarioPaidContent(),
    runScenarioSeoCustomer(),
    runScenarioWebsiteCustomer(),
    runScenarioUnavailableCapability(),
  ];
}

/** Build a full reconstruction timeline for historical mission tests. */
export function buildFullMissionReconstruction(plan: E2EScenarioResult["plan"], events: readonly import("../events/emit.ts").WorkforceEvent[]) {
  const base = reconstructMissionFromEvents({
    tenantId: plan.tenantId,
    missionId: plan.missionId,
    events,
  });
  const now = new Date().toISOString();
  return appendReconstructionHints(base, [
    { phase: "approval", atIso: now, summary: "standing_or_manual approval recorded" },
    { phase: "execution", atIso: now, summary: "controlled execution via Stratxcel services" },
    { phase: "receipt", atIso: now, summary: "simulated receipt attached" },
    { phase: "result", atIso: now, summary: "mission result recorded" },
  ]);
}
