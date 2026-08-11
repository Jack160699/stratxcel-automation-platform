import type { BrandBrainContent } from "@stratxcel/brand-brain";
import type { CapabilityKey } from "../capabilities/types.ts";
import type { DepartmentKey } from "../departments/types.ts";
import type { MissionBudgetEnvelope } from "../budgets/hierarchy.ts";
import type { KnowledgeClaimStatus } from "./knowledge.ts";

export type {
  KnowledgeClaimStatus,
  KnowledgeClaim,
} from "./knowledge.ts";

export type {
  CustomerEntryMode,
  DiagnosticDomain,
  DiagnosticFindingStatus,
  DiagnosticSeverity,
  BusinessGrowthDiagnosisFinding,
  BusinessGrowthDiagnosis,
  GrowthBottleneckCode,
  GrowthBottleneck,
  GrowthRecommendation,
  PlanRecommendation,
  CommercialFitKind,
} from "./growth-types.ts";

export type AllocationPolicy =
  | "FIXED_COMPOSITION"
  | "FLEXIBLE_COMPOSITION"
  | "MINIMUM_COMPOSITION"
  | "CUSTOM_CONTRACT"
  | "UNKNOWN";

export type MediaType = "image" | "reel" | "carousel" | "story";

export interface PackageCompositionItem {
  mediaType: MediaType;
  quantity: number;
}

export interface SocialAllocation {
  images: number;
  reels: number;
  carousels: number;
  stories: number;
  totalUnits: number;
}

/** Real billing metrics + optional composition helpers. Unknown keys fail closed at validation. */
export type KnownEntitlementMetric =
  | "social_posts"
  | "meta_ad_campaigns"
  | "whatsapp_contacts"
  | "website_maintenance"
  | "social_content_units";

/**
 * Generalized commercial envelope.
 * Composition policies apply only when social composition is present.
 * Snapshot is planning-time only — revalidate before execution.
 */
export interface BusinessGrowthEntitlementSnapshot {
  allocationPolicy: AllocationPolicy;
  packageComposition: readonly PackageCompositionItem[];
  /** Limits keyed by known metrics; do not invent conflicting billing names. */
  relevantEntitlements: Partial<Record<KnownEntitlementMetric, number>> & Record<string, number>;
  currentUsage?: Partial<Record<KnownEntitlementMetric, number>> & Record<string, number>;
  remainingUsage?: Partial<Record<KnownEntitlementMetric, number>> & Record<string, number>;
  planTier?: string;
  subscriptionId?: string | null;
  periodStartIso?: string;
  periodEndIso?: string;
  /** Explicit purchased service keys (e.g. brand_audit) when not a recurring package. */
  purchasedServiceKeys?: readonly string[];
}

/** @deprecated Prefer BusinessGrowthEntitlementSnapshot — alias retained for compatibility. */
export type EntitlementSnapshot = BusinessGrowthEntitlementSnapshot;

export type PlanStatus =
  | "DRAFT"
  | "VALIDATING"
  | "READY"
  | "RUNNING"
  | "NEEDS_ATTENTION"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type StageState =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "WAITING_DEPENDENCY"
  | "WAITING_CAPABILITY"
  | "WAITING_APPROVAL"
  | "REVIEWING"
  | "REVISION_REQUIRED"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export interface WorkforceStage {
  stageId: string;
  department: DepartmentKey;
  specialistRole: string;
  objective: string;
  dependencies: readonly string[];
  inputs: readonly string[];
  requiredEvidence: readonly string[];
  outputKind: string;
  allowedCapabilityClasses: readonly CapabilityKey[];
  budgetCents: number;
  qualityGate: readonly string[];
  maxAttempts: number;
  state: StageState;
  blockedCapability?: string | null;
}

export interface WorkforcePlan {
  id: string;
  tenantId: string;
  missionId: string;
  version: number;
  previousPlanId?: string;
  objective: string;
  /** Preferred: businessOutcomeTarget. businessOutcome retained for compatibility. */
  businessOutcome: string;
  businessObjective?: string;
  businessOutcomeTarget?: string;
  positioningContext?: string;
  planningHorizon: "30_day" | "mission" | "business_growth";
  entitlementSnapshot: BusinessGrowthEntitlementSnapshot;
  capabilitySnapshot: readonly CapabilityKey[];
  departmentStages: readonly WorkforceStage[];
  dependencies: Readonly<Record<string, readonly string[]>>;
  expectedDeliverables: readonly string[];
  qualityPolicyId: string;
  revisionPolicyId: string;
  budgetEnvelope: MissionBudgetEnvelope;
  approvalPolicyId: string;
  createdAtIso: string;
  status: PlanStatus;
  revisionReason?: string | null;
  revisionEvidenceIds?: readonly string[];
}

export type FunnelPurpose =
  | "awareness"
  | "authority"
  | "education"
  | "proof"
  | "offer"
  | "conversion"
  | "retargeting"
  | "community"
  | "follow_up"
  | "foundation";

export type ServiceDomain =
  | "audit"
  | "brand"
  | "research"
  | "strategy"
  | "social"
  | "content"
  | "media"
  | "seo"
  | "website"
  | "advertising"
  | "growth"
  | "crm"
  | "whatsapp"
  | "sales"
  | "conversion"
  | "analytics"
  | "reporting"
  | "operations";

export interface SocialDeliverableDetails {
  mediaType: MediaType;
  platform?: string;
  contentObjective?: string;
}

export interface SEOArticleDetails {
  topic: string;
  targetKeywords?: readonly string[];
}

export interface SEOAuditDetails {
  scope: string;
}

export interface WebsiteChangeDetails {
  pageType: string;
  changeKind: "new_page" | "conversion_fix" | "copy_update" | "structure";
}

export interface CRMWorkflowDetails {
  workflowKind: "follow_up" | "qualification" | "nurture" | "handoff";
}

export interface PlannedWorkItem {
  id: string;
  serviceDomain: ServiceDomain;
  department: DepartmentKey;
  capability?: CapabilityKey | string;
  deliverableKind: string;
  objective: string;
  funnelPurpose?: FunnelPurpose;
  week?: number;
  day?: number;
  dateWindow?: { startIso?: string; endIso?: string };
  channel?: string | null;
  quantity?: number;
  dependencies?: readonly string[];
  evidenceRequirements?: readonly string[];
  entitlementClass?: string | null;
  estimatedUnits?: number;
  approvalRequirement?: "none" | "standing_or_manual" | "manual_always";
  status?: "PLANNED" | "BLOCKED_CAPABILITY" | "SETUP_REQUIRED" | "NO_CONNECTED_CHANNEL" | "READY";
  blockedReason?: string;
  social?: SocialDeliverableDetails;
  seoArticle?: SEOArticleDetails;
  seoAudit?: SEOAuditDetails;
  website?: WebsiteChangeDetails;
  crm?: CRMWorkflowDetails;
}

/**
 * Backward-compatible social-oriented deliverable view.
 * Prefer PlannedWorkItem for new code. mediaType optional when non-social.
 */
export interface PlannedDeliverable {
  id: string;
  week: number;
  day: number;
  mediaType?: MediaType;
  funnelPurpose: FunnelPurpose;
  channel: string;
  theme: string;
  objective: string;
  workItemId?: string;
}

export interface WeeklyStrategy {
  week: number;
  focus: string;
  objectives: readonly string[];
}

export interface SocialSubPlan {
  allocation: SocialAllocation;
  connectedChannels: readonly string[];
  channelStatus: "CONNECTED" | "NO_CONNECTED_CHANNEL" | "SETUP_REQUIRED";
  plannedUnits: readonly PlannedWorkItem[];
}

export interface StrategicHorizon {
  nowDiagnosis: string;
  first30Days: string;
  days31to60Direction?: string;
  days61to90Direction?: string;
}

export interface CustomerFacingPlanContract {
  yourBusiness: string;
  yourCurrentPosition: string;
  whatsWorking: readonly string[];
  biggestGrowthOpportunities: readonly string[];
  thirtyDayPlanSummary: string;
  thisWeekFocus: string;
  workInProgress: readonly string[];
  whatNeedsYou: readonly string[];
  results: readonly string[];
  nextRecommendation: string | null;
}

export interface PlanningContextSnapshot {
  brandBrain: BrandBrainContent;
  brandBrainVersion?: number | null;
  productsServices: readonly string[];
  targetAudience: string;
  geography: string;
  positioning: string;
  timezone: string;
  connectedChannels: readonly string[];
  businessGoals: readonly string[];
}

/** Canonical Business Growth Plan (includes 30-day execution horizon). */
export interface BusinessGrowthPlan {
  id: string;
  tenantId: string;
  missionId: string;
  version: number;
  entryMode: import("./growth-types.ts").CustomerEntryMode;
  strategicThesis: string;
  businessObjective: string;
  businessOutcomeTarget: string;
  positioningContext: string;
  primaryObjective: string;
  secondaryObjectives: readonly string[];
  targetSegments: readonly string[];
  messagingThemes: readonly string[];
  funnelMap: readonly string[];
  channelRoles: Readonly<Record<string, string>>;
  weeklyStrategy: readonly WeeklyStrategy[];
  /** Generic work items across domains. */
  plannedWorkItems: readonly PlannedWorkItem[];
  /** Social-shaped view for package compatibility (may be empty when non-social). */
  plannedDeliverables: readonly PlannedDeliverable[];
  researchTasks: readonly string[];
  knowledgeClaims: readonly import("./knowledge.ts").KnowledgeClaim[];
  diagnosis: import("./growth-types.ts").BusinessGrowthDiagnosis;
  bottlenecks: readonly import("./growth-types.ts").GrowthBottleneck[];
  recommendations: readonly import("./growth-types.ts").GrowthRecommendation[];
  planRecommendations: readonly import("./growth-types.ts").PlanRecommendation[];
  socialPlan?: SocialSubPlan;
  /** @deprecated use socialPlan?.allocation — retained when social subplan exists. */
  socialAllocation?: SocialAllocation;
  strategicHorizon: StrategicHorizon;
  customerFacing: CustomerFacingPlanContract;
  planningContext: PlanningContextSnapshot;
  workforcePlan: WorkforcePlan;
  createdAtIso: string;
}

/** @deprecated Alias — BusinessGrowthPlan is canonical. */
export type ThirtyDayPlan = BusinessGrowthPlan;

export type WorkflowFocus =
  | "audit_diagnosis"
  | "social_package"
  | "website_conversion"
  | "seo_content"
  | "crm_whatsapp_conversion"
  | "paid_acquisition_readiness"
  | "foundation_new_business"
  | "mixed_package"
  | "auto";

export interface BusinessGrowthPlannerInput {
  tenantId: string;
  missionId: string;
  timezone: string;
  currentDateIso: string;
  brandBrain: BrandBrainContent;
  brandBrainVersion?: number | null;
  productsServices: readonly string[];
  targetAudience: string;
  geography: string;
  positioning: string;
  connectedChannels: readonly string[];
  businessGoals: readonly string[];
  previousPerformance: readonly Record<string, unknown>[];
  existingResearchEvidence: readonly string[];
  activeCampaigns: readonly string[];
  availableCapabilities: readonly CapabilityKey[];
  entitlementSnapshot: BusinessGrowthEntitlementSnapshot;
  budgetEnvelope: MissionBudgetEnvelope;
  entryMode?: import("./growth-types.ts").CustomerEntryMode;
  workflowFocus?: WorkflowFocus;
  /** Optional CEO-proposed stages; validated deterministically. */
  proposedStages?: readonly WorkforceStage[];
  proposedWeeklyStrategy?: readonly WeeklyStrategy[];
  /** Business signals for diagnosis (evidence-backed facts only). */
  businessSignals?: BusinessSignals;
}

export interface BusinessSignals {
  hasWebsite?: boolean;
  websiteTrafficStrength?: "none" | "low" | "medium" | "high";
  socialPresenceStrength?: "none" | "low" | "medium" | "high";
  hasAds?: boolean;
  monthlyInquiries?: number | null;
  medianResponseTimeHours?: number | null;
  crmFollowUpStrength?: "none" | "weak" | "adequate" | "strong";
  postContactConversionStrength?: "none" | "low" | "medium" | "high";
  searchVisibilityStrength?: "none" | "low" | "medium" | "high";
  leadCaptureStrength?: "none" | "weak" | "adequate" | "strong";
  analyticsAttributionStrength?: "none" | "weak" | "adequate" | "strong";
  /** Explicit evidence ids supporting the above KNOWN signals. */
  signalEvidenceIds?: readonly string[];
}

/** @deprecated Prefer BusinessGrowthPlannerInput. */
export type ThirtyDayPlannerInput = BusinessGrowthPlannerInput;

export interface ThirtyDayPlanRevisionInput {
  revisionReason: string;
  evidenceIds: readonly string[];
  proposedByDepartment: DepartmentKey;
  patch: Partial<
    Pick<
      BusinessGrowthPlan,
      "messagingThemes" | "primaryObjective" | "secondaryObjectives" | "businessOutcomeTarget" | "weeklyStrategy"
    >
  >;
}

export interface ContractSnapshotInput {
  allocationPolicy: AllocationPolicy;
  packageComposition: readonly PackageCompositionItem[];
  relevantEntitlements: Record<string, number>;
  currentUsage?: Record<string, number>;
  planTier?: string;
  subscriptionId?: string | null;
  periodStartIso?: string;
  periodEndIso?: string;
  purchasedServiceKeys?: readonly string[];
}

export class AllocationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllocationPolicyError";
  }
}

export class WorkforcePlanValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkforcePlanValidationError";
    this.code = code;
  }
}
