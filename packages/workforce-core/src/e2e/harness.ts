import { planBusinessGrowth } from "../planning/thirty-day-planner.ts";
import type { BusinessGrowthPlan } from "../planning/types.ts";
import {
  createCollectingWorkforceEventEmitter,
  type WorkforceEvent,
} from "../events/emit.ts";
import { createMutationMockBus, type MutationMockBus } from "./mocks.ts";
import { basePlannerInput } from "./fixtures.ts";

export interface E2EScenarioResult {
  name: string;
  plan: BusinessGrowthPlan;
  events: WorkforceEvent[];
  mocks: MutationMockBus;
  assertions: readonly string[];
  passed: boolean;
  details: Record<string, unknown>;
}

export interface E2EHarness {
  mocks: MutationMockBus;
  emitter: ReturnType<typeof createCollectingWorkforceEventEmitter>;
  emitPlanLifecycle(plan: BusinessGrowthPlan, extras?: {
    approvals?: boolean;
    execution?: boolean;
    receipt?: boolean;
    result?: boolean;
  }): void;
  runPlanner: typeof planBusinessGrowth;
}

export function createE2EHarness(): E2EHarness {
  const mocks = createMutationMockBus();
  const emitter = createCollectingWorkforceEventEmitter();

  return {
    mocks,
    emitter,
    runPlanner: planBusinessGrowth,
    emitPlanLifecycle(plan, extras = {}) {
      const base = {
        tenantId: plan.tenantId,
        missionId: plan.missionId,
        planId: plan.id,
      };
      const now = () => new Date().toISOString();
      emitter.emit({
        name: "workforce.plan.created",
        atIso: now(),
        payload: { ...base, data: { objective: plan.primaryObjective } },
      });
      emitter.emit({
        name: "workforce.plan.validated",
        atIso: now(),
        payload: { ...base },
      });
      for (const stage of plan.workforcePlan.departmentStages) {
        emitter.emit({
          name: "workforce.stage.ready",
          atIso: now(),
          payload: {
            ...base,
            stageId: stage.stageId,
            department: stage.department,
            role: stage.specialistRole,
          },
        });
        if (stage.state === "WAITING_CAPABILITY") {
          emitter.emit({
            name: "workforce.capability.blocked",
            atIso: now(),
            payload: {
              ...base,
              stageId: stage.stageId,
              department: stage.department,
              data: { capability: stage.blockedCapability },
            },
          });
          continue;
        }
        emitter.emit({
          name: "workforce.stage.started",
          atIso: now(),
          payload: {
            ...base,
            stageId: stage.stageId,
            department: stage.department,
            role: stage.specialistRole,
          },
        });
        emitter.emit({
          name: "workforce.stage.completed",
          atIso: now(),
          payload: {
            ...base,
            stageId: stage.stageId,
            department: stage.department,
            data: { outputKind: stage.outputKind },
          },
        });
      }
      emitter.emit({
        name: "workforce.review.completed",
        atIso: now(),
        payload: { ...base, data: { gate: "final" } },
      });
      if (extras.approvals) {
        emitter.emit({
          name: "workforce.handoff.created",
          atIso: now(),
          payload: { ...base, data: { kind: "approval" } },
        });
      }
      if (extras.execution) {
        emitter.emit({
          name: "workforce.stage.completed",
          atIso: now(),
          payload: { ...base, stageId: "execution", department: "operations", data: { phase: "execution" } },
        });
      }
      if (extras.receipt) {
        emitter.emit({
          name: "workforce.stage.completed",
          atIso: now(),
          payload: { ...base, stageId: "receipt", data: { phase: "receipt" } },
        });
      }
      if (extras.result) {
        emitter.emit({
          name: "workforce.plan.validated",
          atIso: now(),
          payload: { ...base, data: { phase: "result", status: plan.workforcePlan.status } },
        });
      }
    },
  };
}

export { basePlannerInput, planBusinessGrowth };
