import { randomUUID } from "node:crypto";
import type { MissionBudgetEnvelope } from "../budgets/hierarchy.ts";
import { buildAudienceHypotheses, proposeCampaignBudget } from "./audience-budget.ts";
import type {
  AcquisitionMeasurementContract,
  AdCreativeBrief,
  AdPlatform,
  CampaignPlan,
  ExperimentPlan,
  FunnelStage,
  LandingPageHandoffRequest,
  PaidAcquisitionReadiness,
  PaidAcquisitionSignals,
} from "./types.ts";

export function buildDefaultMeasurementContract(input: {
  primaryMetric?: string;
  secondaryMetrics?: readonly string[];
}): AcquisitionMeasurementContract {
  return {
    ownerWorkstream: "measurement_engine",
    primaryMetric: input.primaryMetric ?? "qualified_leads",
    secondaryMetrics: input.secondaryMetrics ?? ["landing_conversions", "cost_per_qualified_lead"],
    attributionWindowDays: null,
    requiredEventNames: ["ad_click", "landing_view", "lead_created"],
    feedSchemaVersion: "acquisition.v1",
    notes:
      "Structured measurement contract for Workstream 8 — Advertising does not interpret analytics globally",
  };
}

export function createCampaignPlan(input: {
  tenantId: string;
  missionId: string;
  readiness: PaidAcquisitionReadiness;
  signals: PaidAcquisitionSignals;
  missionBudget: MissionBudgetEnvelope;
  objective: string;
  businessOutcome: string;
  offer: string;
  platform?: AdPlatform;
  funnelStage?: FunnelStage;
  landingDestination?: string | null;
  targetAudience?: string;
  hasFirstPartyList?: boolean;
  hasSitePixelOrEvents?: boolean;
  durationDays?: number | null;
  kpi?: string;
  policyMaxCents?: number | null;
  requestedMaxCents?: number | null;
  experimentDesignId?: string | null;
  nowIso?: string;
}): CampaignPlan {
  if (input.readiness.status === "NOT_READY") throw new Error("campaign_plan_blocked_not_ready");

  const platforms = input.signals.adPlatforms ?? [];
  const platform =
    input.platform ??
    (platforms.includes("meta") ? "meta" : platforms.includes("google") ? "google" : "other");

  const audiences = buildAudienceHypotheses({
    signals: input.signals,
    targetAudience: input.targetAudience,
    hasFirstPartyList: input.hasFirstPartyList,
    hasSitePixelOrEvents: input.hasSitePixelOrEvents,
    evidenceIds: input.readiness.evidenceIds,
  }).filter((a) => a.eligible || a.kind === "search_intent");

  const budgetProposal = proposeCampaignBudget({
    missionBudget: input.missionBudget,
    policyMaxCents: input.policyMaxCents,
    requestedMaxCents: input.requestedMaxCents,
    evidenceIds: input.readiness.evidenceIds,
    hasPerformanceEvidence: input.signals.historicalAdsDataPresent === true,
  });

  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    missionId: input.missionId,
    objective: input.objective,
    businessOutcome: input.businessOutcome,
    platform,
    funnelStage: input.funnelStage ?? "conversion",
    audienceHypotheses: audiences,
    offer: input.offer,
    landingDestination:
      input.landingDestination !== undefined ? input.landingDestination : "existing_primary_landing",
    creativeRequirements: [
      "Primary hook aligned to offer",
      "Proof/claim constraints from Brand Brain",
      "Platform-safe format variants",
    ],
    placements:
      platform === "google" ? ["search"] : platform === "meta" ? ["feed", "stories"] : ["unspecified"],
    budgetProposal,
    durationDays: input.durationDays ?? null,
    kpi: input.kpi ?? "qualified_leads",
    measurement: buildDefaultMeasurementContract({ primaryMetric: input.kpi ?? "qualified_leads" }),
    stopConditions: [
      "Kill switch engaged",
      "Spend authorization revoked",
      "Budget envelope exhausted",
      "Landing conversion collapses below agreed floor (when measured)",
      "Compliance or sensitive-targeting violation",
    ],
    experimentDesignId: input.experimentDesignId ?? null,
    approvals: {
      requiresPlanApproval: true,
      requiresSpendAuthorization: true,
      requiresCreativeApproval: true,
      requiresFinanceClearance: true,
      approvedForSpend: false,
    },
    evidenceIds: input.readiness.evidenceIds,
    readinessStatus: input.readiness.status,
    authorizesSpend: false,
    authorizesPublish: false,
    createdAtIso: input.nowIso ?? new Date().toISOString(),
  };
}

export function createAdCreativeBrief(input: {
  tenantId: string;
  missionId: string;
  campaignPlan: CampaignPlan;
  hook: string;
  format?: AdCreativeBrief["format"];
  variantsNeeded?: number;
  claimConstraints?: readonly string[];
  nowIso?: string;
}): AdCreativeBrief {
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    missionId: input.missionId,
    campaignPlanId: input.campaignPlan.id,
    objective: input.campaignPlan.objective,
    audience: input.campaignPlan.audienceHypotheses[0]?.label ?? "Primary audience hypothesis",
    offer: input.campaignPlan.offer,
    hook: input.hook,
    format: input.format ?? (input.campaignPlan.platform === "google" ? "search_text" : "image"),
    variantsNeeded: input.variantsNeeded ?? 3,
    platformConstraints: [
      `platform:${input.campaignPlan.platform}`,
      ...input.campaignPlan.placements.map((p) => `placement:${p}`),
    ],
    claimConstraints: input.claimConstraints ?? [
      "No unverified performance claims",
      "No fabricated testimonials",
      "Respect Brand Brain voice and offer rules",
    ],
    handoffDepartment: "creative",
    evidenceIds: input.campaignPlan.evidenceIds,
    createdAtIso: input.nowIso ?? new Date().toISOString(),
  };
}

export function createLandingPageHandoff(input: {
  tenantId: string;
  missionId: string;
  campaignPlan: CampaignPlan;
  reason?: string;
  landingInsufficient?: boolean;
  nowIso?: string;
}): LandingPageHandoffRequest | null {
  const missingDestination = input.campaignPlan.landingDestination == null;
  if (!missingDestination && !input.landingInsufficient && !input.reason) return null;
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    missionId: input.missionId,
    campaignPlanId: input.campaignPlan.id,
    reason:
      input.reason ??
      (missingDestination
        ? "Landing destination missing — hand off to Website Department"
        : "Landing page insufficient for paid traffic — hand off to Website Department"),
    requiredPageType: "landing",
    conversionRequirements: [
      "Clear offer above the fold",
      "Primary CTA to inquiry/conversion",
      "Tracking events for lead_created",
    ],
    handoffDepartment: "website",
    evidenceIds: input.campaignPlan.evidenceIds,
    createdAtIso: input.nowIso ?? new Date().toISOString(),
  };
}

export function createExperimentPlan(input: {
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
  evidenceIds?: readonly string[];
  nowIso?: string;
}): ExperimentPlan {
  if (input.variants.length === 0) throw new Error("experiment_requires_variants");
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    missionId: input.missionId,
    hypothesis: input.hypothesis,
    variable: input.variable,
    control: input.control,
    variants: input.variants,
    metric: input.metric,
    minimumEvidenceCriterion: input.minimumEvidenceCriterion,
    evaluationWindowDays: input.evaluationWindowDays,
    stopCondition: input.stopCondition,
    claimsStatisticalSignificance: false,
    evidenceIds: input.evidenceIds ?? [],
    createdAtIso: input.nowIso ?? new Date().toISOString(),
  };
}
