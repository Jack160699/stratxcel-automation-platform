import type { MissionScopedContext } from "./types.ts";

export class BudgetExceededError extends Error {
  constructor(missionId: string, budgetCents: number, spentCents: number) {
    super(`Mission ${missionId} spend (${spentCents}) would exceed its budget (${budgetCents})`);
    this.name = "BudgetExceededError";
  }
}

/**
 * The budget ceiling itself is already enforced at reservation time
 * (@stratxcel/missions' createAndEstimateMission reserves exactly
 * estimated_cost_cents from the wallet before a mission can run — see
 * packages/missions/src/repository.ts). This function is the hook for
 * per-tool-call spend tracking *within* that reserved ceiling (e.g. a
 * mission that calls create_draft_artifact five times, each costing
 * something, must stop before the fifth call if that would exceed the
 * reservation) — real per-tool cost metering doesn't exist yet (no
 * per-tool pricing model has been defined), so this only validates against
 * the ceiling for now and is a named extension point, not a stub pretending
 * to meter something it doesn't.
 */
export function assertWithinBudget(context: MissionScopedContext, spentCentsSoFar: number, nextCallCostCents: number): void {
  if (spentCentsSoFar + nextCallCostCents > context.budgetCents) {
    throw new BudgetExceededError(context.missionId, context.budgetCents, spentCentsSoFar + nextCallCostCents);
  }
}
