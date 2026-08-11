/**
 * Advertising + Growth acquisition contracts.
 * Planning artifacts only — never authorize production spend or ad-account billing mutation.
 */

export type PaidAcquisitionReadinessStatus =
  | "READY"
  | "PARTIAL"
  | "NOT_READY"
  | "SETUP_REQUIRED";

export type ReadinessDimensionKey =
  | "offer_clarity"
  | "landing_page"
  | "tracking"
  | "conversion_path"
  | "audience"
  | "creative_availability"
  | "account_connection"
  | "payment_spend_authority"
  | "historical_data"
  | "entitlement";

export type DimensionStrength = "none" | "weak" | "adequate" | "strong" | "unknown";

export interface ReadinessDimension {
  key: ReadinessDimensionKey;
  strength: DimensionStrength;
  status: "pass" | "partial" | "fail" | "setup_required";
  evidenceIds: readonly string[];
  notes: string;
  blocksSpend: boolean;
}

export interface PaidAcquisitionReadiness {
  tenantId: string;
  status: PaidAcquisitionReadinessStatus;
  dimensions: readonly ReadinessDimension[];
  blockingReasons: readonly string[];
  mayRecommendPaid: boolean;
  mayPlanCampaign: boolean;
  /** Always false — plan never equals spend. */
  authorizesSpend: false;
  summary: string;
  evidenceIds: readonly string[];
  assessedAtIso: string;
}

export type GrowthLever =
  | "organic"
  | "search"
  | "social"
  | "paid"
  | "conversion"
  | "crm_followup"
  | "retention";

export interface GrowthLeverSelection {
  primary: GrowthLever;
  secondary: readonly GrowthLever[];
  deferred: readonly GrowthLever[];
  paidVsOrganicReasoning: string;
  bottleneckCodes: readonly string[];
  evidenceIds: readonly string[];
  paidMandatory: false;
  recommendPaid: boolean;
}

export type AdPlatform = "meta" | "google" | "other";
export type FunnelStage = "awareness" | "consideration" | "conversion" | "retention" | "remarketing";

export type AudienceKind =
  | "first_party"
  | "retargeting"
  | "lookalike"
  | "interest_contextual"
  | "search_intent";

export interface AudienceHypothesis {
  kind: AudienceKind;
  label: string;
  eligible: boolean;
  platformSupported: boolean;
  reason: string;
  sensitiveTargetingRisk: boolean;
  evidenceIds: readonly string[];
}

export interface BudgetProposal {
  currency: "INR" | "USD" | "UNKNOWN";
  proposedMinCents: number | null;
  proposedMaxCents: number | null;
  envelopeCapCents: number | null;
  withinCommercialEnvelope: boolean;
  authorizesSpend: false;
  assumptions: readonly string[];
  evidenceIds: readonly string[];
  predictedCpcCents: null;
  predictedCpaCents: null;
  notes: string;
}

export interface CampaignPlanApprovals {
  requiresPlanApproval: true;
  requiresSpendAuthorization: true;
  requiresCreativeApproval: true;
  requiresFinanceClearance: true;
  approvedForSpend: false;
}

export interface AcquisitionMeasurementContract {
  ownerWorkstream: "measurement_engine";
  primaryMetric: string;
  secondaryMetrics: readonly string[];
  attributionWindowDays: number | null;
  requiredEventNames: readonly string[];
  feedSchemaVersion: "acquisition.v1";
  notes: string;
}

export interface CampaignPlan {
  id: string;
  tenantId: string;
  missionId: string;
  objective: string;
  businessOutcome: string;
  platform: AdPlatform;
  funnelStage: FunnelStage;
  audienceHypotheses: readonly AudienceHypothesis[];
  offer: string;
  landingDestination: string | null;
  creativeRequirements: readonly string[];
  placements: readonly string[];
  budgetProposal: BudgetProposal;
  durationDays: number | null;
  kpi: string;
  measurement: AcquisitionMeasurementContract;
  stopConditions: readonly string[];
  experimentDesignId: string | null;
  approvals: CampaignPlanApprovals;
  evidenceIds: readonly string[];
  readinessStatus: PaidAcquisitionReadinessStatus;
  authorizesSpend: false;
  authorizesPublish: false;
  createdAtIso: string;
}

export interface AdCreativeBrief {
  id: string;
  tenantId: string;
  missionId: string;
  campaignPlanId: string;
  objective: string;
  audience: string;
  offer: string;
  hook: string;
  format: "image" | "carousel" | "video" | "reel" | "search_text" | "mixed";
  variantsNeeded: number;
  platformConstraints: readonly string[];
  claimConstraints: readonly string[];
  handoffDepartment: "creative";
  evidenceIds: readonly string[];
  createdAtIso: string;
}

export interface LandingPageHandoffRequest {
  id: string;
  tenantId: string;
  missionId: string;
  campaignPlanId: string;
  reason: string;
  requiredPageType: "landing" | "offer" | "thank_you";
  conversionRequirements: readonly string[];
  handoffDepartment: "website";
  evidenceIds: readonly string[];
  createdAtIso: string;
}

export interface ExperimentPlan {
  id: string;
  tenantId: string;
  missionId: string;
  hypothesis: string;
  variable: string;
  control: string;
  variants: readonly string[];
  metric: string;
  minimumEvidenceCriterion: string;
  evaluationWindowDays: number;
  stopCondition: string;
  claimsStatisticalSignificance: false;
  evidenceIds: readonly string[];
  createdAtIso: string;
}

export type AdsPublishGateCode =
  | "tenant"
  | "account"
  | "entitlement"
  | "approval"
  | "spend_authorization"
  | "budget"
  | "kill_switch"
  | "provider_readiness"
  | "readiness"
  | "creative_ready"
  | "plan_approved";

export interface AdsPublishGateResult {
  allowed: false;
  decision: "DENIED";
  failedGates: readonly AdsPublishGateCode[];
  reasons: readonly string[];
  productionMutations: "NONE";
}

export type PaidAdsAuditVerdict =
  | "NO"
  | "NOT_YET"
  | "SETUP_REQUIRED"
  | "CONDITIONAL_YES"
  | "INSUFFICIENT_EVIDENCE";

export interface PaidAdsAuditAssessment {
  tenantId: string;
  verdict: PaidAdsAuditVerdict;
  shouldRunPaidAds: boolean;
  readiness: PaidAcquisitionReadiness;
  growthLevers: GrowthLeverSelection;
  rationale: string;
  evidenceIds: readonly string[];
  upsellDefault: false;
  assessedAtIso: string;
}

export interface PaidAcquisitionSignals {
  offerClarity?: DimensionStrength;
  landingPageStrength?: DimensionStrength;
  trackingStrength?: DimensionStrength;
  conversionPathStrength?: DimensionStrength;
  audienceDefinitionStrength?: DimensionStrength;
  creativeAvailability?: DimensionStrength;
  adAccountConnected?: boolean;
  adPlatforms?: readonly AdPlatform[];
  spendAuthorityPresent?: boolean;
  historicalAdsDataPresent?: boolean;
  metaAdCampaignEntitlement?: number;
  killSwitchEngaged?: boolean;
  evidenceIds?: readonly string[];
}
