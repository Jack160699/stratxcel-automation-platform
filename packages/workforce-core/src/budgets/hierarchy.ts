export interface MissionBudgetEnvelope {
  estimatedCents: number | null;
  reservedCents: number;
  actualCents: number | null;
}

export class BudgetEscalationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetEscalationError";
  }
}

export function createMissionBudget(estimatedCents: number): MissionBudgetEnvelope {
  return { estimatedCents, reservedCents: 0, actualCents: null };
}

export function remainingBudget(budget: MissionBudgetEnvelope): number {
  const estimated = budget.estimatedCents ?? 0;
  const actual = budget.actualCents ?? 0;
  return estimated - actual;
}

export function allocateChildBudget(
  parent: MissionBudgetEnvelope,
  childBudgetCents: number,
  alreadyReservedCents: number,
): MissionBudgetEnvelope {
  if (parent.estimatedCents === null) {
    throw new BudgetEscalationError("parent_budget_not_estimated");
  }
  const remaining = parent.estimatedCents - (parent.actualCents ?? 0) - alreadyReservedCents;
  if (childBudgetCents > remaining) {
    throw new BudgetEscalationError("child_budget_exceeds_parent_remaining");
  }
  return {
    ...parent,
    reservedCents: parent.reservedCents + childBudgetCents,
  };
}

export function assertChildBudgetWithinParent(
  parentRemainingCents: number,
  childBudgetCents: number,
): void {
  if (childBudgetCents > parentRemainingCents) {
    throw new BudgetEscalationError("child_budget_exceeds_parent_remaining");
  }
}

export function assertBudgetNarrowing(
  parentRemainingCents: number,
  childBudgetCents: number,
): void {
  assertChildBudgetWithinParent(parentRemainingCents, childBudgetCents);
}
