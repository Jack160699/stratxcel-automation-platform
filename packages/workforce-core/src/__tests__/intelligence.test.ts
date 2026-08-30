// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/intelligence.test.ts
import assert from "node:assert/strict";
import { createMissionBudget } from "../budgets/hierarchy.ts";
import { snapshotFromContract } from "../planning/allocation.ts";
import { PLAN_DEFINITIONS } from "../../../payments-and-wallet/src/plans.ts";
import { buildCatalogueFromPlanDefinitions } from "../intelligence/catalogue.ts";
import { runIntelligencePipeline } from "../intelligence/pipeline.ts";
import { evaluateCommercialFit, assertRecommendationCannotMutateBilling, BillingMutationError } from "../intelligence/recommendations/commercial-fit.ts";
import { resolveClaimStatus, assertEvidenceTenantScope, EvidenceScopeError } from "../intelligence/evidence/model.ts";
import { assessBrandReadiness, assertNoProhibitedClaims, ProhibitedClaimError } from "../intelligence/brand/readiness.ts";
import { assertBrandBrainTenant, assertTenantScopedEvidence, TenantIsolationError } from "../intelligence/security.ts";
import { buildIntelligenceSpecialistRunPlan, HERMES_INTELLIGENCE_DELEGATION_GUIDANCE } from "../intelligence/hermes/delegation.ts";
import { assertResponseBottlenecksNotRoutedToSocial } from "../intelligence/strategy/builder.ts";
import { narrowCapabilityClasses, CapabilityEscalationError } from "../security/narrowing.ts";
import type { BusinessGrowthPlannerInput } from "../planning/types.ts";
import type { ScopedEvidenceRecord } from "../intelligence/types.ts";

const NOW = "2026-08-11T00:00:00.000Z";
const catalogue = buildCatalogueFromPlanDefinitions(
  Object.values(PLAN_DEFINITIONS) as unknown as import("../intelligence/catalogue.ts").PlanDefinitionInput[],
);

function base(overrides: Partial<BusinessGrowthPlannerInput> = {}): BusinessGrowthPlannerInput {
  return {
    tenantId: "tenant-a",
    missionId: "mission-a",
    timezone: "Asia/Kolkata",
    currentDateIso: NOW,
    brandBrain: { business_name: "Test Co", tone_of_voice: "professional", target_audience: "local buyers", industry: "services" },
    productsServices: ["Consulting"],
    targetAudience: "local buyers",
    geography: "Raipur",
    positioning: "Trusted local expert",
    connectedChannels: [],
    businessGoals: ["Improve growth"],
    previousPerformance: [],
    existingResearchEvidence: [],
    activeCampaigns: [],
    availableCapabilities: [],
    entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: {} }),
    budgetEnvelope: createMissionBudget(0),
    ...overrides,
  };
}

function record(partial: Partial<ScopedEvidenceRecord> & Pick<ScopedEvidenceRecord, "id" | "supportedClaims">, missionId = "mission-a"): ScopedEvidenceRecord {
  return {
    tenantId: "tenant-a",
    missionId,
    sourceType: "customer_provided",
    sourceLabel: "customer",
    retrievedAtIso: NOW,
    summary: "customer fact",
    confidence: "high",
    isFirstParty: true,
    ...partial,
  };
}

function run() {
  assertBrandBrainTenant({ tenantId: "tenant-a", brandBrainTenantId: "tenant-a" });
  assert.throws(() => assertBrandBrainTenant({ tenantId: "tenant-a", brandBrainTenantId: "tenant-b" }), TenantIsolationError);

  // audit-only local business
  const audit = runIntelligencePipeline({
    tenantId: "tenant-a", missionId: "m-audit", currentDateIso: NOW, brandBrainTenantId: "tenant-a",
    plannerInput: base({
      entryMode: "AUDIT_ONLY",
      entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: {}, purchasedServiceKeys: ["brand_audit"] }),
      businessSignals: { websiteTrafficStrength: "low", searchVisibilityStrength: "low", signalEvidenceIds: ["ev1"] },
      existingResearchEvidence: ["ev1"],
    }),
    evidenceRecords: [record({ id: "ev1", supportedClaims: ["local market presence"], sourceType: "customer_provided" }, "m-audit")],
    catalogue,
  });
  assert.equal(audit.diagnosis.entryMode, "AUDIT_ONLY");
  assert.ok(audit.events.some((e) => e.name === "intelligence.audit.completed"));
  assertRecommendationCannotMutateBilling(audit.commercialFit);

  // existing high-lead slow response — CRM not social
  const slow = runIntelligencePipeline({
    tenantId: "tenant-a", missionId: "m-slow", currentDateIso: NOW, brandBrainTenantId: "tenant-a",
    plannerInput: base({
      entryMode: "EXISTING_BUSINESS",
      connectedChannels: ["Instagram"],
      businessSignals: { hasWebsite: true, websiteTrafficStrength: "high", socialPresenceStrength: "high", monthlyInquiries: 500, medianResponseTimeHours: 18, crmFollowUpStrength: "weak", postContactConversionStrength: "high", signalEvidenceIds: ["ev-crm"] },
      existingResearchEvidence: ["ev-crm"],
      entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: { whatsapp_contacts: 500 } }),
    }),
    evidenceRecords: [record({ id: "ev-crm", supportedClaims: ["slow lead response"], sourceType: "crm_snapshot" }, "m-slow")],
    catalogue,
  });
  assert.ok(slow.bottleneckGraph.bottlenecks[0]?.code === "SLOW_LEAD_RESPONSE" || slow.bottleneckGraph.bottlenecks[0]?.code === "WEAK_FOLLOW_UP");
  assert.ok(slow.strategy.workItems.some((w) => w.department === "whatsapp" || w.department === "crm"));
  assert.doesNotMatch(slow.strategy.workItems.map((w) => w.department).join(","), /social/);
  assertResponseBottlenecksNotRoutedToSocial(slow.strategy);

  // new business foundation — no fabricated Instagram
  const neo = runIntelligencePipeline({
    tenantId: "tenant-a", missionId: "m-new", currentDateIso: NOW, brandBrainTenantId: "tenant-a",
    plannerInput: base({ entryMode: "NEW_BUSINESS", businessSignals: { hasWebsite: false, socialPresenceStrength: "none" } }),
    catalogue,
  });
  assert.equal(neo.diagnosis.foundationStatus, "MISSING_FOUNDATION");
  assert.ok(!neo.audit.executiveSummary.toLowerCase().includes("instagram stats"));

  // healthy business NO_CHANGE_NEEDED
  const fitHealthy = evaluateCommercialFit({ bottlenecks: [], catalogue, entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: {} }) });
  assert.equal(fitHealthy.outcome, "NO_CHANGE_NEEDED");

  // smallest covering — prefer the cheaper, targeted plan over the flagship
  // when both cover. STRATXCEL full-system closure brief Section 28
  // (regression sweep): real, pre-existing test drift found while running
  // every dedicated suite -- "starter"/"business" predate the real
  // commercial-model v3 catalog migration (packages/payments-and-wallet/
  // src/plans.ts) and are now `status: "legacy"`, which
  // buildCatalogueFromPlanDefinitions (packages/workforce-core/src/
  // intelligence/catalogue.ts) correctly, deliberately excludes from the
  // real catalogue (`plans.filter((p) => p.status === "active")`) -- so
  // starterCat was silently empty, and evaluateCommercialFit correctly
  // fell back to CUSTOM rather than ever recommending an unpurchasable
  // legacy plan. Fixed to use the real, current, active v3 tiers that
  // exhibit the same real "smaller plan also covers, bigger plan also
  // covers" relationship this test's actual intent requires: social
  // (₹3,999, real social_posts entitlement -> covers this module's real
  // "seo" bottleneck domain per domainsForEntitlements' own mapping) vs
  // advanced_growth (₹18,498, the flagship, also covers it) -- confirmed
  // empirically live: "seo" (the plan named SEO Growth) does NOT itself
  // carry social_posts entitlement (packages/payments-and-wallet/src/
  // entitlements.ts), so it never actually covers this internal domain --
  // a real, pre-existing (not part of this fix) naming distinction between
  // the customer-facing "SEO Growth" plan and this module's internal "seo"
  // bottleneck-domain concept.
  const starterCat = catalogue.filter((c) => c.planKey === "social" || c.planKey === "advanced_growth");
  const upsell = evaluateCommercialFit({
    bottlenecks: [{ id: "bn1", code: "WEAK_SEARCH_VISIBILITY", domain: "search_seo", description: "weak seo", evidenceIds: [], severity: "medium", estimatedImpactClass: "high", confidence: "medium", upstreamDependencies: [], downstreamEffects: [], priorityScore: 75, status: "open" }],
    catalogue: starterCat,
    entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: {} }),
  });
  assert.equal(upsell.outcome, "SMALLEST_COVERING_OPTION");
  assert.equal(upsell.recommendedPlanKey, "social");

  // already entitled website_maintenance
  const entitled = evaluateCommercialFit({
    bottlenecks: [{ id: "bn2", code: "MISSING_DIGITAL_FOUNDATION", domain: "website", description: "needs site", evidenceIds: [], severity: "high", estimatedImpactClass: "high", confidence: "medium", upstreamDependencies: [], downstreamEffects: [], priorityScore: 88, status: "open" }],
    catalogue,
    entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: { website_maintenance: 1 }, planTier: "growth" }),
  });
  assert.equal(entitled.outcome, "ALREADY_ENTITLED");
  assert.match(entitled.reason, /USE_CURRENT_ENTITLEMENT/);

  // evidence governance
  const ctx = { tenantId: "tenant-a", missionId: "mission-a", nowIso: NOW };
  const external = resolveClaimStatus({ statement: "market share 40%", requestedStatus: "KNOWN", supportingRecords: [record({ id: "ext", supportedClaims: ["market share 40%"], sourceType: "research_web", isFirstParty: false, retrievedAtIso: NOW })], ctx });
  assert.equal(external.status, "DERIVED");
  assert.ok(external.rejectionReasons.includes("external_claim_cannot_become_known"));
  const weak = resolveClaimStatus({ statement: "maybe slow", requestedStatus: "KNOWN", supportingRecords: [record({ id: "w", supportedClaims: ["other"], confidence: "low" })], ctx });
  assert.notEqual(weak.qualityVerdict, "SUPPORTED");
  assert.throws(() => assertEvidenceTenantScope(record({ id: "x", supportedClaims: ["a"], tenantId: "tenant-b" }), { tenantId: "tenant-a", missionId: "mission-a" }), EvidenceScopeError);
  assert.throws(() => assertTenantScopedEvidence([record({ id: "bad", supportedClaims: ["a"], tenantId: "tenant-b" })], { tenantId: "tenant-a", missionId: "mission-a" }), TenantIsolationError);

  // brand
  const partial = assessBrandReadiness({ business_name: "X" });
  assert.equal(partial.level, "PARTIAL");
  assert.throws(() => assertNoProhibitedClaims("We guarantee 200% ROI"), ProhibitedClaimError);

  // security — billing + capability narrowing
  const rec = evaluateCommercialFit({ bottlenecks: [], catalogue, entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: {} }) });
  assert.throws(() => assertRecommendationCannotMutateBilling({ ...rec, doNotChargeCard: false as true }), BillingMutationError);
  assert.throws(() => narrowCapabilityClasses(["content.shortform"], ["social.publish"]), CapabilityEscalationError);

  // hermes delegation guidance present
  assert.ok(HERMES_INTELLIGENCE_DELEGATION_GUIDANCE.includes("evidence_reviewer"));
  const plan = buildIntelligenceSpecialistRunPlan({ tenantId: "tenant-a", missionId: "m1", researchPlan: audit.researchPlan, strategy: audit.strategy });
  assert.ok(plan.reviewerSeparationEnforced);
  assert.ok(plan.stages.some((s) => s.specialistRole === "final_reviewer"));

  console.log("PASS");
}

run();
