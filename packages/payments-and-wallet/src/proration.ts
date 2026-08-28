import { getPlanDefinition, type PlanTier } from "./plans.ts";
import { splitGstInclusive, type GstBreakdown } from "../../../lib/payments/gst.ts";

export interface ProrationInput {
  currentPlanTier: PlanTier;
  targetPlanTier: PlanTier;
  periodStartIso: string;
  periodEndIso: string;
  effectiveIso?: string;
  alreadyPaidCents?: number;
  customTargetPriceCents?: number;
}

export interface ProrationResult {
  currentPlanTier: PlanTier;
  targetPlanTier: PlanTier;
  isUpgrade: boolean;
  isDowngrade: boolean;
  isSamePlan: boolean;
  totalDurationSeconds: number;
  remainingDurationSeconds: number;
  fractionRemaining: number;
  alreadyPaidCents: number;
  targetCatalogPriceCents: number;
  unusedCurrentPlanCreditCents: number;
  proratedTargetChargeCents: number;
  netPayableCents: number;
  unusedCreditCarriedOverCents: number;
  priceBreakdown: GstBreakdown;
  periodStartIso: string;
  periodEndIso: string;
  effectiveIso: string;
}

/**
 * Production-grade, deterministic proration calculator.
 * - Computes second-accurate duration fractions based on actual billing cycle length.
 * - Accurately accounts for 28/29-day Feb (including leap years), 30/31-day months.
 * - Rounds financial quantities strictly to paise (cents).
 * - Generates GST-inclusive breakdown (CGST/SGST 9%+9% or IGST 18%).
 * - Handles upgrade debit, downgrade credit, same-plan guards, and cycle boundary limits.
 */
export function calculateProration(input: ProrationInput): ProrationResult {
  const currentPlan = getPlanDefinition(input.currentPlanTier);
  const targetPlan = getPlanDefinition(input.targetPlanTier);

  const startMs = new Date(input.periodStartIso).getTime();
  const endMs = new Date(input.periodEndIso).getTime();
  const effectiveMs = input.effectiveIso ? new Date(input.effectiveIso).getTime() : Date.now();

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    throw new Error("Invalid billing period dates provided for proration.");
  }

  if (endMs <= startMs) {
    throw new Error("Billing period end date must be strictly after period start date.");
  }

  const totalDurationSeconds = Math.max(1, Math.floor((endMs - startMs) / 1000));
  const clampedEffectiveMs = Math.min(Math.max(effectiveMs, startMs), endMs);
  const remainingDurationSeconds = Math.max(0, Math.floor((endMs - clampedEffectiveMs) / 1000));

  const fractionRemaining = remainingDurationSeconds / totalDurationSeconds;

  const currentPriceCents = input.alreadyPaidCents ?? (currentPlan?.priceCents ?? 0);
  const targetPriceCents = input.customTargetPriceCents ?? (targetPlan?.priceCents ?? 0);

  const isSamePlan = input.currentPlanTier === input.targetPlanTier;
  const isUpgrade = !isSamePlan && targetPriceCents > currentPriceCents;
  const isDowngrade = !isSamePlan && targetPriceCents < currentPriceCents;

  const zeroBreakdown: GstBreakdown = {
    totalCents: 0,
    taxableValueCents: 0,
    gstCents: 0,
    ratePercent: 18,
  };

  if (isSamePlan || remainingDurationSeconds === 0) {
    return {
      currentPlanTier: input.currentPlanTier,
      targetPlanTier: input.targetPlanTier,
      isUpgrade: false,
      isDowngrade: false,
      isSamePlan,
      totalDurationSeconds,
      remainingDurationSeconds,
      fractionRemaining: isSamePlan ? 0 : fractionRemaining,
      alreadyPaidCents: currentPriceCents,
      targetCatalogPriceCents: targetPriceCents,
      unusedCurrentPlanCreditCents: 0,
      proratedTargetChargeCents: 0,
      netPayableCents: 0,
      unusedCreditCarriedOverCents: 0,
      priceBreakdown: zeroBreakdown,
      periodStartIso: input.periodStartIso,
      periodEndIso: input.periodEndIso,
      effectiveIso: new Date(clampedEffectiveMs).toISOString(),
    };
  }

  // Exact paise-level financial rounding
  const unusedCurrentPlanCreditCents = Math.round(currentPriceCents * fractionRemaining);
  const proratedTargetChargeCents = Math.round(targetPriceCents * fractionRemaining);

  const rawDifference = proratedTargetChargeCents - unusedCurrentPlanCreditCents;
  const netPayableCents = Math.max(0, rawDifference);
  const unusedCreditCarriedOverCents = rawDifference < 0 ? Math.abs(rawDifference) : 0;

  return {
    currentPlanTier: input.currentPlanTier,
    targetPlanTier: input.targetPlanTier,
    isUpgrade,
    isDowngrade,
    isSamePlan: false,
    totalDurationSeconds,
    remainingDurationSeconds,
    fractionRemaining,
    alreadyPaidCents: currentPriceCents,
    targetCatalogPriceCents: targetPriceCents,
    unusedCurrentPlanCreditCents,
    proratedTargetChargeCents,
    netPayableCents,
    unusedCreditCarriedOverCents,
    priceBreakdown: netPayableCents > 0 ? splitGstInclusive(netPayableCents) : zeroBreakdown,
    periodStartIso: input.periodStartIso,
    periodEndIso: input.periodEndIso,
    effectiveIso: new Date(clampedEffectiveMs).toISOString(),
  };
}
