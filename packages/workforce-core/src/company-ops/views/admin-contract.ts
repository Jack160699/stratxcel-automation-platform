import type { WorkforcePlan } from "../../planning/types.ts";
import type { AdminViewContract, CostAmount, OpsMissionRecord } from "../types.ts";
import { buildMissionCostVisibility } from "../finance/cost-visibility.ts";

/**
 * Admin visibility contract — departments, stages, latency, cost, retries, etc.
 * Never includes credentials.
 */
export function buildAdminViewContract(input: {
  plan: WorkforcePlan;
  mission?: OpsMissionRecord;
  latencyMs?: number | null;
  providers?: readonly { name: string; status: string }[];
  qualityFailures?: number;
  providerReportedCents?: number | null;
}): AdminViewContract {
  const stages = input.plan.departmentStages.map((s) => {
    const live = input.mission?.stages.find((x) => x.stageId === s.stageId);
    return {
      stageId: s.stageId,
      department: s.department,
      state: live?.state ?? s.state,
      attempts: live?.attempts ?? 0,
    };
  });

  const deptMap = new Map<string, { key: typeof stages[0]["department"]; stageCount: number }>();
  for (const s of stages) {
    const prev = deptMap.get(s.department);
    if (prev) prev.stageCount += 1;
    else deptMap.set(s.department, { key: s.department, stageCount: 1 });
  }

  const costVis = buildMissionCostVisibility({
    tenantId: input.plan.tenantId,
    missionId: input.plan.missionId,
    budget: input.plan.budgetEnvelope,
    stages: input.plan.departmentStages,
    providerReportedCents: input.providerReportedCents,
  });

  const cost: CostAmount = costVis.estimated;
  const retries = stages.reduce((sum, s) => sum + Math.max(0, s.attempts - 1), 0);
  const capabilityBlockers = input.plan.departmentStages
    .filter((s) => s.state === "WAITING_CAPABILITY" || s.blockedCapability)
    .map((s) => s.blockedCapability ?? s.stageId);

  return {
    tenantId: input.plan.tenantId,
    missionId: input.plan.missionId,
    departments: [...deptMap.values()].map((d) => ({
      key: d.key,
      stageCount: d.stageCount,
      latencyMs: input.latencyMs ?? null,
    })),
    stages,
    latencyMs: input.latencyMs ?? null,
    cost,
    retries,
    providers: input.providers ?? [],
    handoffs: input.mission?.humanHandoffsOpen ?? 0,
    qualityFailures: input.qualityFailures ?? 0,
    capabilityBlockers,
    credentialsIncluded: false,
  };
}
