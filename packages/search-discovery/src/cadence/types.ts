/**
 * Canonical 3-Day Growth Cadence & Cost Control Types
 */

export const CANONICAL_GROWTH_CADENCE_DAYS = 3;
export const CANONICAL_GROWTH_CADENCE_HOURS = 72;

export type GrowthCycleStatus =
  | "NOT_DUE"
  | "DUE"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED_BUDGET"
  | "SKIPPED_NO_DATA"
  | "SKIPPED_NO_CHANGE";

export interface GrowthCycleEligibility {
  isEligible: boolean;
  status: GrowthCycleStatus;
  lastRunAt: string | null;
  nextRunAt: string;
  daysSinceLastRun: number;
  reason: string;
  cycleKey: string;
}

export interface PlanDepthLimits {
  planTier: "starter" | "growth" | "business" | "scale";
  cadenceDays: 3; // Fixed 3-day cadence across all tiers
  maxPagesMonitored: number;
  maxQueriesMonitored: number;
  maxCompetitorsMonitored: number;
  maxAISearchProbes: number;
  maxActionsPerCycle: number;
  monthlyCycleTarget: 10; // ~10 cycles per 30 days
}

export const PLAN_DEPTH_CONFIG: Record<string, PlanDepthLimits> = {
  starter: {
    planTier: "starter",
    cadenceDays: 3,
    maxPagesMonitored: 15,
    maxQueriesMonitored: 20,
    maxCompetitorsMonitored: 2,
    maxAISearchProbes: 2,
    maxActionsPerCycle: 2,
    monthlyCycleTarget: 10,
  },
  growth: {
    planTier: "growth",
    cadenceDays: 3,
    maxPagesMonitored: 50,
    maxQueriesMonitored: 60,
    maxCompetitorsMonitored: 4,
    maxAISearchProbes: 6,
    maxActionsPerCycle: 5,
    monthlyCycleTarget: 10,
  },
  business: {
    planTier: "business",
    cadenceDays: 3,
    maxPagesMonitored: 200,
    maxQueriesMonitored: 250,
    maxCompetitorsMonitored: 8,
    maxAISearchProbes: 15,
    maxActionsPerCycle: 12,
    monthlyCycleTarget: 10,
  },
  scale: {
    planTier: "scale",
    cadenceDays: 3,
    maxPagesMonitored: 500,
    maxQueriesMonitored: 600,
    maxCompetitorsMonitored: 15,
    maxAISearchProbes: 30,
    maxActionsPerCycle: 25,
    monthlyCycleTarget: 10,
  },
};

export interface GrowthCycleCostTracker {
  crawlerRequestsCount: number;
  aiCallsCount: number;
  serpCallsCount: number;
  actionsExecutedCount: number;
  budgetExhausted: boolean;
  stopReason?: "BUDGET_LIMIT_REACHED" | "PLAN_LIMIT_REACHED";
}

export interface GrowthEngineState {
  workspaceId: string;
  lastRunAt: string;
  cycleCountThisMonth: number;
  status: "IDLE" | "RUNNING" | "COMPLETED" | "ERROR";
}

export interface CadenceConfig {
  cadenceDays: number;
  targetMonthlyCycles: number;
  cadenceHours: number;
}

