import type { MissionBudgetEnvelope } from "../../budgets/hierarchy.ts";
import type { WorkforceStage } from "../../planning/types.ts";
import type {
  CostAmount,
  DepartmentCostAllocation,
  MissionCostVisibility,
} from "../types.ts";

function knownCents(cents: number | null | undefined, reason: string): CostAmount {
  if (cents == null || !Number.isFinite(cents)) {
    return { known: false, cents: null, reason };
  }
  return { known: true, cents };
}

/**
 * Cost visibility — unknown stays unknown (never invent provider costs).
 */
export function buildMissionCostVisibility(input: {
  tenantId: string;
  missionId: string;
  budget: MissionBudgetEnvelope;
  stages?: readonly WorkforceStage[] | readonly { stageId: string; department: string; budgetCents: number }[];
  providerReportedCents?: number | null;
}): MissionCostVisibility {
  const stages = input.stages ?? [];
  const byDept = new Map<string, DepartmentCostAllocation>();
  const specialistUsage: MissionCostVisibility["specialistUsage"][number][] = [];

  for (const stage of stages) {
    const budgetCents = "budgetCents" in stage ? stage.budgetCents : 0;
    const department = String(stage.department);
    const prev = byDept.get(department);
    if (prev) {
      prev.budgetCents += budgetCents;
      prev.stageCount += 1;
    } else {
      byDept.set(department, { department, budgetCents, stageCount: 1 });
    }
    specialistUsage.push({
      stageId: stage.stageId,
      department,
      budgetCents,
    });
  }

  return {
    tenantId: input.tenantId,
    missionId: input.missionId,
    estimated: knownCents(input.budget.estimatedCents, "estimate_unavailable"),
    reserved: knownCents(input.budget.reservedCents, "reserved_unavailable"),
    actual: knownCents(input.budget.actualCents, "actual_unavailable"),
    providerReported: knownCents(input.providerReportedCents, "provider_not_reported"),
    departmentAllocation: [...byDept.values()],
    specialistUsage,
  };
}
