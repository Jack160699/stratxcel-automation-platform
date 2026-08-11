import type {
  DimensionStrength,
  PaidAcquisitionReadiness,
  PaidAcquisitionReadinessStatus,
  PaidAcquisitionSignals,
  ReadinessDimension,
  ReadinessDimensionKey,
} from "./types.ts";

function strengthToStatus(
  strength: DimensionStrength,
  setupWhenNone: boolean,
): ReadinessDimension["status"] {
  if (strength === "unknown") return "partial";
  if (strength === "none") return setupWhenNone ? "setup_required" : "fail";
  if (strength === "weak") return "partial";
  return "pass";
}

function dim(
  key: ReadinessDimensionKey,
  strength: DimensionStrength,
  evidenceIds: readonly string[],
  notes: string,
  blocksSpend: boolean,
  setupWhenNone = false,
): ReadinessDimension {
  return {
    key,
    strength,
    status: strengthToStatus(strength, setupWhenNone),
    evidenceIds,
    notes,
    blocksSpend,
  };
}

/** Evaluate whether paid acquisition is appropriate to plan. Never spend when funnel cannot convert. */
export function evaluatePaidAcquisitionReadiness(input: {
  tenantId: string;
  signals: PaidAcquisitionSignals;
  nowIso?: string;
}): PaidAcquisitionReadiness {
  const evidence = input.signals.evidenceIds ?? [];
  const entitlement = input.signals.metaAdCampaignEntitlement ?? 0;
  const dimensions: ReadinessDimension[] = [
    dim("offer_clarity", input.signals.offerClarity ?? "unknown", evidence, "Clear offer required before paid traffic", true),
    dim("landing_page", input.signals.landingPageStrength ?? "unknown", evidence, "Landing destination must be able to convert paid traffic", true),
    dim("tracking", input.signals.trackingStrength ?? "unknown", evidence, "Tracking gaps block trustworthy optimization", false),
    dim("conversion_path", input.signals.conversionPathStrength ?? "unknown", evidence, "Conversion path must work before buying discovery", true),
    dim("audience", input.signals.audienceDefinitionStrength ?? "unknown", evidence, "Audience hypothesis needed for responsible targeting", false),
    dim("creative_availability", input.signals.creativeAvailability ?? "unknown", evidence, "Creative can be requested via handoff when missing", false),
    {
      key: "account_connection",
      strength: input.signals.adAccountConnected === true ? "adequate" : "none",
      status: input.signals.adAccountConnected === true ? "pass" : "setup_required",
      evidenceIds: evidence,
      notes: "No Meta/Google Ads Marketing API account is connected in Stratxcel today",
      blocksSpend: true,
    },
    {
      key: "payment_spend_authority",
      strength: input.signals.spendAuthorityPresent === true ? "adequate" : "none",
      status: input.signals.spendAuthorityPresent === true ? "pass" : "setup_required",
      evidenceIds: evidence,
      notes: "Spend authority and billing mutation are out of scope — never auto-granted",
      blocksSpend: true,
    },
    {
      key: "historical_data",
      strength: input.signals.historicalAdsDataPresent === true ? "adequate" : "none",
      status: input.signals.historicalAdsDataPresent === true ? "pass" : "partial",
      evidenceIds: evidence,
      notes: "Historical ads performance is optional for first plan; do not fabricate metrics",
      blocksSpend: false,
    },
    {
      key: "entitlement",
      strength: entitlement > 0 ? "adequate" : "none",
      status: entitlement > 0 ? "pass" : "fail",
      evidenceIds: evidence,
      notes:
        entitlement > 0
          ? `meta_ad_campaigns entitlement limit ${entitlement}`
          : "No meta_ad_campaigns entitlement — cannot execute paid campaigns",
      blocksSpend: true,
    },
  ];

  const funnelCannotConvert = dimensions.some(
    (d) =>
      (d.key === "landing_page" || d.key === "conversion_path" || d.key === "offer_clarity") &&
      (d.status === "fail" || d.status === "setup_required" || d.strength === "weak" || d.strength === "none"),
  );
  const setupNeeded = dimensions.some((d) => d.status === "setup_required");

  let status: PaidAcquisitionReadinessStatus;
  if (funnelCannotConvert) status = "NOT_READY";
  else if (setupNeeded) status = "SETUP_REQUIRED";
  else if (dimensions.some((d) => d.status === "fail" || d.status === "partial")) status = "PARTIAL";
  else status = "READY";

  const blockingReasons = dimensions
    .filter((d) => d.status === "fail" || d.status === "setup_required" || (d.blocksSpend && d.strength === "weak"))
    .map((d) => `${d.key}: ${d.notes}`);

  const mayRecommendPaid =
    !funnelCannotConvert &&
    (input.signals.conversionPathStrength === "adequate" || input.signals.conversionPathStrength === "strong") &&
    (input.signals.landingPageStrength === "adequate" || input.signals.landingPageStrength === "strong") &&
    (input.signals.offerClarity === "adequate" || input.signals.offerClarity === "strong");

  const summary =
    status === "NOT_READY"
      ? "Paid acquisition is not ready — conversion foundation is insufficient; do not buy traffic yet."
      : status === "SETUP_REQUIRED"
        ? "Funnel may support paid planning, but ad account / spend authority / setup is required before any execution."
        : status === "PARTIAL"
          ? "Paid acquisition planning is possible with gaps; spend remains unauthorized."
          : "Paid acquisition readiness dimensions pass for planning; spend still requires separate authorization.";

  return {
    tenantId: input.tenantId,
    status,
    dimensions,
    blockingReasons,
    mayRecommendPaid,
    mayPlanCampaign: status !== "NOT_READY",
    authorizesSpend: false,
    summary,
    evidenceIds: evidence,
    assessedAtIso: input.nowIso ?? new Date().toISOString(),
  };
}
