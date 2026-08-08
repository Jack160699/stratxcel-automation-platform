export type CutoverReadiness = "NOT_READY" | "SHADOWING" | "READY_FOR_REVIEW";

export interface CutoverReadinessInput {
  bindingConfigured: boolean;
  migrationMode: "off" | "shadow" | "cutover";
  comparableEventCount: number;
  mismatchCount: number;
  workerHostAvailable: boolean;
  metaCredentialsConfigured: boolean;
}

export interface CutoverReadinessResult {
  readiness: CutoverReadiness;
  requirements: {
    bindingResolved: boolean;
    shadowActive: boolean;
    workerHostAvailable: boolean;
    metaCredentialsConfigured: boolean;
    comparableEventThresholdMet: boolean | "not_configured";
    mismatchRateThresholdMet: boolean | "not_configured";
  };
}

/**
 * Deliberately conservative: READY_FOR_REVIEW is unreachable unless an
 * owner has explicitly set BOTH threshold env vars — no arbitrary sample
 * count is invented here (per task brief section 18). Even at
 * READY_FOR_REVIEW, this is evidence for a human decision, never an
 * automatic cutover trigger; nothing in this codebase reads this value to
 * change behavior.
 */
export function computeCutoverReadiness(input: CutoverReadinessInput): CutoverReadinessResult {
  const minComparableRaw = process.env.WHATSAPP_CUTOVER_MIN_COMPARABLE_EVENTS;
  const maxMismatchRateRaw = process.env.WHATSAPP_CUTOVER_MAX_MISMATCH_RATE;
  const minComparable = minComparableRaw ? Number(minComparableRaw) : null;
  const maxMismatchRate = maxMismatchRateRaw ? Number(maxMismatchRateRaw) : null;

  const comparableEventThresholdMet: boolean | "not_configured" =
    minComparable === null || Number.isNaN(minComparable) ? "not_configured" : input.comparableEventCount >= minComparable;
  const mismatchRate = input.comparableEventCount > 0 ? input.mismatchCount / input.comparableEventCount : 0;
  const mismatchRateThresholdMet: boolean | "not_configured" =
    maxMismatchRate === null || Number.isNaN(maxMismatchRate) ? "not_configured" : mismatchRate <= maxMismatchRate;

  const requirements = {
    bindingResolved: input.bindingConfigured,
    shadowActive: input.migrationMode === "shadow",
    workerHostAvailable: input.workerHostAvailable,
    metaCredentialsConfigured: input.metaCredentialsConfigured,
    comparableEventThresholdMet,
    mismatchRateThresholdMet,
  };

  if (!input.bindingConfigured || input.migrationMode === "off") {
    return { readiness: "NOT_READY", requirements };
  }

  const allExplicitRequirementsMet =
    requirements.workerHostAvailable &&
    requirements.metaCredentialsConfigured &&
    comparableEventThresholdMet === true &&
    mismatchRateThresholdMet === true;

  return { readiness: allExplicitRequirementsMet ? "READY_FOR_REVIEW" : "SHADOWING", requirements };
}
