import type { BusinessGrowthEntitlementSnapshot } from "./types.ts";
import type {
  GrowthBottleneck,
  GrowthRecommendation,
  PlanRecommendation,
} from "./growth-types.ts";
import { getCapability } from "../capabilities/registry.ts";

/**
 * Evidence-based recommendations.
 * Never recommend the highest plan merely for revenue.
 * Prefer the smallest/most appropriate commercial option that covers required work.
 * Never guarantee revenue, leads, ROAS, rankings, or sales.
 */
export function buildGrowthRecommendations(input: {
  bottlenecks: readonly GrowthBottleneck[];
  entitlementSnapshot: BusinessGrowthEntitlementSnapshot;
}): GrowthRecommendation[] {
  const recs: GrowthRecommendation[] = [];
  let i = 0;

  for (const bn of input.bottlenecks) {
    const mapped = mapBottleneckToService(bn);
    const entitlement = mapped.entitlementRequirement;
    const purchased = hasEntitlementCoverage(input.entitlementSnapshot, entitlement);
    const cap = mapped.capabilityKey ? getCapability(mapped.capabilityKey) : undefined;

    recs.push({
      id: `rec_${++i}`,
      bottleneckId: bn.id,
      problemAddressed: bn.description,
      recommendedServiceOrCapability: mapped.serviceOrCapability,
      reason: mapped.reason,
      supportingEvidenceIds: bn.evidenceIds,
      expectedBusinessOutcomeClass: mapped.outcomeClass,
      priority: bn.priorityScore,
      dependency: mapped.dependency,
      entitlementRequirement: entitlement,
      currentAvailability: purchased
        ? cap?.status === "UNAVAILABLE" || cap?.status === "NOT_CONFIGURED"
          ? cap.status
          : "AVAILABLE"
        : "NOT_PURCHASED",
      suggestedPlanOrServiceTier: mapped.suggestedTier,
    });
  }

  return recs.sort((a, b) => b.priority - a.priority);
}

export function buildPlanRecommendations(input: {
  recommendations: readonly GrowthRecommendation[];
  bottlenecks: readonly GrowthBottleneck[];
  entitlementSnapshot: BusinessGrowthEntitlementSnapshot;
  entryMode: string;
}): PlanRecommendation[] {
  if (input.bottlenecks.length === 0) {
    return [
      {
        id: "plan_rec_healthy",
        commercialFit: "NO_CHANGE_NEEDED",
        recommendedOption: "Maintain current operating posture",
        reason: "No high-priority bottlenecks identified from available evidence — do not invent problems to upsell",
        coveringBottleneckIds: [],
        supportingEvidenceIds: [],
        outcomeLanguage: "Supports continued measurement and selective optimization only where evidence appears",
        doNotActivateSubscription: true,
      },
    ];
  }

  const top = input.recommendations.slice(0, 3);
  const domains = new Set(top.map((r) => classifyDomain(r.recommendedServiceOrCapability)));
  const fit = resolveSmallestCommercialFit(domains, input.entitlementSnapshot);

  return [
    {
      id: "plan_rec_primary",
      commercialFit: fit.kind,
      recommendedOption: fit.option,
      reason: fit.reason,
      coveringBottleneckIds: top.map((r) => r.bottleneckId),
      supportingEvidenceIds: top.flatMap((r) => r.supportingEvidenceIds),
      outcomeLanguage:
        "Designed to address the identified bottleneck(s) and intended to increase the likelihood of improved business outcomes — not a guarantee of revenue, leads, ROAS, rankings, or sales",
      doNotActivateSubscription: true,
    },
  ];
}

function mapBottleneckToService(bn: GrowthBottleneck): {
  serviceOrCapability: string;
  capabilityKey?: string;
  reason: string;
  outcomeClass: string;
  entitlementRequirement: string | null;
  suggestedTier: string | null;
  dependency?: string;
} {
  switch (bn.code) {
    case "SLOW_LEAD_RESPONSE":
    case "WEAK_FOLLOW_UP":
      return {
        serviceOrCapability: "crm.followup_plan + whatsapp.followup_plan",
        capabilityKey: "crm.followup_plan",
        reason: "Response/follow-up leakage is the priority given inquiry volume and slow response evidence",
        outcomeClass: "improve lead-response speed and follow-up consistency",
        entitlementRequirement: "whatsapp_contacts",
        suggestedTier: "growth",
      };
    case "WEAK_WEBSITE_CONVERSION":
    case "POOR_LEAD_CAPTURE":
      return {
        serviceOrCapability: "website.audit + conversion.audit",
        capabilityKey: "conversion.audit",
        reason: "Traffic without capture/conversion should be fixed before buying more discovery",
        outcomeClass: "improve inquiry capture from existing traffic",
        entitlementRequirement: "website_maintenance",
        suggestedTier: "growth",
      };
    case "WEAK_SEARCH_VISIBILITY":
      return {
        serviceOrCapability: "seo.audit + content.longform",
        capabilityKey: "seo.audit",
        reason: "Discovery weakness addresses demand creation when conversion systems are healthier",
        outcomeClass: "improve qualified discovery",
        entitlementRequirement: null,
        suggestedTier: "starter",
      };
    case "MISSING_DIGITAL_FOUNDATION":
      return {
        serviceOrCapability: "website.generate + brand.audit",
        capabilityKey: "website.generate",
        reason: "New/missing foundation must precede channel scale",
        outcomeClass: "establish digital foundation",
        entitlementRequirement: "website_maintenance",
        suggestedTier: "growth",
      };
    case "MISSING_ATTRIBUTION":
      return {
        serviceOrCapability: "analytics.attribution",
        capabilityKey: "analytics.attribution",
        reason: "Measurement gaps block trustworthy optimization",
        outcomeClass: "improve attribution clarity for learning loops",
        entitlementRequirement: null,
        suggestedTier: null,
      };
    case "LOW_DISCOVERY":
    case "INSUFFICIENT_DEMAND":
      return {
        serviceOrCapability: "ads.plan + growth.lever_selection",
        capabilityKey: "ads.plan",
        reason:
          "Discovery/demand bottleneck with healthier conversion signals — evaluate paid acquisition readiness before any spend",
        outcomeClass: "improve qualified discovery when conversion foundation supports it",
        entitlementRequirement: "meta_ad_campaigns",
        suggestedTier: "growth",
        dependency: "paid_acquisition_readiness_and_approvals",
      };
    default:
      return {
        serviceOrCapability: "business_growth_audit",
        capabilityKey: "brand.audit",
        reason: "Requires deeper evidence-backed diagnosis before committing package spend",
        outcomeClass: "clarify priority opportunities",
        entitlementRequirement: null,
        suggestedTier: null,
      };
  }
}

function hasEntitlementCoverage(snapshot: BusinessGrowthEntitlementSnapshot, entitlement: string | null): boolean {
  if (!entitlement) return true;
  const purchased = snapshot.purchasedServiceKeys ?? [];
  if (purchased.length > 0 && purchased.some((k) => k.includes("audit"))) {
    // Audit purchase covers diagnosis/recommendation only — not execution entitlements
    return false;
  }
  const limit = snapshot.relevantEntitlements[entitlement];
  return typeof limit === "number" && limit > 0;
}

function classifyDomain(service: string): "crm" | "website" | "seo" | "social" | "ads" | "other" {
  if (/crm|whatsapp|follow.?up|sales/i.test(service)) return "crm";
  if (/website|conversion/i.test(service)) return "website";
  if (/seo|search|content\.long/i.test(service)) return "seo";
  if (/social|media\.|shortform/i.test(service)) return "social";
  if (/ads|paid/i.test(service)) return "ads";
  return "other";
}

function resolveSmallestCommercialFit(
  domains: Set<string>,
  snapshot: BusinessGrowthEntitlementSnapshot,
): { kind: PlanRecommendation["commercialFit"]; option: string; reason: string } {
  const tier = (snapshot.planTier ?? "").toLowerCase();
  const social = snapshot.relevantEntitlements.social_posts ?? 0;

  // Prefer smallest covering option — never auto-pick highest tier
  if (domains.has("crm") && !domains.has("seo") && !domains.has("social")) {
    if ((snapshot.relevantEntitlements.whatsapp_contacts ?? 0) > 0) {
      return {
        kind: "SMALLEST_COVERING_OPTION",
        option: tier || "existing package WhatsApp/CRM capacity",
        reason: "Existing WhatsApp/CRM entitlement can cover the primary bottleneck without upgrading",
      };
    }
    return {
      kind: "CUSTOM_RECOMMENDATION",
      option: "CRM/WhatsApp conversion package or Growth (smallest tier with WhatsApp capacity)",
      reason: "Primary bottleneck is response/follow-up — do not upsell Social volume as the answer",
    };
  }

  if (domains.has("website") && !domains.has("social")) {
    if ((snapshot.relevantEntitlements.website_maintenance ?? 0) > 0) {
      return {
        kind: "SMALLEST_COVERING_OPTION",
        option: "Existing website_maintenance entitlement",
        reason: "Website/conversion work is already covered by purchased website entitlement",
      };
    }
    return {
      kind: "CUSTOM_RECOMMENDATION",
      option: "Website/conversion-focused engagement (Growth is the smallest self-serve tier with website_maintenance)",
      reason: "Addresses website/conversion bottleneck; Business/Scale not required solely for this gap",
    };
  }

  if (domains.has("seo") && social === 0) {
    return {
      kind: "CUSTOM_RECOMMENDATION",
      option: "SEO/content engagement or Starter only if social content units are also required",
      reason: "Search visibility gap does not automatically require the highest social package",
    };
  }

  if (social > 0) {
    return {
      kind: "SMALLEST_COVERING_OPTION",
      option: tier || "active package",
      reason: "Allocate purchased package units to highest-priority work — quantities are constraints, not the strategy",
    };
  }

  return {
    kind: "CUSTOM_RECOMMENDATION",
    option: "Custom scoped engagement matching diagnosed domains",
    reason: "No single catalog plan exactly matches the diagnosed work set",
  };
}
