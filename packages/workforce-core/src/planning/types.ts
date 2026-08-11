import type { BrandBrainContent } from "@stratxcel/brand-brain";
import type { CapabilityKey } from "../capabilities/types.ts";
import type { DepartmentKey } from "../departments/types.ts";
import type { MissionBudgetEnvelope } from "../budgets/hierarchy.ts";

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

export interface EntitlementSnapshot {
  allocationPolicy: AllocationPolicy;
  packageComposition: readonly PackageCompositionItem[];
  relevantEntitlements: Record<string, number>;
  planTier?: string;
  periodStartIso?: string;
  periodEndIso?: string;
}

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
}

export interface WorkforcePlan {
  id: string;
  tenantId: string;
  missionId: string;
  version: number;
  previousPlanId?: string;
  objective: string;
  businessOutcome: string;
  planningHorizon: "30_day" | "mission";
  entitlementSnapshot: EntitlementSnapshot;
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
}

export type KnowledgeClaimStatus = "KNOWN" | "DERIVED" | "ASSUMPTION" | "RESEARCH_REQUIRED";

export interface KnowledgeClaim {
  claim: string;
  status: KnowledgeClaimStatus;
  evidenceIds?: readonly string[];
}

export type FunnelPurpose =
  | "awareness"
  | "authority"
  | "education"
  | "proof"
  | "offer"
  | "conversion"
  | "retargeting"
  | "community";

export interface PlannedDeliverable {
  id: string;
  week: number;
  day: number;
  mediaType: MediaType;
  funnelPurpose: FunnelPurpose;
  channel: string;
  theme: string;
  objective: string;
}

export interface WeeklyStrategy {
  week: number;
  focus: string;
  objectives: readonly string[];
}

export interface ThirtyDayPlan {
  id: string;
  tenantId: string;
  missionId: string;
  version: number;
  strategicThesis: string;
  primaryObjective: string;
  secondaryObjectives: readonly string[];
  targetSegments: readonly string[];
  messagingThemes: readonly string[];
  funnelMap: readonly string[];
  channelRoles: Readonly<Record<string, string>>;
  weeklyStrategy: readonly WeeklyStrategy[];
  plannedDeliverables: readonly PlannedDeliverable[];
  researchTasks: readonly string[];
  knowledgeClaims: readonly KnowledgeClaim[];
  socialAllocation: SocialAllocation;
  workforcePlan: WorkforcePlan;
  createdAtIso: string;
}

export interface ThirtyDayPlannerInput {
  tenantId: string;
  missionId: string;
  timezone: string;
  currentDateIso: string;
  brandBrain: BrandBrainContent;
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
  entitlementSnapshot: EntitlementSnapshot;
  budgetEnvelope: MissionBudgetEnvelope;
}

export interface ThirtyDayPlanRevisionInput {
  revisionReason: string;
  evidenceIds: readonly string[];
  proposedByDepartment: DepartmentKey;
  patch: Partial<Pick<ThirtyDayPlan, "messagingThemes" | "primaryObjective" | "secondaryObjectives">>;
}

export interface ContractSnapshotInput {
  allocationPolicy: AllocationPolicy;
  packageComposition: readonly PackageCompositionItem[];
  relevantEntitlements: Record<string, number>;
  planTier?: string;
  periodStartIso?: string;
  periodEndIso?: string;
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
