import type { ProfileName } from "@stratxcel/hermes-contract";
import type { MissionScopedContext } from "./types.ts";
import { PROFILE_POLICIES } from "./profiles.ts";

export class BudgetExceededError extends Error {
  constructor(missionId: string, budgetCents: number, spentCents: number) {
    super(`Mission ${missionId} spend (${spentCents}) would exceed its budget (${budgetCents})`);
    this.name = "BudgetExceededError";
  }
}

export class TokenCeilingExceededError extends Error {
  constructor(missionId: string, ceiling: number, estimated: number) {
    super(`Mission ${missionId} estimated token usage (${estimated}) exceeds its hard ceiling (${ceiling})`);
    this.name = "TokenCeilingExceededError";
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

const DEFAULT_MAX_ESTIMATED_INPUT_TOKENS = Number(process.env.HERMES_MAX_ESTIMATED_INPUT_TOKENS ?? 20000);
const DEFAULT_MAX_ESTIMATED_OUTPUT_TOKENS = Number(process.env.HERMES_MAX_ESTIMATED_OUTPUT_TOKENS ?? 8000);

/**
 * `orchestrator`/`research`/`seo` legitimately carry a larger context
 * (planning brief, long-context summarization); `crm`/`operations` run at
 * high volume and should stay small by construction. Profiles not listed
 * get the default ceiling — see docs/hermes/PROFILE_AND_TOOL_POLICY.md.
 */
const PROFILE_INPUT_TOKEN_CEILING_MULTIPLIER: Partial<Record<ProfileName, number>> = {
  orchestrator: 1.5,
  research: 1.5,
  seo: 1.5,
  crm: 0.5,
  operations: 0.5,
};

/** ~4 chars/token for English — a conservative heuristic to catch an oversized/misconstructed prompt before it's sent, not a tokenizer-accurate count. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function inputTokenCeilingForProfile(profile: ProfileName | null): number {
  const multiplier = profile ? (PROFILE_INPUT_TOKEN_CEILING_MULTIPLIER[profile] ?? 1) : 1;
  return Math.round(DEFAULT_MAX_ESTIMATED_INPUT_TOKENS * multiplier);
}

/**
 * Preflight check, run before submitMission(): estimates the token size of
 * everything about to be sent to Hermes (brief + serialized context
 * bundle) and refuses to submit if it exceeds a per-profile ceiling.
 *
 * Exists because of an observed incident where a "trivial" mission's
 * *input* context — not its output — ballooned to ~47k tokens
 * (47,397 input / 144 output / 47,541 total) for what should have been a
 * near-zero-cost run; see docs/hermes/RECONCILIATION.md. A mid-run output
 * tracker (OutputTokenTracker, below) would never have caught that failure
 * mode, since the cost is incurred the moment a run is submitted — this
 * check runs before that point, so an oversized context is refused, not
 * paid for.
 */
export function assertContextWithinTokenCeiling(
  missionId: string,
  brief: string,
  context: Record<string, unknown>,
  profile: ProfileName | null
): void {
  const estimated = estimateTokens(brief + JSON.stringify(context));
  const ceiling = inputTokenCeilingForProfile(profile);
  if (estimated > ceiling) {
    throw new TokenCeilingExceededError(missionId, ceiling, estimated);
  }
}

/**
 * Mid-stream tracker for a distinct failure mode from the preflight check
 * above: a run whose *output* runs away (e.g. a repetition loop) after
 * being legitimately submitted. Call `accumulate` for each
 * `message.delta`/`reasoning.available` textDelta as it streams;
 * `exceeded` reports true once cumulative estimated output tokens cross
 * the ceiling. This class only tracks and reports — the caller (the
 * mission worker) is responsible for actually calling stopRun() once
 * `exceeded` is true.
 */
export class OutputTokenTracker {
  private estimatedTokens = 0;
  private readonly ceiling: number;

  constructor(ceiling: number = DEFAULT_MAX_ESTIMATED_OUTPUT_TOKENS) {
    this.ceiling = ceiling;
  }

  accumulate(textDelta: string): void {
    this.estimatedTokens += estimateTokens(textDelta);
  }

  get exceeded(): boolean {
    return this.estimatedTokens > this.ceiling;
  }

  get estimated(): number {
    return this.estimatedTokens;
  }
}
