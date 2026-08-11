// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/performance-intelligence.test.ts
import assert from "node:assert/strict";
import { createMissionBudget } from "../budgets/hierarchy.ts";
import type { EvidenceReference } from "../evidence/types.ts";
import { snapshotFromContract } from "../planning/allocation.ts";
import { planBusinessGrowth } from "../planning/thirty-day-planner.ts";
import type { BusinessGrowthPlannerInput } from "../planning/types.ts";
import {
  applyLearningRevision,
  assertAttributionUncertaintyPreserved,
  assertNoExternalMutation,
  attachBaseline,
  buildAdminPerformanceReport,
  buildCustomerPerformanceReport,
  buildMonthlyGrowthReview,
  buildWeeklyPerformanceReview,
  compareToBaseline,
  createAttributionLink,
  createBaselineReference,
  createCostObservation,
  createMetricObservation,
  detectAnomalies,
  linkReceiptToMetric,
  observationToMeasuredSignal,
  proposeOptimization,
  recordMissingMetric,
  refuseEstimatedCost,
  rejectOpinionAsEvidence,
  resolveAttributionConfidence,
  selectKpisForContext,
  toUsageAccounting,
  MetricFabricationError,
} from "../performance/index.ts";
import type { ExecutionReceipt, MetricObservation } from "../performance/types.ts";

function evidence(id: string, claim: string): EvidenceReference {
  return {
    id,
    source: "test",
    retrievedAtIso: "2026-08-11T00:00:00.000Z",
    summary: `Evidence ${id}`,
    supportedClaims: [claim],
    confidence: "high",
  };
}

function period(start = "2026-08-01", end = "2026-08-07") {
  return { granularity: "week" as const, startIso: start, endIso: end };
}

function basePlanInput(overrides: Partial<BusinessGrowthPlannerInput> = {}): BusinessGrowthPlannerInput {
  return {
    tenantId: "tenant-1",
    missionId: "mission-1",
    timezone: "Asia/Kolkata",
    currentDateIso: "2026-08-11T00:00:00.000Z",
    brandBrain: { business_name: "Test Co", industry: "services" },
    productsServices: ["Consulting"],
    targetAudience: "local buyers",
    geography: "Raipur",
    positioning: "Trusted local expert",
    connectedChannels: ["Facebook"],
    businessGoals: ["Improve growth systems"],
    previousPerformance: [],
    existingResearchEvidence: ["ev-plan-1"],
    activeCampaigns: [],
    availableCapabilities: [],
    entitlementSnapshot: snapshotFromContract({
      allocationPolicy: "FIXED_COMPOSITION",
      packageComposition: [
        { mediaType: "image", quantity: 8 },
        { mediaType: "reel", quantity: 4 },
      ],
      relevantEntitlements: { social_posts: 12 },
      currentUsage: { social_posts: 4 },
    }),
    budgetEnvelope: createMissionBudget(50000),
    entryMode: "ACTIVE_PACKAGE_CUSTOMER",
    businessSignals: {
      hasWebsite: true,
      websiteTrafficStrength: "medium",
      signalEvidenceIds: ["ev-plan-1"],
    },
    ...overrides,
  };
}

function run() {
  const missing = recordMissingMetric({
    tenantId: "tenant-1",
    metric: "leads",
    reason: "no_data",
    source: "crm",
    period: period(),
    retrievedAt: "2026-08-11T00:00:00.000Z",
  });
  assert.equal(missing.reason, "no_data");
  assert.throws(
    () =>
      createMetricObservation({
        id: "m-fake",
        tenantId: "tenant-1",
        metric: "leads",
        value: Number.NaN,
        unit: "count",
        period: period(),
        source: "crm",
        retrievedAt: "2026-08-11T00:00:00.000Z",
        evidence: [evidence("e1", "leads")],
        confidence: "high",
      }),
    MetricFabricationError,
  );
  assert.throws(
    () =>
      createMetricObservation({
        id: "m-no-ev",
        tenantId: "tenant-1",
        metric: "leads",
        value: 0,
        unit: "count",
        period: period(),
        source: "crm",
        retrievedAt: "2026-08-11T00:00:00.000Z",
        evidence: [],
        confidence: "high",
      }),
    /metric_requires_evidence/,
  );

  const receipt: ExecutionReceipt = {
    id: "rcpt-1",
    tenantId: "tenant-1",
    missionId: "mission-1",
    planId: "plan-1",
    domain: "social",
    action: "publish_post",
    occurredAtIso: "2026-08-05T10:00:00.000Z",
    success: true,
    evidenceIds: ["ev-rcpt-1"],
  };
  const linked = linkReceiptToMetric({
    receipt,
    observationId: "obs-reach",
    metric: "social_reach",
    value: 1200,
    unit: "count",
    period: period(),
    evidence: [evidence("ev-rcpt-1", "social_reach")],
    confidence: "high",
    retrievedAt: "2026-08-06T00:00:00.000Z",
  });
  assert.equal(linked.receiptId, "rcpt-1");
  assert.equal(linked.source, "social");
  assert.equal(linked.value, 1200);

  const unknownAttr = createAttributionLink({
    id: "attr-1",
    tenantId: "tenant-1",
    causeRef: "instagram:post-9",
    effectObservationId: "obs-sale",
    confidence: "UNKNOWN",
    evidenceIds: [],
    rationale: "Insufficient provenance to claim the post generated the sale",
    createdAtIso: "2026-08-11T00:00:00.000Z",
  });
  assert.equal(unknownAttr.confidence, "UNKNOWN");
  assertAttributionUncertaintyPreserved(unknownAttr);
  assert.throws(
    () =>
      createAttributionLink({
        id: "attr-bad",
        tenantId: "tenant-1",
        causeRef: "instagram:post-9",
        effectObservationId: "obs-sale",
        confidence: "DIRECT",
        evidenceIds: [],
        rationale: "fake claim",
        createdAtIso: "2026-08-11T00:00:00.000Z",
      }),
    /direct_attribution_requires_evidence/,
  );
  assert.equal(
    resolveAttributionConfidence({
      requested: "DIRECT",
      evidenceIds: [],
      hasDirectProvenance: false,
    }),
    "UNKNOWN",
  );

  const obs: MetricObservation = createMetricObservation({
    id: "obs-sessions",
    tenantId: "tenant-1",
    metric: "website_sessions",
    value: 100,
    unit: "count",
    period: period(),
    source: "ga4",
    retrievedAt: "2026-08-08T00:00:00.000Z",
    evidence: [evidence("ev-ga4-1", "website_sessions")],
    confidence: "high",
  });
  const missingBaseline = createBaselineReference({ kind: "pre_execution", missing: true });
  const cmpMissing = compareToBaseline(obs, missingBaseline);
  assert.equal(cmpMissing.comparable, false);
  assert.equal(cmpMissing.delta, null);
  const withBaseline = attachBaseline(
    obs,
    createBaselineReference({
      kind: "previous_period",
      value: 80,
      unit: "count",
      period: period("2026-07-25", "2026-07-31"),
    }),
  );
  const cmp = compareToBaseline(withBaseline, withBaseline.baselineRef!);
  assert.equal(cmp.comparable, true);
  assert.equal(cmp.delta, 20);

  const seoKpis = selectKpisForContext({ tenantId: "tenant-1", context: "seo_focused" });
  const crmKpis = selectKpisForContext({ tenantId: "tenant-1", context: "crm_conversion" });
  assert.ok(seoKpis.primaryKpis.includes("organic_impressions"));
  assert.ok(crmKpis.primaryKpis.includes("response_time_hours"));
  assert.notDeepEqual(seoKpis.primaryKpis, crmKpis.primaryKpis);

  const priorTraffic = createMetricObservation({
    id: "obs-t0",
    tenantId: "tenant-1",
    metric: "website_sessions",
    value: 10,
    unit: "count",
    period: period("2026-07-25", "2026-07-31"),
    source: "ga4",
    retrievedAt: "2026-08-01T00:00:00.000Z",
    evidence: [evidence("ev-t0", "website_sessions")],
    confidence: "medium",
  });
  const currentTraffic = createMetricObservation({
    id: "obs-t1",
    tenantId: "tenant-1",
    metric: "website_sessions",
    value: 4,
    unit: "count",
    period: period(),
    source: "ga4",
    retrievedAt: "2026-08-08T00:00:00.000Z",
    evidence: [evidence("ev-t1", "website_sessions")],
    confidence: "medium",
  });
  const tinyFlags = detectAnomalies({
    tenantId: "tenant-1",
    observations: [currentTraffic],
    priorObservations: [priorTraffic],
    nowIso: "2026-08-11T00:00:00.000Z",
  });
  assert.ok(tinyFlags.some((f) => f.kind === "sudden_traffic_drop"));
  assert.ok(tinyFlags.every((f) => f.kind !== "sudden_traffic_drop" || f.severity === "low"));

  const trackingFlags = detectAnomalies({
    tenantId: "tenant-1",
    observations: [],
    integrationFlags: [{ source: "ga4", kind: "tracking_loss", evidenceId: "ev-track-loss" }],
    nowIso: "2026-08-11T00:00:00.000Z",
  });
  assert.ok(trackingFlags.some((f) => f.kind === "tracking_loss" && f.severity === "high"));

  const flat = attachBaseline(obs, createBaselineReference({ kind: "previous_period", value: 100, unit: "count" }));
  const continueRec = proposeOptimization({
    id: "opt-continue",
    tenantId: "tenant-1",
    planId: "plan-1",
    target: "overall",
    observations: [flat],
    attributions: [],
    anomalies: [],
    evidenceIds: ["ev-ga4-1"],
    nowIso: "2026-08-11T00:00:00.000Z",
    preferContinueWhenHealthy: true,
  });
  assert.equal(continueRec.action, "CONTINUE");
  assert.equal(continueRec.shouldRevisePlan, false);
  assert.equal(continueRec.mutatesExternalSystems, false);
  assertNoExternalMutation(continueRec);

  const failObs = createMetricObservation({
    id: "obs-fail",
    tenantId: "tenant-1",
    metric: "publishing_failures",
    value: 5,
    unit: "count",
    period: period(),
    source: "social",
    retrievedAt: "2026-08-08T00:00:00.000Z",
    evidence: [evidence("ev-fail", "publishing_failures")],
    confidence: "high",
  });
  const failAnomalies = detectAnomalies({
    tenantId: "tenant-1",
    observations: [failObs],
    nowIso: "2026-08-11T00:00:00.000Z",
  });
  const pauseRec = proposeOptimization({
    id: "opt-pause",
    tenantId: "tenant-1",
    planId: "plan-1",
    target: "social_publishing",
    observations: [failObs],
    attributions: [],
    anomalies: failAnomalies,
    evidenceIds: ["ev-fail"],
    nowIso: "2026-08-11T00:00:00.000Z",
  });
  assert.equal(pauseRec.action, "PAUSE");
  assert.equal(pauseRec.shouldRevisePlan, true);
  assert.equal(pauseRec.mutatesExternalSystems, false);

  const weekly = buildWeeklyPerformanceReview({
    id: "week-1",
    tenantId: "tenant-1",
    planId: "plan-1",
    weekStartIso: "2026-08-01",
    weekEndIso: "2026-08-07",
    receipts: [receipt],
    observations: [linked, failObs],
    anomalies: failAnomalies,
    blockers: ["publishing path unhealthy"],
    recommendation: pauseRec,
    audience: "customer",
    nowIso: "2026-08-11T00:00:00.000Z",
    whatWorked: ["Social reach measured via receipt"],
    whatUnderperformed: ["Publishing failures"],
  });
  assert.ok(weekly.whatExecuted.some((w) => w.includes("social:publish_post")));
  assert.equal(weekly.shouldChangePlan, true);
  assert.ok(weekly.anomalies.length > 0);

  const usage = toUsageAccounting([
    { metric: "social_posts", included: 12, used: 4 },
    { metric: "whatsapp_contacts", included: 100, used: 100, isPaused: true },
  ]);
  assert.equal(usage[0]!.remaining, 8);
  assert.equal(usage[0]!.blocked, false);
  assert.equal(usage[1]!.blocked, true);
  assert.equal(usage[0]!.source, "billing_usage_entitlements");

  const monthly = buildMonthlyGrowthReview({
    id: "month-1",
    tenantId: "tenant-1",
    planId: "plan-1",
    monthStartIso: "2026-08-01",
    monthEndIso: "2026-08-31",
    originalDiagnosis: "Slow response time limiting conversion",
    originalPriorities: ["Fix CRM response", "Measure website traffic"],
    receipts: [receipt],
    observations: [linked, withBaseline],
    usage,
    nextMonthRecommendation: continueRec,
    audience: "admin",
    nowIso: "2026-08-11T00:00:00.000Z",
    strongestGains: ["Social reach anchored to receipt"],
    failures: [],
  });
  assert.ok(monthly.unusedEntitlements.some((u) => u.metric === "social_posts"));
  assert.equal(monthly.originalDiagnosis.includes("response"), true);

  const customer = buildCustomerPerformanceReport({
    tenantId: "tenant-1",
    planId: "plan-1",
    period: period(),
    businessOutcomes: ["Measured social reach of 1200"],
    workCompleted: ["Published 1 social post"],
    nextPriorities: ["Stabilize publishing"],
    observations: [linked],
  });
  assert.equal(customer.audience, "customer");
  assert.ok(!("departmentBreakdown" in customer));

  const admin = buildAdminPerformanceReport({
    tenantId: "tenant-1",
    planId: "plan-1",
    period: period(),
    businessOutcomes: ["Measured social reach of 1200"],
    workCompleted: ["Published 1 social post"],
    nextPriorities: ["Stabilize publishing"],
    executionDetails: ["social publish receipt rcpt-1"],
    costDetails: [
      createCostObservation({
        id: "cost-1",
        tenantId: "tenant-1",
        amount: null,
        period: period(),
        evidenceIds: [],
        retrievedAt: "2026-08-11T00:00:00.000Z",
      }),
    ],
    errorsAndAnomalies: failAnomalies,
    departmentBreakdown: {
      social: ["1 publish receipt"],
      analytics: ["1 reach observation"],
    },
    usage,
    observations: [linked, failObs],
  });
  assert.equal(admin.audience, "admin");
  assert.equal(admin.costDetails[0]!.unknown, true);
  assert.throws(() => refuseEstimatedCost(42), /cost_estimation_forbidden/);

  assert.throws(
    () =>
      buildWeeklyPerformanceReview({
        id: "bad",
        tenantId: "tenant-1",
        weekStartIso: "2026-08-01",
        weekEndIso: "2026-08-07",
        receipts: [{ ...receipt, tenantId: "other" }],
        observations: [],
        anomalies: [],
        recommendation: null,
        audience: "customer",
        nowIso: "2026-08-11T00:00:00.000Z",
      }),
    /cross_tenant_receipt_rejected/,
  );
  assert.throws(
    () =>
      proposeOptimization({
        id: "opt-x",
        tenantId: "tenant-1",
        planId: "plan-1",
        target: "x",
        observations: [{ ...linked, tenantId: "other" }],
        attributions: [],
        anomalies: [],
        evidenceIds: ["ev-rcpt-1"],
        nowIso: "2026-08-11T00:00:00.000Z",
      }),
    /cross_tenant_observation_rejected/,
  );

  const plan = planBusinessGrowth(basePlanInput());
  const frozenVersion = plan.version;
  const frozenObjective = plan.primaryObjective;
  const frozenPlanId = plan.workforcePlan.id;

  assert.throws(
    () =>
      applyLearningRevision({
        currentPlan: plan,
        recommendation: {
          ...pauseRec,
          planId: plan.id,
          evidenceIds: [],
          shouldRevisePlan: true,
        },
        patch: { primaryObjective: "Stabilize publishing before scale" },
        nowIso: "2026-08-11T12:00:00.000Z",
      }),
    /revision_requires_evidence/,
  );

  assert.throws(
    () =>
      applyLearningRevision({
        currentPlan: plan,
        recommendation: { ...continueRec, planId: plan.id },
        patch: { primaryObjective: "Should not apply" },
        nowIso: "2026-08-11T12:00:00.000Z",
      }),
    /recommendation_does_not_request_revision/,
  );

  const reviseRec = proposeOptimization({
    id: "opt-revise",
    tenantId: "tenant-1",
    planId: plan.id,
    missionId: plan.missionId,
    target: "publishing",
    observations: [failObs],
    attributions: [],
    anomalies: failAnomalies,
    evidenceIds: ["ev-fail"],
    nowIso: "2026-08-11T12:00:00.000Z",
  });
  assert.equal(reviseRec.action, "PAUSE");

  const learning = applyLearningRevision({
    currentPlan: plan,
    recommendation: reviseRec,
    patch: { primaryObjective: "Stabilize publishing before scale" },
    nowIso: "2026-08-11T12:00:00.000Z",
  });

  assert.equal(plan.version, frozenVersion);
  assert.equal(plan.primaryObjective, frozenObjective);
  assert.equal(plan.workforcePlan.id, frozenPlanId);

  assert.equal(learning.revisedPlan.version, frozenVersion + 1);
  assert.equal(learning.revisedPlan.primaryObjective, "Stabilize publishing before scale");
  assert.equal(learning.revisedPlan.workforcePlan.previousPlanId, frozenPlanId);
  assert.ok((learning.revisedPlan.workforcePlan.revisionEvidenceIds ?? []).includes("ev-fail"));
  assert.equal(learning.revisionRecord.fromVersion, frozenVersion);
  assert.equal(learning.revisionRecord.toVersion, frozenVersion + 1);
  assert.equal(learning.revisionRecord.preservedCommercialContext, true);
  assert.deepEqual(learning.externalMutations, []);
  assert.equal(learning.learningEvent.kind, "optimization_recommendation");
  assert.equal(learning.learningEvent.department, "optimization");

  const signal = observationToMeasuredSignal(linked);
  assert.equal(signal.kind, "measured_performance");
  assert.equal(signal.evidenceId, "ev-rcpt-1");

  assert.throws(
    () => rejectOpinionAsEvidence({ isMeasured: false, claimedEvidenceId: "opinion-1", source: "model" }),
    /model_opinion_is_not_performance_evidence/,
  );

  assert.throws(
    () =>
      applyLearningRevision({
        currentPlan: plan,
        recommendation: { ...reviseRec, tenantId: "other-tenant" },
        patch: {},
        nowIso: "2026-08-11T12:00:00.000Z",
      }),
    /cross_tenant_learning_rejected/,
  );

  console.log("performance-intelligence.test.ts ALL PASS");
}

run();
