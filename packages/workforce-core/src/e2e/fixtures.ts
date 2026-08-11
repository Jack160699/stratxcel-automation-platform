import { createMissionBudget } from "../budgets/hierarchy.ts";
import { snapshotFromContract } from "../planning/allocation.ts";
import type { BusinessGrowthPlannerInput, BusinessGrowthEntitlementSnapshot } from "../planning/types.ts";
import type { CompanyOpsContext, TenantIsolationSlice } from "../company-ops/types.ts";

export function fixtureEntitlementAudit(): BusinessGrowthEntitlementSnapshot {
  return snapshotFromContract({
    allocationPolicy: "UNKNOWN",
    packageComposition: [],
    relevantEntitlements: {},
    purchasedServiceKeys: ["brand_audit"],
    planTier: "audit",
    subscriptionId: "sub_audit_1",
  });
}

export function fixtureEntitlementSocialPackage(): BusinessGrowthEntitlementSnapshot {
  return snapshotFromContract({
    allocationPolicy: "FIXED_COMPOSITION",
    packageComposition: [
      { mediaType: "image", quantity: 8 },
      { mediaType: "reel", quantity: 4 },
    ],
    relevantEntitlements: { social_posts: 12 },
    currentUsage: { social_posts: 0 },
    planTier: "starter",
    subscriptionId: "sub_social_1",
  });
}

export function fixtureEntitlementExhausted(): BusinessGrowthEntitlementSnapshot {
  return snapshotFromContract({
    allocationPolicy: "FIXED_COMPOSITION",
    packageComposition: [{ mediaType: "image", quantity: 8 }],
    relevantEntitlements: { social_posts: 12 },
    currentUsage: { social_posts: 12 },
    planTier: "starter",
    subscriptionId: "sub_exhausted_1",
  });
}

export function fixtureEntitlementCrmWhatsapp(): BusinessGrowthEntitlementSnapshot {
  return snapshotFromContract({
    allocationPolicy: "UNKNOWN",
    packageComposition: [],
    relevantEntitlements: { whatsapp_contacts: 500 },
    currentUsage: { whatsapp_contacts: 10 },
    planTier: "growth",
    subscriptionId: "sub_crm_1",
  });
}

export function fixtureEntitlementSeo(): BusinessGrowthEntitlementSnapshot {
  return snapshotFromContract({
    allocationPolicy: "UNKNOWN",
    packageComposition: [],
    relevantEntitlements: {},
    purchasedServiceKeys: ["seo_content"],
    planTier: "custom",
    subscriptionId: "sub_seo_1",
  });
}

export function fixtureEntitlementWebsite(): BusinessGrowthEntitlementSnapshot {
  return snapshotFromContract({
    allocationPolicy: "UNKNOWN",
    packageComposition: [],
    relevantEntitlements: { website_maintenance: 1 },
    purchasedServiceKeys: ["website"],
    planTier: "growth",
    subscriptionId: "sub_web_1",
  });
}

export function basePlannerInput(
  overrides: Partial<BusinessGrowthPlannerInput> = {},
): BusinessGrowthPlannerInput {
  return {
    tenantId: "tenant-e2e-1",
    missionId: "mission-e2e-1",
    timezone: "Asia/Kolkata",
    currentDateIso: "2026-08-11T00:00:00.000Z",
    brandBrain: { business_name: "E2E Test Co", industry: "services" },
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
    entitlementSnapshot: fixtureEntitlementAudit(),
    budgetEnvelope: createMissionBudget(50000),
    ...overrides,
  };
}

export function fixtureCompanyOpsContext(
  overrides: Partial<CompanyOpsContext> = {},
): CompanyOpsContext {
  return {
    tenantId: "tenant-e2e-1",
    entitlementSnapshot: fixtureEntitlementSocialPackage(),
    purchasedServices: ["social_package"],
    brandBrainComplete: true,
    brandBrainBusinessName: "E2E Test Co",
    integrations: {
      social: true,
      website: false,
      analytics: false,
      crm: false,
      whatsapp: false,
      ads: false,
    },
    permissionsGranted: true,
    paymentState: "current",
    lifecyclePhase: "active",
    approvalsWaiting: 0,
    unresolvedHandoffs: 0,
    openCustomerQuestions: 0,
    missions: [],
    ...overrides,
  };
}

export function fixtureTenantSlice(tenantId: string, suffix: string): TenantIsolationSlice {
  return {
    tenantId,
    brandBrainBusinessName: `Business ${suffix}`,
    artifactIds: [`art_${suffix}_1`, `art_${suffix}_2`],
    integrationKeys: [`ig_${suffix}`, `wa_${suffix}`],
    leadIds: [`lead_${suffix}_1`],
    approvalIds: [`appr_${suffix}_1`],
    usageByMetric: { social_posts: suffix === "A" ? 3 : 7 },
    reportIds: [`rep_${suffix}_1`],
    receiptIds: [`rcpt_${suffix}_1`],
  };
}
