import type { GrowthBottleneck } from "../planning/growth-types.ts";
import type { BusinessSignals } from "../planning/types.ts";
import { selectGrowthLevers } from "./growth-strategy.ts";
import { evaluatePaidAcquisitionReadiness } from "./readiness.ts";
import type {
  PaidAdsAuditAssessment,
  PaidAdsAuditVerdict,
  PaidAcquisitionSignals,
} from "./types.ts";

/** Business Audit: "Should this customer run paid ads?" Never upsell by default. */
export function assessPaidAdsForAudit(input: {
  tenantId: string;
  signals: PaidAcquisitionSignals;
  businessSignals?: BusinessSignals;
  bottlenecks?: readonly GrowthBottleneck[];
  nowIso?: string;
}): PaidAdsAuditAssessment {
  const readiness = evaluatePaidAcquisitionReadiness({
    tenantId: input.tenantId,
    signals: input.signals,
    nowIso: input.nowIso,
  });
  const growthLevers = selectGrowthLevers({
    bottlenecks: input.bottlenecks ?? [],
    businessSignals: input.businessSignals,
    readiness,
    evidenceIds: readiness.evidenceIds,
  });

  let verdict: PaidAdsAuditVerdict;
  let rationale: string;

  if (readiness.status === "NOT_READY") {
    verdict = "NO";
    rationale =
      "NO — conversion foundation is insufficient. Do not run paid ads until offer, landing, and conversion path are adequate.";
  } else if (readiness.status === "SETUP_REQUIRED") {
    verdict = "SETUP_REQUIRED";
    rationale =
      "Paid ads may become appropriate after funnel readiness, but ad account connection and spend authority setup are required. No spend now.";
  } else if (!growthLevers.recommendPaid) {
    if (growthLevers.primary === "organic" || growthLevers.primary === "retention") {
      verdict = "NO";
      rationale =
        "Strong organic/existing demand systems do not require mandatory paid ads. Prefer retention, organic, or conversion levers.";
    } else {
      verdict = "NOT_YET";
      rationale = `Primary growth lever is ${growthLevers.primary}; paid is deferred. ${growthLevers.paidVsOrganicReasoning}`;
    }
  } else if (readiness.status === "PARTIAL" || readiness.status === "READY") {
    verdict = "CONDITIONAL_YES";
    rationale =
      readiness.status === "PARTIAL"
        ? "Paid acquisition may be planned conditionally after closing readiness gaps and obtaining approvals. This is not spend authorization."
        : "Evidence supports planning paid acquisition as one lever. Execution still requires entitlement, approval, spend authorization, budget, and provider readiness — no autonomous spend.";
  } else {
    verdict = "INSUFFICIENT_EVIDENCE";
    rationale = "Insufficient evidence to recommend paid ads. Do not upsell by default.";
  }

  return {
    tenantId: input.tenantId,
    verdict,
    shouldRunPaidAds: false,
    readiness,
    growthLevers,
    rationale,
    evidenceIds: readiness.evidenceIds,
    upsellDefault: false,
    assessedAtIso: input.nowIso ?? new Date().toISOString(),
  };
}

export function signalsFromBusinessContext(input: {
  businessSignals?: BusinessSignals;
  metaAdCampaignEntitlement?: number;
  adAccountConnected?: boolean;
  adPlatforms?: PaidAcquisitionSignals["adPlatforms"];
  spendAuthorityPresent?: boolean;
  offerClarity?: PaidAcquisitionSignals["offerClarity"];
  creativeAvailability?: PaidAcquisitionSignals["creativeAvailability"];
  killSwitchEngaged?: boolean;
}): PaidAcquisitionSignals {
  const s = input.businessSignals ?? {};
  const landing =
    s.hasWebsite === false
      ? "none"
      : s.leadCaptureStrength === "strong"
        ? "strong"
        : s.leadCaptureStrength === "adequate"
          ? "adequate"
          : s.leadCaptureStrength === "weak"
            ? "weak"
            : s.hasWebsite === true
              ? "weak"
              : "unknown";
  const conversion =
    s.postContactConversionStrength === "high"
      ? "strong"
      : s.postContactConversionStrength === "medium"
        ? "adequate"
        : s.postContactConversionStrength === "low"
          ? "weak"
          : s.postContactConversionStrength === "none"
            ? "none"
            : "unknown";

  return {
    offerClarity: input.offerClarity ?? (s.hasWebsite === true ? "adequate" : "unknown"),
    landingPageStrength: landing,
    trackingStrength:
      s.analyticsAttributionStrength === "strong"
        ? "strong"
        : s.analyticsAttributionStrength === "adequate"
          ? "adequate"
          : s.analyticsAttributionStrength === "weak"
            ? "weak"
            : s.analyticsAttributionStrength === "none"
              ? "none"
              : "unknown",
    conversionPathStrength: conversion,
    audienceDefinitionStrength: "unknown",
    creativeAvailability: input.creativeAvailability ?? "unknown",
    adAccountConnected: input.adAccountConnected ?? false,
    adPlatforms: input.adPlatforms ?? [],
    spendAuthorityPresent: input.spendAuthorityPresent ?? false,
    historicalAdsDataPresent: s.hasAds === true,
    metaAdCampaignEntitlement: input.metaAdCampaignEntitlement ?? 0,
    killSwitchEngaged: input.killSwitchEngaged ?? false,
    evidenceIds: s.signalEvidenceIds ?? [],
  };
}
