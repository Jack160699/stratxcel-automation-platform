import {
  CANONICAL_GROWTH_CADENCE_DAYS,
  CANONICAL_GROWTH_CADENCE_HOURS,
  PLAN_DEPTH_CONFIG,
  type GrowthCycleEligibility,
  type PlanDepthLimits,
  type GrowthCycleCostTracker,
} from "./types.ts";

export function getPlanDepthLimits(planTier: string): PlanDepthLimits {
  const tier = (planTier || "starter").toLowerCase();
  return PLAN_DEPTH_CONFIG[tier] || PLAN_DEPTH_CONFIG.starter;
}

/**
 * Evaluates whether a tenant/project is due for its canonical 3-day Growth Engine cycle.
 * Strictly enforces that the expensive cycle does NOT run prematurely.
 */
export function evaluateGrowthCycleEligibility(input: {
  tenantId: string;
  projectId: string;
  planTier: string;
  lastCompletedRunAt?: string | null;
  currentTime?: Date;
}): GrowthCycleEligibility {
  const now = input.currentTime || new Date();
  const lastRunTime = input.lastCompletedRunAt ? new Date(input.lastCompletedRunAt) : null;

  // Window identifier for idempotency (e.g. "2026-08-20")
  const windowStr = now.toISOString().slice(0, 10);
  const cycleKey = `${input.tenantId}-${input.projectId}-${windowStr}`;

  if (!lastRunTime || isNaN(lastRunTime.getTime())) {
    // First run is immediately due
    const nextRun = new Date(now.getTime() + CANONICAL_GROWTH_CADENCE_DAYS * 24 * 3600 * 1000);
    return {
      isEligible: true,
      status: "DUE",
      lastRunAt: null,
      nextRunAt: nextRun.toISOString(),
      daysSinceLastRun: 999,
      reason: "Initial canonical 3-day growth cycle is due.",
      cycleKey,
    };
  }

  const elapsedMs = now.getTime() - lastRunTime.getTime();
  const daysSinceLastRun = Number((elapsedMs / (1000 * 60 * 60 * 24)).toFixed(2));
  const nextRunTime = new Date(lastRunTime.getTime() + CANONICAL_GROWTH_CADENCE_DAYS * 24 * 3600 * 1000);

  if (daysSinceLastRun >= CANONICAL_GROWTH_CADENCE_DAYS) {
    return {
      isEligible: true,
      status: "DUE",
      lastRunAt: lastRunTime.toISOString(),
      nextRunAt: nextRunTime.toISOString(),
      daysSinceLastRun,
      reason: `Canonical 3-day growth cycle is due (${daysSinceLastRun} days since last run).`,
      cycleKey,
    };
  }

  return {
    isEligible: false,
    status: "NOT_DUE",
    lastRunAt: lastRunTime.toISOString(),
    nextRunAt: nextRunTime.toISOString(),
    daysSinceLastRun,
    reason: `Growth cycle not due (${daysSinceLastRun} / ${CANONICAL_GROWTH_CADENCE_DAYS} days elapsed). Skipping expensive crawler, LLM, and SERP calls.`,
    cycleKey,
  };
}

/**
 * Validates whether an immediate event (e.g. payment, revocation, failure rollback)
 * should trigger a full growth cycle or remain a lightweight immediate operation.
 */
export function isImmediateEventRequiringFullGrowthCycle(eventKind: string): boolean {
  // Immediate events do NOT trigger an expensive 3-day Growth Cycle
  const lightweightEvents = [
    "PAYMENT_SUCCESS",
    "SUBSCRIPTION_CANCELLED",
    "SUBSCRIPTION_EXPIRED",
    "CONNECTOR_EXPIRED",
    "EXECUTION_FAILED",
    "VERIFICATION_FAILED_ROLLBACK",
    "USER_REQUESTED_ACTION",
  ];

  return !lightweightEvents.includes(eventKind);
}

export class GrowthEngineCadenceManager {
  getCadenceConfig(): import("./types.ts").CadenceConfig {
    return {
      cadenceDays: CANONICAL_GROWTH_CADENCE_DAYS,
      targetMonthlyCycles: 10,
      cadenceHours: CANONICAL_GROWTH_CADENCE_HOURS,
    };
  }

  async evaluateCadenceTrigger(
    state: import("./types.ts").GrowthEngineState,
    handlers: {
      crawler?: () => Promise<any> | any;
      serp?: () => Promise<any> | any;
      ai?: () => Promise<any> | any;
    } = {}
  ): Promise<{
    status: "NOT_DUE" | "CYCLE_EXECUTED";
    hoursRemaining?: number;
    updatedState?: import("./types.ts").GrowthEngineState;
  }> {
    const lastRun = state.lastRunAt ? new Date(state.lastRunAt).getTime() : 0;
    const now = Date.now();
    const elapsedHours = (now - lastRun) / (1000 * 60 * 60);

    if (elapsedHours < CANONICAL_GROWTH_CADENCE_HOURS) {
      return {
        status: "NOT_DUE",
        hoursRemaining: CANONICAL_GROWTH_CADENCE_HOURS - elapsedHours,
      };
    }

    if (handlers.crawler) await handlers.crawler();
    if (handlers.serp) await handlers.serp();
    if (handlers.ai) await handlers.ai();

    return {
      status: "CYCLE_EXECUTED",
      updatedState: {
        ...state,
        lastRunAt: new Date(now).toISOString(),
        cycleCountThisMonth: (state.cycleCountThisMonth || 0) + 1,
      },
    };
  }

  async executeImmediateEvent<T = any>(
    workspaceId: string,
    eventType: string,
    handler: (workspaceId: string, eventType: string) => Promise<T> | T
  ): Promise<{
    success: boolean;
    triggered3DayGrowthLoop: boolean;
    result?: T;
  }> {
    const res = await handler(workspaceId, eventType);
    return {
      success: true,
      triggered3DayGrowthLoop: false,
      result: res,
    };
  }
}

