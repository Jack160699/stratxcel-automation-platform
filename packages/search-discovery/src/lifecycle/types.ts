/**
 * Production Customer Lifecycle & Go-Live Hardening Types
 */

export type CustomerLifecycleStage =
  | "ONBOARDING"
  | "CONNECTORS_ATTACHED"
  | "FREE_AUDIT_READY"
  | "DIAGNOSIS_REVIEW"
  | "PAID_ACTIVATION"
  | "AUTONOMOUS_RUNNING"
  | "OBSERVING_OUTCOMES"
  | "SUBSCRIPTION_REVOKED"
  | "SAFE_STOP";

export type GoLiveHealthCategory =
  | "DATABASE"
  | "AUTH"
  | "RLS"
  | "AI"
  | "AUDIT"
  | "CONNECTORS"
  | "BILLING"
  | "ENTITLEMENTS"
  | "SEARCH"
  | "EXECUTION"
  | "SCHEDULER"
  | "WORKERS"
  | "NOTIFICATIONS"
  | "OBSERVABILITY";

export type HealthStatusLevel = "PASS" | "WARN" | "FAIL";

export interface GoLiveHealthCategoryResult {
  category: GoLiveHealthCategory;
  status: HealthStatusLevel;
  details: string;
  remediation?: string;
}

export interface GoLiveSystemHealthReport {
  generatedAt: string;
  overallStatus: "READY_FOR_CUSTOMERS" | "CONFIGURATION_REQUIRED" | "BLOCKED";
  passedCount: number;
  warnCount: number;
  failCount: number;
  categories: GoLiveHealthCategoryResult[];
  criticalBlockers: string[];
  deploymentRequirements: string[];
}

export interface RevocationStateCheck {
  tenantId: string;
  subscriptionStatus: "active" | "cancelled" | "expired" | "past_due" | "unpaid";
  planTier: string;
  canExecuteAutonomousActions: boolean;
  canReadHistoricalData: boolean;
  canScheduleGrowthLoop: boolean;
  activeBlockerReason?: string;
}

export interface CustomerLifecycleState {
  workspaceId: string;
  currentStage: string;
  allStagesCompleted?: boolean;
  hasManualStaffIntervention?: boolean;
}

export interface CustomerLifecycleStageInfo {
  stageNumber: number;
  stageName: string;
  mode: "AUTOMATIC" | "SELF_SERVE";
  description: string;
}

export interface CustomerLifecycleReport {
  workspaceId: string;
  currentStage: string;
  zeroStaffVerified: boolean;
  stages: CustomerLifecycleStageInfo[];
}

