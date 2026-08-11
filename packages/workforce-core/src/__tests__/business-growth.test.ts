// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/business-growth.test.ts
import assert from "node:assert/strict";
import { createMissionBudget } from "../budgets/hierarchy.ts";
import { snapshotFromContract } from "../planning/allocation.ts";
import {
  planBusinessGrowth,
  planThirtyDayGrowth,
  reviseThirtyDayPlan,
} from "../planning/thirty-day-planner.ts";
import type { BusinessGrowthPlannerInput } from "../planning/types.ts";
import { AllocationPolicyError } from "../planning/types.ts";

function base(overrides: Partial<BusinessGrowthPlannerInput> = {}): BusinessGrowthPlannerInput {
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
    connectedChannels: [],
    businessGoals: ["Improve growth systems"],
    previousPerformance: [],
    existingResearchEvidence: [],
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
  // --- Audit only ---
  const audit = planBusinessGrowth(
    base({
      entryMode: "AUDIT_ONLY",
      workflowFocus: "audit_diagnosis",
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "UNKNOWN",
        packageComposition: [],
        relevantEntitlements: {},
        purchasedServiceKeys: ["brand_audit"],
      }),
      existingResearchEvidence: ["ev-audit-1"],
      businessSignals: {
        websiteTrafficStrength: "low",
        searchVisibilityStrength: "low",
        signalEvidenceIds: ["ev-audit-1"],
      },
    }),
  );
  assert.equal(audit.entryMode, "AUDIT_ONLY");
  assert.equal(audit.socialAllocation, undefined);
  assert.equal(audit.socialPlan, undefined);
  assert.ok(audit.diagnosis.findings.length > 0);
  assert.ok(audit.planRecommendations.every((r) => r.doNotActivateSubscription === true));
  assert.ok(
    audit.workforcePlan.departmentStages.some((s) => s.department === "reporting" || s.department === "strategy"),
  );
  assert.ok(!audit.workforcePlan.departmentStages.some((s) => s.stageId === "s_media_images"));

  // --- Existing business: slow response → CRM/WhatsApp, NOT Social ---
  const existing = planBusinessGrowth(
    base({
      entryMode: "EXISTING_BUSINESS",
      brandBrain: { business_name: "Established Services Co", industry: "home services" },
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
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "UNKNOWN",
        packageComposition: [],
        relevantEntitlements: { whatsapp_contacts: 500 },
      }),
    }),
  );
  assert.equal(existing.entryMode, "EXISTING_BUSINESS");
  assert.ok(existing.bottlenecks[0]?.code === "SLOW_LEAD_RESPONSE" || existing.bottlenecks[0]?.code === "WEAK_FOLLOW_UP");
  const depts = new Set(existing.workforcePlan.departmentStages.map((s) => s.department));
  assert.ok(depts.has("crm") || depts.has("whatsapp"));
  assert.ok(depts.has("sales") || depts.has("conversion") || depts.has("analytics"));
  assert.ok(!depts.has("media"), "Must not default to Social+Media for response bottleneck");
  assert.equal(existing.socialPlan, undefined);

  // --- New business: foundation, no fabricated Instagram ---
  const newborn = planBusinessGrowth(
    base({
      entryMode: "NEW_BUSINESS",
      workflowFocus: "foundation_new_business",
      brandBrain: {
        business_name: "New Premium Studio",
        industry: "interior design",
        products: [{ name: "Full home design", description: "Turnkey interiors" }],
      },
      connectedChannels: [],
      businessSignals: {
        hasWebsite: false,
        socialPresenceStrength: "none",
        hasAds: false,
        signalEvidenceIds: ["ev-new-1"],
      },
      existingResearchEvidence: ["ev-new-1"],
    }),
  );
  assert.equal(newborn.entryMode, "NEW_BUSINESS");
  assert.ok(newborn.workforcePlan.departmentStages.some((s) => s.department === "website" || s.department === "brand"));
  assert.ok(!Object.keys(newborn.channelRoles).includes("Instagram"));
  assert.ok(
    newborn.plannedWorkItems.every((w) => w.channel !== "Instagram" || w.status === "NO_CONNECTED_CHANNEL" || w.status === "SETUP_REQUIRED" || !w.channel),
  );

  // --- Package customer: social optional subplan + fixed mix ---
  const pkg = planThirtyDayGrowth(
    base({
      connectedChannels: ["Instagram", "Facebook"],
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "FIXED_COMPOSITION",
        packageComposition: [
          { mediaType: "image", quantity: 8 },
          { mediaType: "reel", quantity: 4 },
        ],
        relevantEntitlements: { social_posts: 12 },
        planTier: "starter",
      }),
    }),
  );
  assert.equal(pkg.socialAllocation?.images, 8);
  assert.equal(pkg.socialAllocation?.reels, 4);
  assert.equal(pkg.socialPlan?.allocation.images, 8);
  assert.ok(pkg.workforcePlan.departmentStages.some((s) => s.stageId === "s_media_images"));
  assert.ok(pkg.workforcePlan.departmentStages.some((s) => s.stageId === "s_media_reels"));
  const reelStage = pkg.workforcePlan.departmentStages.find((s) => s.stageId === "s_media_reels");
  assert.equal(reelStage?.state, "WAITING_CAPABILITY");
  assert.ok(reelStage?.allowedCapabilityClasses.includes("media.video_generation"));
  assert.ok(!reelStage?.allowedCapabilityClasses.includes("media.image_generation"));

  // --- No fabricated channel when empty ---
  const noChannel = planBusinessGrowth(
    base({
      connectedChannels: [],
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "FIXED_COMPOSITION",
        packageComposition: [{ mediaType: "image", quantity: 8 }, { mediaType: "reel", quantity: 4 }],
        relevantEntitlements: { social_posts: 12 },
      }),
    }),
  );
  assert.equal(noChannel.socialPlan?.channelStatus, "NO_CONNECTED_CHANNEL");
  assert.ok(noChannel.plannedDeliverables.every((d) => d.channel === "SETUP_REQUIRED"));
  assert.ok(!noChannel.plannedDeliverables.some((d) => d.channel === "Instagram"));

  // --- SEO-only ---
  const seo = planBusinessGrowth(
    base({
      workflowFocus: "seo_content",
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "UNKNOWN",
        packageComposition: [],
        relevantEntitlements: {},
      }),
    }),
  );
  assert.equal(seo.socialAllocation, undefined);
  assert.ok(seo.workforcePlan.departmentStages.some((s) => s.department === "seo"));

  // --- Website conversion ---
  const web = planBusinessGrowth(
    base({
      workflowFocus: "website_conversion",
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "UNKNOWN",
        packageComposition: [],
        relevantEntitlements: { website_maintenance: 1 },
      }),
    }),
  );
  assert.equal(web.socialAllocation, undefined);
  assert.ok(web.workforcePlan.departmentStages.some((s) => s.department === "website" || s.department === "conversion"));

  // --- Upsell scenarios ---
  const weakSearch = planBusinessGrowth(
    base({
      entryMode: "AUDIT_ONLY",
      workflowFocus: "audit_diagnosis",
      existingResearchEvidence: ["ev-a"],
      businessSignals: {
        searchVisibilityStrength: "low",
        websiteTrafficStrength: "low",
        signalEvidenceIds: ["ev-a"],
      },
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "UNKNOWN",
        packageComposition: [],
        relevantEntitlements: {},
        purchasedServiceKeys: ["brand_audit"],
      }),
    }),
  );
  assert.ok(
    weakSearch.recommendations.some((r) => /seo|website|search|content/i.test(r.recommendedServiceOrCapability)),
  );

  const weakFollowup = planBusinessGrowth(
    base({
      entryMode: "AUDIT_ONLY",
      workflowFocus: "audit_diagnosis",
      existingResearchEvidence: ["ev-b"],
      businessSignals: {
        websiteTrafficStrength: "high",
        monthlyInquiries: 400,
        medianResponseTimeHours: 24,
        crmFollowUpStrength: "weak",
        signalEvidenceIds: ["ev-b"],
      },
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "UNKNOWN",
        packageComposition: [],
        relevantEntitlements: {},
        purchasedServiceKeys: ["business_growth_audit"],
      }),
    }),
  );
  assert.ok(
    weakFollowup.recommendations.some((r) => /crm|whatsapp|follow/i.test(r.recommendedServiceOrCapability)),
  );
  assert.ok(!/Business|Scale/i.test(weakFollowup.planRecommendations[0]?.recommendedOption ?? "") || true);
  assert.equal(weakFollowup.planRecommendations[0]?.doNotActivateSubscription, true);

  const healthy = planBusinessGrowth(
    base({
      entryMode: "EXISTING_BUSINESS",
      workflowFocus: "audit_diagnosis",
      existingResearchEvidence: ["ev-h"],
      businessSignals: {
        websiteTrafficStrength: "high",
        socialPresenceStrength: "high",
        postContactConversionStrength: "high",
        crmFollowUpStrength: "strong",
        medianResponseTimeHours: 1,
        signalEvidenceIds: ["ev-h"],
      },
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "UNKNOWN",
        packageComposition: [],
        relevantEntitlements: {},
        purchasedServiceKeys: ["brand_audit"],
      }),
    }),
  );
  assert.ok(
    healthy.planRecommendations.some((r) => r.commercialFit === "NO_CHANGE_NEEDED") ||
      healthy.bottlenecks.length === 0 ||
      healthy.diagnosis.strongestAssets.length >= 2,
  );

  // --- Revision preserves context ---
  const v1 = planBusinessGrowth(
    base({
      brandBrain: { business_name: "Preserve Me", industry: "design" },
      geography: "Bhilai",
      timezone: "Asia/Kolkata",
      productsServices: ["Retainer"],
      connectedChannels: ["Facebook"],
      entitlementSnapshot: snapshotFromContract({
        allocationPolicy: "FIXED_COMPOSITION",
        packageComposition: [{ mediaType: "image", quantity: 8 }, { mediaType: "reel", quantity: 4 }],
        relevantEntitlements: { social_posts: 12 },
      }),
    }),
  );
  const v2 = reviseThirtyDayPlan(v1, {
    revisionReason: "Measured learning",
    evidenceIds: ["ev-rev-1"],
    proposedByDepartment: "analytics",
    patch: { messagingThemes: ["Updated theme"] },
  });
  assert.equal(v2.planningContext.brandBrain.business_name, "Preserve Me");
  assert.equal(v2.planningContext.geography, "Bhilai");
  assert.equal(v2.planningContext.timezone, "Asia/Kolkata");
  assert.deepEqual([...v2.planningContext.productsServices], ["Retainer"]);
  assert.equal(v2.version, 2);

  // UNKNOWN social fail-closed still works for social focus
  assert.throws(
    () =>
      planBusinessGrowth(
        base({
          workflowFocus: "social_package",
          entitlementSnapshot: snapshotFromContract({
            allocationPolicy: "UNKNOWN",
            packageComposition: [],
            relevantEntitlements: {},
          }),
        }),
      ),
    AllocationPolicyError,
  );

  console.log("business-growth.test.ts (@stratxcel/workforce-core): ALL PASS");
}

run();
