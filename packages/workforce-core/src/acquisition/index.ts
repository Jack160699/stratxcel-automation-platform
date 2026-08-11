export type {
  PaidAcquisitionReadinessStatus,
  ReadinessDimensionKey,
  DimensionStrength,
  ReadinessDimension,
  PaidAcquisitionReadiness,
  GrowthLever,
  GrowthLeverSelection,
  AdPlatform,
  FunnelStage,
  AudienceKind,
  AudienceHypothesis,
  BudgetProposal,
  CampaignPlanApprovals,
  CampaignPlan,
  AdCreativeBrief,
  LandingPageHandoffRequest,
  ExperimentPlan,
  AcquisitionMeasurementContract,
  AdsPublishGateCode,
  AdsPublishGateResult,
  PaidAdsAuditVerdict,
  PaidAdsAuditAssessment,
  PaidAcquisitionSignals,
} from "./types.ts";

export { evaluatePaidAcquisitionReadiness } from "./readiness.ts";
export { selectGrowthLevers } from "./growth-strategy.ts";
export {
  buildAudienceHypotheses,
  proposeCampaignBudget,
  assertBudgetWithinEnvelope,
} from "./audience-budget.ts";
export {
  buildDefaultMeasurementContract,
  createCampaignPlan,
  createAdCreativeBrief,
  createLandingPageHandoff,
  createExperimentPlan,
} from "./campaign.ts";
export {
  evaluateAdsPublishGates,
  refuseAdSpendMutation,
  refuseAdAccountBillingMutation,
} from "./execution-boundary.ts";
export {
  assessPaidAdsForAudit,
  signalsFromBusinessContext,
} from "./audit-assessment.ts";
