import type { DepartmentKey } from "../departments/types.ts";
import type { MissionBudgetEnvelope } from "../budgets/hierarchy.ts";
import type {
  BusinessGrowthEntitlementSnapshot,
  PlanStatus,
  StageState,
  WorkforceStage,
} from "../planning/types.ts";

export type PaymentState = "current" | "failed" | "past_due" | "paused" | "cancelled";

export type LifecyclePhase =
  | "onboarding"
  | "active"
  | "renewal"
  | "at_risk"
  | "offboarding"
  | "churned";

export type ReadinessDimension =
  | "business_context"
  | "brand_brain"
  | "website"
  | "social"
  | "analytics"
  | "crm"
  | "whatsapp"
  | "ads"
  | "billing"
  | "permissions";

export type ReadinessStatus = "READY" | "MISSING" | "NOT_REQUIRED" | "DEGRADED";

export interface IntegrationFlags {
  social?: boolean;
  website?: boolean;
  analytics?: boolean;
  crm?: boolean;
  whatsapp?: boolean;
  ads?: boolean;
}

export interface OpsStageRecord {
  stageId: string;
  department: DepartmentKey | string;
  state: StageState;
  blockedCapability?: string | null;
  attempts: number;
  maxAttempts: number;
  lastError?: string | null;
  updatedAtIso?: string | null;
}

export interface OpsMissionRecord {
  tenantId: string;
  missionId: string;
  status: PlanStatus | string;
  stages: readonly OpsStageRecord[];
  approvalsWaiting: number;
  humanHandoffsOpen: number;
  workerHealthy: boolean;
  createdAtIso?: string | null;
  ageHours?: number | null;
  providerFailures?: number;
  integrationFailures?: number;
  deadLetter?: boolean;
}

export interface CompanyOpsContext {
  tenantId: string;
  entitlementSnapshot: BusinessGrowthEntitlementSnapshot;
  purchasedServices: readonly string[];
  brandBrainComplete: boolean;
  brandBrainBusinessName?: string | null;
  integrations: IntegrationFlags;
  permissionsGranted: boolean;
  paymentState: PaymentState;
  lifecyclePhase: LifecyclePhase;
  approvalsWaiting: number;
  unresolvedHandoffs: number;
  openCustomerQuestions: number;
  missions: readonly OpsMissionRecord[];
  planProgressPct?: number | null;
}

export interface TenantIsolationSlice {
  tenantId: string;
  brandBrainBusinessName: string;
  artifactIds: readonly string[];
  integrationKeys: readonly string[];
  leadIds: readonly string[];
  approvalIds: readonly string[];
  usageByMetric: Record<string, number>;
  reportIds: readonly string[];
  receiptIds: readonly string[];
}

export type CustomerNextActionKind =
  | "none"
  | "complete_brand_brain"
  | "connect_integration"
  | "approve_waiting"
  | "resolve_payment"
  | "answer_question"
  | "resolve_handoff"
  | "review_blocked_mission"
  | "renew_package"
  | "finish_onboarding";

export interface CustomerNextAction {
  kind: CustomerNextActionKind;
  title: string;
  detail: string;
  priority: number;
}

export type CsAlertCode =
  | "BRAND_BRAIN_INCOMPLETE"
  | "INSTAGRAM_DISCONNECTED"
  | "APPROVAL_WAITING"
  | "PACKAGE_NEARLY_EXHAUSTED"
  | "PAYMENT_RECOVERY_REQUIRED"
  | "MISSION_BLOCKED_CAPABILITY"
  | "HUMAN_HANDOFF_REQUIRED"
  | "CUSTOMER_QUESTION_OPEN"
  | "RENEWAL_SOON";

export interface CustomerSuccessAlert {
  code: CsAlertCode;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface ReadinessItem {
  dimension: ReadinessDimension;
  status: ReadinessStatus;
  required: boolean;
  detail: string;
}

export interface OnboardingReadiness {
  tenantId: string;
  purchasedServices: readonly string[];
  items: readonly ReadinessItem[];
  missingRequired: readonly string[];
  ready: boolean;
}

export interface RenewalReadiness {
  status: "READY" | "AT_RISK" | "NOT_APPLICABLE" | "ACTION_REQUIRED";
  reasons: readonly string[];
  recommendedAction: string | null;
}

export interface CustomerLifecycleIntelligence {
  tenantId: string;
  phase: LifecyclePhase;
  readiness: OnboardingReadiness;
  nextAction: CustomerNextAction;
  alerts: readonly CustomerSuccessAlert[];
  renewal: RenewalReadiness;
  blockedMissions: number;
  entitlementUsageSummary: string;
}

export type EntitlementHealth =
  | "ACTIVE"
  | "LOW_REMAINING"
  | "EXHAUSTED"
  | "PAUSED"
  | "EXPIRED"
  | "CONFIGURATION_REQUIRED";

export interface EntitlementHealthRecord {
  metric: string;
  health: EntitlementHealth;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  reason: string;
}

export type CostAmount =
  | { known: true; cents: number }
  | { known: false; cents: null; reason: string };

export interface DepartmentCostAllocation {
  department: string;
  budgetCents: number;
  stageCount: number;
}

export interface MissionCostVisibility {
  tenantId: string;
  missionId: string;
  estimated: CostAmount;
  reserved: CostAmount;
  actual: CostAmount;
  providerReported: CostAmount;
  departmentAllocation: readonly DepartmentCostAllocation[];
  specialistUsage: readonly { stageId: string; department: string; budgetCents: number }[];
}

export type ChargingAuthority = "NONE";

export interface FinanceSnapshot {
  tenantId: string;
  subscriptionId: string | null;
  planTier: string | null;
  paymentState: PaymentState;
  entitlementHealth: readonly EntitlementHealthRecord[];
  usage: Record<string, number>;
  remaining: Record<string, number>;
  reservedBudgetCents: number;
  providerReportedCost: CostAmount;
  planExhausted: boolean;
  overageEligibility: "NONE" | "REQUIRES_HUMAN";
  chargingAuthority: ChargingAuthority;
  canAutonomouslyCharge: false;
}

export interface FinanceChargeAttempt {
  charged: false;
  mutated: false;
  reason: string;
  chargingAuthority: ChargingAuthority;
}

export interface PaymentFailureSurface {
  paymentState: PaymentState;
  mutated: false;
  customerVisibleMutation: false;
  message: string;
}

export type OpsIssueKind =
  | "waiting_capability"
  | "waiting_approval"
  | "provider_failure"
  | "retry_exhausted"
  | "human_handoff"
  | "worker_unhealthy"
  | "integration_failure"
  | "dead_letter"
  | "sla_breach";

export interface OpsIssue {
  kind: OpsIssueKind;
  missionId: string;
  stageId?: string;
  detail: string;
  severity: "info" | "warning" | "critical";
}

export interface OperationsOversight {
  scope: "mission_execution";
  queue: readonly OpsMissionRecord[];
  blockedMissions: readonly OpsMissionRecord[];
  issues: readonly OpsIssue[];
  approvalsBacklog: number;
  humanHandoffsOpen: number;
  retryPressure: number;
  workerHealthOk: boolean;
}

export type EngineeringClassification =
  | "integration"
  | "platform"
  | "website"
  | "infrastructure"
  | "unknown";

export interface EngineeringDiagnosis {
  tenantId: string;
  missionId: string;
  classification: EngineeringClassification;
  summary: string;
  repairProposal: string;
  hostToolAccess: "DENIED";
  executionAuthority: "STRATXCEL_SERVICES_ONLY";
  allowedHermesTools: readonly string[];
}

export interface InfrastructureIncidentHandoff {
  tenantId: string;
  missionId: string;
  summary: string;
  hostToolAccess: "DENIED";
  executionAuthority: "STRATXCEL_SERVICES_ONLY";
  handoffTarget: "human_ops_infrastructure";
}

export interface CustomerViewContract {
  yourBusiness: string;
  currentPosition: string;
  yourCurrentPosition: string;
  whatsWorking: readonly string[];
  biggestGrowthOpportunities: readonly string[];
  thirtyDayPlan: string;
  thirtyDayPlanSummary: string;
  thisWeek: string;
  thisWeekFocus: string;
  workInProgress: readonly string[];
  needsYou: readonly string[];
  whatNeedsYou: readonly string[];
  results: readonly string[];
  nextRecommendation: string | null;
}

export interface AdminViewContract {
  tenantId: string;
  missionId: string;
  departments: readonly { key: string; stageCount: number; latencyMs: number | null }[];
  stages: readonly {
    stageId: string;
    department: string;
    state: StageState | string;
    attempts: number;
  }[];
  latencyMs: number | null;
  cost: CostAmount;
  retries: number;
  providers: readonly { name: string; status: string }[];
  handoffs: number;
  qualityFailures: number;
  capabilityBlockers: readonly string[];
  credentialsIncluded: false;
}

export type OffboardingTrigger =
  | "subscription_ending"
  | "customer_leaving"
  | "automation_pause"
  | "data_export_request"
  | "data_deletion_request";

export interface OffboardingStep {
  id: string;
  label: string;
  status: "PENDING" | "READY" | "HANDED_OFF" | "COMPLETED";
  destructive: boolean;
  detail: string;
}

export interface OffboardingWorkflow {
  tenantId: string;
  trigger: OffboardingTrigger;
  steps: readonly OffboardingStep[];
  automationPaused: boolean;
  scheduledExternalActionsStopped: boolean;
  deletionAuthority: "HUMAN_HANDOFF_ONLY";
}

export type ReconstructionPhase =
  | "ceo_plan"
  | "department"
  | "specialist_run"
  | "artifact"
  | "review"
  | "approval"
  | "execution"
  | "receipt"
  | "result";

export interface MissionReconstruction {
  missionId: string;
  tenantId: string;
  timeline: readonly {
    phase: ReconstructionPhase;
    atIso: string;
    summary: string;
    eventName?: string;
  }[];
  secretsPresent: false;
  complete: boolean;
  missingPhases: readonly ReconstructionPhase[];
}

export type { MissionBudgetEnvelope, WorkforceStage };
