import type { PlanTier } from "../plans.ts";

/**
 * Server-controlled Razorpay plan IDs for recurring AutoPay.
 * Amounts stay in PLAN_DEFINITIONS — never accept client-supplied plan IDs or prices.
 */
export const RAZORPAY_RECURRING_PLAN_IDS = {
  starter: "plan_TO6KM4Y5ggnUtl",
  growth: "plan_TO6Qj9RS4GjW5A",
  business: "plan_TO6STE2U2cmmrf",
} as const satisfies Record<"starter" | "growth" | "business", string>;

export type RecurringPlanTier = keyof typeof RAZORPAY_RECURRING_PLAN_IDS;

export function isRecurringPlanTier(value: unknown): value is RecurringPlanTier {
  return value === "starter" || value === "growth" || value === "business";
}

export function getRazorpayRecurringPlanId(tier: PlanTier): string | null {
  if (!isRecurringPlanTier(tier)) return null;
  return RAZORPAY_RECURRING_PLAN_IDS[tier];
}

export function getTierForRazorpayPlanId(planId: string): RecurringPlanTier | null {
  for (const [tier, id] of Object.entries(RAZORPAY_RECURRING_PLAN_IDS) as Array<[RecurringPlanTier, string]>) {
    if (id === planId) return tier;
  }
  return null;
}
