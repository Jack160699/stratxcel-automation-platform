import type { GrowthBottleneck } from "../planning/growth-types.ts";
import type { BusinessSignals } from "../planning/types.ts";
import type { GrowthLever, GrowthLeverSelection, PaidAcquisitionReadiness } from "./types.ts";

/** Growth chooses among levers. Advertising is one lever — never equated with growth. */
export function selectGrowthLevers(input: {
  bottlenecks: readonly GrowthBottleneck[];
  businessSignals?: BusinessSignals;
  readiness?: PaidAcquisitionReadiness | null;
  evidenceIds?: readonly string[];
}): GrowthLeverSelection {
  const codes = input.bottlenecks.map((b) => b.code);
  const top = input.bottlenecks[0];
  const evidenceIds = input.evidenceIds ?? input.bottlenecks.flatMap((b) => b.evidenceIds);
  const signals = input.businessSignals ?? {};
  const deferred: GrowthLever[] = [];
  const secondary: GrowthLever[] = [];
  let primary: GrowthLever = "organic";
  let recommendPaid = false;

  if (top?.code === "SLOW_LEAD_RESPONSE" || top?.code === "WEAK_FOLLOW_UP") {
    primary = "crm_followup";
    secondary.push("conversion");
    deferred.push("paid", "social");
  } else if (top?.code === "WEAK_WEBSITE_CONVERSION" || top?.code === "POOR_LEAD_CAPTURE") {
    primary = "conversion";
    secondary.push("organic");
    deferred.push("paid");
  } else if (top?.code === "WEAK_SEARCH_VISIBILITY") {
    primary = "search";
    secondary.push("organic");
    if (input.readiness?.mayRecommendPaid) {
      secondary.push("paid");
      recommendPaid = true;
    } else deferred.push("paid");
  } else if (top?.code === "MISSING_DIGITAL_FOUNDATION") {
    primary = "organic";
    secondary.push("conversion");
    deferred.push("paid", "social", "search");
  } else if (top?.code === "LOW_DISCOVERY" || top?.code === "INSUFFICIENT_DEMAND") {
    const funnelOk =
      signals.postContactConversionStrength === "high" ||
      signals.postContactConversionStrength === "medium" ||
      signals.leadCaptureStrength === "adequate" ||
      signals.leadCaptureStrength === "strong" ||
      input.readiness?.mayRecommendPaid === true;
    if (funnelOk && input.readiness?.mayRecommendPaid) {
      primary = "paid";
      secondary.push("search", "organic");
      recommendPaid = true;
    } else if (funnelOk) {
      primary = "search";
      secondary.push("organic", "social");
      deferred.push("paid");
    } else {
      primary = "conversion";
      secondary.push("organic");
      deferred.push("paid");
    }
  } else if (
    signals.socialPresenceStrength === "high" &&
    (signals.websiteTrafficStrength === "high" || signals.websiteTrafficStrength === "medium") &&
    (!top || top.severity === "info" || top.severity === "low")
  ) {
    primary = "retention";
    secondary.push("organic", "crm_followup");
    deferred.push("paid");
  } else if (top?.code === "MISSING_ATTRIBUTION") {
    primary = "conversion";
    secondary.push("organic");
    deferred.push("paid");
  } else {
    primary = "organic";
    secondary.push("search");
    deferred.push("paid");
  }

  const strongOrganic =
    (signals.websiteTrafficStrength === "high" || signals.socialPresenceStrength === "high") &&
    (typeof signals.monthlyInquiries === "number" ? signals.monthlyInquiries >= 100 : false);

  if (strongOrganic && primary === "paid") {
    primary = "organic";
    secondary.push("retention", "crm_followup");
    if (!deferred.includes("paid")) deferred.push("paid");
    recommendPaid = false;
  }

  const paidVsOrganicReasoning = recommendPaid
    ? "Conversion foundation appears adequate and discovery/demand is the bottleneck — paid may be planned as one lever after setup/approval; organic/search remain complementary."
    : strongOrganic
      ? "Organic/discovery systems already produce meaningful inquiry volume — paid ads are not mandatory; prioritize retention and conversion quality."
      : primary === "crm_followup" || primary === "conversion"
        ? "Demand may already exist or funnel leaks dominate — fix conversion/follow-up before buying traffic."
        : "Insufficient evidence or readiness to recommend paid; prefer organic/search levers that do not require spend.";

  return {
    primary,
    secondary: unique(secondary.filter((l) => l !== primary)),
    deferred: unique(deferred.filter((l) => l !== primary && !secondary.includes(l))),
    paidVsOrganicReasoning,
    bottleneckCodes: codes,
    evidenceIds,
    paidMandatory: false,
    recommendPaid,
  };
}

function unique<T>(arr: readonly T[]): T[] {
  return [...new Set(arr)];
}
