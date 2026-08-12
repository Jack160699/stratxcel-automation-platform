import type { AIRoutingPolicy } from "@stratxcel/ai-runtime";
import { estimateTokenCostUsd, getCostMetadata } from "@stratxcel/ai-runtime";

/** Expected normal Automatic Audit AI spend for a ₹999 Audit. */
export const AUDIT_EXPECTED_NORMAL_COST_USD = 0.45;

/** Hard ceiling for a single Audit generation run unless env overrides lower. */
export const AUDIT_DEFAULT_HARD_BUDGET_USD = 1.5;

/** Conservative upper-bound prompt+completion tokens used for pre-call estimates. */
const PRECALL_TOKEN_ENVELOPE = {
  RESEARCH: { inputTokens: 12_000, outputTokens: 4_000 },
  PREMIUM_AUDIT: { inputTokens: 18_000, outputTokens: 6_000 },
} as const;

export function resolveAuditBudgetLimitUsd(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.AUDIT_AI_HARD_BUDGET_USD ?? AUDIT_DEFAULT_HARD_BUDGET_USD);
  if (!Number.isFinite(configured)) return AUDIT_DEFAULT_HARD_BUDGET_USD;
  return Math.max(0.25, Math.min(5, configured));
}

export function estimateAuditProviderCallUpperBoundUsd(input: {
  provider: string;
  model: string;
  taskClass: "RESEARCH" | "PREMIUM_AUDIT";
}): number {
  const envelope = PRECALL_TOKEN_ENVELOPE[input.taskClass];
  const meta = getCostMetadata(input.model);
  if (!meta || meta.unit !== "token") {
    return input.taskClass === "RESEARCH" ? 0.35 : 0.55;
  }
  const estimated = estimateTokenCostUsd({
    model: input.model,
    inputTokens: envelope.inputTokens,
    outputTokens: envelope.outputTokens,
  });
  // Add a small tool/grounding cushion for research calls.
  const toolCushion = input.taskClass === "RESEARCH" ? 0.05 : 0;
  return Math.max(estimated + toolCushion, 0.01);
}

export function selectAffordableAuditCandidate(input: {
  policy: AIRoutingPolicy;
  remainingBudgetUsd: number;
  taskClass: "RESEARCH" | "PREMIUM_AUDIT";
}): { candidate: AIRoutingPolicy["candidates"][number]; estimatedUpperBoundUsd: number } | null {
  const ranked = [...input.policy.candidates].sort((a, b) => {
    const aCost = estimateAuditProviderCallUpperBoundUsd({
      provider: a.provider,
      model: a.model,
      taskClass: input.taskClass,
    });
    const bCost = estimateAuditProviderCallUpperBoundUsd({
      provider: b.provider,
      model: b.model,
      taskClass: input.taskClass,
    });
    return aCost - bCost;
  });

  for (const candidate of ranked) {
    const estimatedUpperBoundUsd = estimateAuditProviderCallUpperBoundUsd({
      provider: candidate.provider,
      model: candidate.model,
      taskClass: input.taskClass,
    });
    if (estimatedUpperBoundUsd <= input.remainingBudgetUsd) {
      return { candidate, estimatedUpperBoundUsd };
    }
  }
  return null;
}

export function remainingAuditBudgetUsd(budgetLimitUsd: number, spentUsd: number): number {
  return Math.max(0, Number(budgetLimitUsd) - Number(spentUsd));
}
