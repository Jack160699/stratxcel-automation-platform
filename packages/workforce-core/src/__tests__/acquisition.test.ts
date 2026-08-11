// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/acquisition.test.ts
import assert from "node:assert/strict";
import { createMissionBudget } from "../budgets/hierarchy.ts";
import { snapshotFromContract } from "../planning/allocation.ts";
import { planBusinessGrowth } from "../planning/thirty-day-planner.ts";
import type { BusinessGrowthPlannerInput } from "../planning/types.ts";
import {
  assessPaidAdsForAudit,
  assertBudgetWithinEnvelope,
  buildAudienceHypotheses,
  createAdCreativeBrief,
  createCampaignPlan,
  createExperimentPlan,
  createLandingPageHandoff,
  evaluateAdsPublishGates,
  evaluatePaidAcquisitionReadiness,
  proposeCampaignBudget,
  refuseAdSpendMutation,
  selectGrowthLevers,
  signalsFromBusinessContext,
} from "../acquisition/index.ts";

function base(overrides: Partial<BusinessGrowthPlannerInput> = {}): BusinessGrowthPlannerInput {
  return {
    tenantId: "tenant-acq-1",
    missionId: "mission-acq-1",
    timezone: "Asia/Kolkata",
    currentDateIso: "2026-08-11T00:00:00.000Z",
    brandBrain: { business_name: "Acq Co", industry: "services" },
    productsServices: ["Consulting"],
    targetAudience: "local buyers",
    geography: "Raipur",
    positioning: "Trusted local expert",
    connectedChannels: [],
    businessGoals: ["Improve growth systems"],
    previousPerformance: [],
    existingResearchEvidence: ["ev-acq-1"],
    activeCampaigns: [],
    availableCapabilities: [],
    entitlementSnapshot: snapshotFromContract({
      allocationPolicy: "UNKNOWN",
      packageComposition: [],
      relevantEntitlements: {},
    }),
    budgetEnvelope: createMissionBudget(50000),
    ...overrides,
  };
}

function run() {
  // weak landing → ads not ready
  const weakLanding = evaluatePaidAcquisitionReadiness({
    tenantId: "tenant-acq-1",
    signals: {
      offerClarity: "strong",
      landingPageStrength: "weak",
      conversionPathStrength: "strong",
      trackingStrength: "adequate",
      evidenceIds: ["ev-1"],
    },
  });
  assert.equal(weakLanding.status, "NOT_READY");
  assert.equal(weakLanding.authorizesSpend, false);
  assert.equal(weakLanding.mayRecommendPaid, false);

  // strong funnel + low discovery → paid may be recommended (planning)
  const strongFunnel = evaluatePaidAcquisitionReadiness({
    tenantId: "tenant-acq-1",
    signals: {
      offerClarity: "strong",
      landingPageStrength: "strong",
      conversionPathStrength: "strong",
      trackingStrength: "adequate",
      audienceDefinitionStrength: "adequate",
      creativeAvailability: "adequate",
      historicalAdsDataPresent: true,
      adAccountConnected: true,
      adPlatforms: ["meta"],
      spendAuthorityPresent: true,
      metaAdCampaignEntitlement: 1,
      evidenceIds: ["ev-2"],
    },
  });
  assert.equal(strongFunnel.status, "READY");
  assert.equal(strongFunnel.mayRecommendPaid, true);
  assert.equal(strongFunnel.authorizesSpend, false);

  const leversPaid = selectGrowthLevers({
    bottlenecks: [
      {
        id: "bn1",
        code: "LOW_DISCOVERY",
        domain: "paid_acquisition",
        description: "Low discovery",
        evidenceIds: ["ev-2"],
        severity: "medium",
        estimatedImpactClass: "high",
        confidence: "medium",
        upstreamDependencies: [],
        downstreamEffects: [],
        priorityScore: 70,
        status: "open",
      },
    ],
    businessSignals: {
      postContactConversionStrength: "high",
      websiteTrafficStrength: "low",
      leadCaptureStrength: "strong",
      signalEvidenceIds: ["ev-2"],
    },
    readiness: strongFunnel,
  });
  assert.equal(leversPaid.recommendPaid, true);
  assert.equal(leversPaid.paidMandatory, false);
  assert.ok(["paid", "search"].includes(leversPaid.primary));

  // strong organic → no mandatory ad recommendation
  const organic = selectGrowthLevers({
    bottlenecks: [],
    businessSignals: {
      websiteTrafficStrength: "high",
      socialPresenceStrength: "high",
      monthlyInquiries: 200,
      postContactConversionStrength: "high",
      crmFollowUpStrength: "strong",
      signalEvidenceIds: ["ev-3"],
    },
    readiness: strongFunnel,
  });
  assert.equal(organic.paidMandatory, false);
  assert.equal(organic.recommendPaid, false);
  assert.ok(organic.primary === "retention" || organic.primary === "organic");

  // no connected ad account → setup required
  const noAccount = evaluatePaidAcquisitionReadiness({
    tenantId: "tenant-acq-1",
    signals: {
      offerClarity: "strong",
      landingPageStrength: "strong",
      conversionPathStrength: "strong",
      adAccountConnected: false,
      spendAuthorityPresent: true,
      metaAdCampaignEntitlement: 1,
      evidenceIds: ["ev-4"],
    },
  });
  assert.equal(noAccount.status, "SETUP_REQUIRED");

  // no entitlement → cannot execute (fail entitlement dimension)
  const noEnt = evaluatePaidAcquisitionReadiness({
    tenantId: "tenant-acq-1",
    signals: {
      offerClarity: "strong",
      landingPageStrength: "strong",
      conversionPathStrength: "strong",
      adAccountConnected: true,
      spendAuthorityPresent: true,
      metaAdCampaignEntitlement: 0,
      evidenceIds: ["ev-5"],
    },
  });
  assert.ok(noEnt.dimensions.some((d) => d.key === "entitlement" && d.status === "fail"));

  // campaign plan does not authorize spend
  const plan = createCampaignPlan({
    tenantId: "tenant-acq-1",
    missionId: "mission-acq-1",
    readiness: strongFunnel,
    signals: {
      offerClarity: "strong",
      landingPageStrength: "strong",
      conversionPathStrength: "strong",
      adAccountConnected: true,
      adPlatforms: ["meta"],
      metaAdCampaignEntitlement: 1,
      evidenceIds: ["ev-2"],
    },
    missionBudget: createMissionBudget(100000),
    objective: "Generate qualified leads",
    businessOutcome: "Improve qualified discovery likelihood",
    offer: "Free consultation",
    requestedMaxCents: 200000,
    policyMaxCents: 40000,
  });
  assert.equal(plan.authorizesSpend, false);
  assert.equal(plan.authorizesPublish, false);
  assert.equal(plan.approvals.approvedForSpend, false);
  assert.equal(plan.budgetProposal.authorizesSpend, false);
  assert.equal(plan.budgetProposal.predictedCpcCents, null);
  assert.equal(plan.budgetProposal.predictedCpaCents, null);
  assert.ok((plan.budgetProposal.proposedMaxCents ?? 0) <= 40000);
  assert.equal(plan.budgetProposal.withinCommercialEnvelope, true);
  assertBudgetWithinEnvelope(plan.budgetProposal, plan.budgetProposal.envelopeCapCents ?? 0);

  // budget cannot exceed envelope
  const over = proposeCampaignBudget({
    missionBudget: createMissionBudget(10000),
    requestedMaxCents: 999999,
    policyMaxCents: 8000,
  });
  assert.ok((over.proposedMaxCents ?? 0) <= 8000);

  // creative handoff
  const brief = createAdCreativeBrief({
    tenantId: "tenant-acq-1",
    missionId: "mission-acq-1",
    campaignPlan: plan,
    hook: "Book your consultation this week",
  });
  assert.equal(brief.handoffDepartment, "creative");
  assert.ok(brief.claimConstraints.length > 0);

  // landing page dependency
  const withLanding = createCampaignPlan({
    ...{
      tenantId: "tenant-acq-1",
      missionId: "mission-acq-1",
      readiness: strongFunnel,
      signals: {
        offerClarity: "strong",
        landingPageStrength: "strong",
        conversionPathStrength: "strong",
        adPlatforms: ["google"],
        evidenceIds: ["ev-2"],
      },
      missionBudget: createMissionBudget(50000),
      objective: "Search intent leads",
      businessOutcome: "Capture intent",
      offer: "Audit",
      landingDestination: null,
    },
  });
  const landing = createLandingPageHandoff({
    tenantId: "tenant-acq-1",
    missionId: "mission-acq-1",
    campaignPlan: withLanding,
  });
  assert.ok(landing);
  assert.equal(landing!.handoffDepartment, "website");
  assert.equal(
    createLandingPageHandoff({
      tenantId: "tenant-acq-1",
      missionId: "mission-acq-1",
      campaignPlan: plan,
    }),
    null,
  );

  // experiment plan
  const exp = createExperimentPlan({
    tenantId: "tenant-acq-1",
    missionId: "mission-acq-1",
    hypothesis: "Offer A increases qualified leads vs control",
    variable: "offer_framing",
    control: "current_offer",
    variants: ["urgency_offer"],
    metric: "qualified_leads",
    minimumEvidenceCriterion: "At least 100 conversions per variant before evaluation",
    evaluationWindowDays: 14,
    stopCondition: "Stop if spend authorization revoked or kill switch engaged",
  });
  assert.equal(exp.claimsStatisticalSignificance, false);

  // tenant isolation + always deny publish
  const gate = evaluateAdsPublishGates({
    tenantId: "tenant-other",
    expectedTenantId: "tenant-acq-1",
    campaignPlan: plan,
    readiness: strongFunnel,
    adAccountConnected: true,
    entitlementRemaining: 1,
    planApproved: true,
    spendAuthorized: true,
    creativeApproved: true,
    providerReady: true,
    budgetRemainingCents: 1000,
  });
  assert.equal(gate.allowed, false);
  assert.equal(gate.decision, "DENIED");
  assert.equal(gate.productionMutations, "NONE");
  assert.ok(gate.failedGates.includes("tenant"));

  assert.throws(() => refuseAdSpendMutation(), /ad_spend_mutation_forbidden/);

  // audiences — sensitive blocked
  const audiences = buildAudienceHypotheses({
    signals: { adAccountConnected: true, adPlatforms: ["meta"], evidenceIds: ["ev-a"] },
    targetAudience: "people with medical disease concerns",
    hasFirstPartyList: true,
  });
  assert.ok(audiences.some((a) => a.kind === "interest_contextual" && a.sensitiveTargetingRisk));

  // audit: weak foundation → NO
  const auditNo = assessPaidAdsForAudit({
    tenantId: "tenant-acq-1",
    signals: {
      offerClarity: "weak",
      landingPageStrength: "none",
      conversionPathStrength: "weak",
      evidenceIds: ["ev-audit"],
    },
  });
  assert.equal(auditNo.verdict, "NO");
  assert.equal(auditNo.shouldRunPaidAds, false);
  assert.equal(auditNo.upsellDefault, false);

  // planner wiring: paid acquisition focus
  const planned = planBusinessGrowth(
    base({
      workflowFocus: "paid_acquisition_readiness",
      businessSignals: {
        hasWebsite: true,
        websiteTrafficStrength: "low",
        postContactConversionStrength: "high",
        leadCaptureStrength: "strong",
        crmFollowUpStrength: "strong",
        medianResponseTimeHours: 1,
        signalEvidenceIds: ["ev-acq-1"],
      },
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "UNKNOWN",
        packageComposition: [],
        relevantEntitlements: { meta_ad_campaigns: 1 },
      }),
    }),
  );
  assert.ok(planned.workforcePlan.departmentStages.some((s) => s.department === "advertising"));
  assert.ok(planned.workforcePlan.departmentStages.some((s) => s.department === "growth"));
  assert.ok(planned.plannedWorkItems.some((w) => w.deliverableKind === "ads_plan"));
  assert.ok(!planned.workforcePlan.departmentStages.some((s) => s.allowedCapabilityClasses.includes("ads.publish")));

  // no entitlement → SETUP_REQUIRED work item
  const noEntPlan = planBusinessGrowth(
    base({
      workflowFocus: "paid_acquisition_readiness",
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "UNKNOWN",
        packageComposition: [],
        relevantEntitlements: {},
      }),
    }),
  );
  assert.ok(noEntPlan.plannedWorkItems.some((w) => w.deliverableKind === "ads_plan" && w.status === "SETUP_REQUIRED"));

  // signals helper
  const mapped = signalsFromBusinessContext({
    businessSignals: {
      hasWebsite: true,
      leadCaptureStrength: "strong",
      postContactConversionStrength: "high",
      signalEvidenceIds: ["ev-m"],
    },
    metaAdCampaignEntitlement: 1,
  });
  assert.equal(mapped.landingPageStrength, "strong");
  assert.equal(mapped.conversionPathStrength, "strong");

  // NOT_READY blocks campaign plan
  assert.throws(
    () =>
      createCampaignPlan({
        tenantId: "tenant-acq-1",
        missionId: "m",
        readiness: weakLanding,
        signals: { evidenceIds: [] },
        missionBudget: createMissionBudget(1000),
        objective: "x",
        businessOutcome: "y",
        offer: "z",
      }),
    /campaign_plan_blocked_not_ready/,
  );

  console.log("acquisition tests: PASS");
}

run();
