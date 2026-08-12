import type { AIBudgetEnvelope, AIBudgetStatus, AIRoutingCandidate, PlanTier } from "../types.ts";
import { DEFAULT_MONTHLY_BUDGET_USD, resolveMonthlyBudgetUsd } from "../policy/task-policies.ts";

export function computeBudgetStatus(envelope: AIBudgetEnvelope): AIBudgetStatus {
  if (!envelope.monthlyBudgetUsd || envelope.monthlyBudgetUsd <= 0) return "unknown";
  const ratio = envelope.spentUsdThisMonth / envelope.monthlyBudgetUsd;
  if (ratio >= 1) return "exhausted_100";
  if (ratio >= 0.85) return "warning_85";
  if (ratio >= 0.7) return "soft_70";
  return "ok";
}

export function createBudgetEnvelope(args: {
  plan: PlanTier;
  spentUsdThisMonth: number;
  monthlyBudgetUsd?: number | null;
  reservedCriticalUsd?: number;
  allowEmergencyMargin?: boolean;
  ownerApprovedOverage?: boolean;
  env?: NodeJS.ProcessEnv;
}): AIBudgetEnvelope {
  const resolved =
    args.monthlyBudgetUsd ??
    (args.plan === "custom" ? null : resolveMonthlyBudgetUsd(args.plan, args.env ?? process.env));
  if (resolved == null) {
    throw new Error("custom_plan_requires_explicit_budget");
  }
  return {
    plan: args.plan,
    monthlyBudgetUsd: resolved,
    spentUsdThisMonth: args.spentUsdThisMonth,
    reservedCriticalUsd: args.reservedCriticalUsd,
    allowEmergencyMargin: args.allowEmergencyMargin,
    ownerApprovedOverage: args.ownerApprovedOverage,
  };
}

export interface BudgetGateDecision {
  status: AIBudgetStatus;
  allowExecution: boolean;
  preferCheaper: boolean;
  allowPremiumEscalation: boolean;
  allowDiscretionaryPremium: boolean;
  reason: string;
}

/**
 * Internal COGS guards — not customer token balances.
 * At 100%: only reserved critical / emergency margin / owner-approved overage.
 */
export function evaluateBudgetGate(
  envelope: AIBudgetEnvelope,
  opts?: { isCriticalWorkflow?: boolean; isDiscretionaryPremium?: boolean },
): BudgetGateDecision {
  const status = computeBudgetStatus(envelope);
  if (status === "ok" || status === "unknown") {
    return {
      status,
      allowExecution: true,
      preferCheaper: false,
      allowPremiumEscalation: true,
      allowDiscretionaryPremium: true,
      reason: "within_budget",
    };
  }
  if (status === "soft_70") {
    return {
      status,
      allowExecution: true,
      preferCheaper: true,
      allowPremiumEscalation: true,
      allowDiscretionaryPremium: true,
      reason: "soft_threshold_prefer_cheap",
    };
  }
  if (status === "warning_85") {
    return {
      status,
      allowExecution: true,
      preferCheaper: true,
      allowPremiumEscalation: !opts?.isDiscretionaryPremium,
      allowDiscretionaryPremium: false,
      reason: "warning_threshold_block_discretionary_premium",
    };
  }

  // exhausted_100
  if (envelope.ownerApprovedOverage) {
    return {
      status,
      allowExecution: true,
      preferCheaper: true,
      allowPremiumEscalation: false,
      allowDiscretionaryPremium: false,
      reason: "owner_approved_overage",
    };
  }
  if (opts?.isCriticalWorkflow && (envelope.reservedCriticalUsd ?? 0) > 0) {
    return {
      status,
      allowExecution: true,
      preferCheaper: true,
      allowPremiumEscalation: false,
      allowDiscretionaryPremium: false,
      reason: "reserved_critical_workflow",
    };
  }
  if (envelope.allowEmergencyMargin) {
    return {
      status,
      allowExecution: true,
      preferCheaper: true,
      allowPremiumEscalation: false,
      allowDiscretionaryPremium: false,
      reason: "emergency_margin",
    };
  }
  return {
    status,
    allowExecution: false,
    preferCheaper: true,
    allowPremiumEscalation: false,
    allowDiscretionaryPremium: false,
    reason: "budget_exhausted",
  };
}

export function filterCandidatesForBudget(
  candidates: readonly AIRoutingCandidate[],
  gate: BudgetGateDecision,
): AIRoutingCandidate[] {
  let list = [...candidates];
  if (gate.preferCheaper) {
    // Prefer primary/fallback over escalation/frontier when soft/warning.
    const cheapFirst = list.filter((c) => c.role === "primary" || c.role === "fallback");
    if (cheapFirst.length) list = cheapFirst.concat(list.filter((c) => !cheapFirst.includes(c)));
  }
  if (!gate.allowPremiumEscalation || !gate.allowDiscretionaryPremium) {
    list = list.filter((c) => c.role !== "frontier" && !(c.role === "escalation" && !gate.allowPremiumEscalation));
  }
  return list;
}

export function defaultBudgetForPlan(plan: Exclude<PlanTier, "custom">): number {
  return DEFAULT_MONTHLY_BUDGET_USD[plan];
}
