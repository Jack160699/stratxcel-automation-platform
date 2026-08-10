import { getIntegrationMode, type IntegrationMode } from "../flags.ts";
import type { PlanTier } from "../plans.ts";

export type RecurringPlanTier = "starter" | "growth" | "business";

const PLAN_ENV_KEYS = {
  starter: "RAZORPAY_SUBSCRIPTION_PLAN_STARTER_ID",
  growth: "RAZORPAY_SUBSCRIPTION_PLAN_GROWTH_ID",
  business: "RAZORPAY_SUBSCRIPTION_PLAN_BUSINESS_ID",
} as const satisfies Record<RecurringPlanTier, string>;

export const RAZORPAY_AUDIT_CREDIT_OFFER_ENV = "RAZORPAY_SUBSCRIPTION_AUDIT_CREDIT_OFFER_ID";

export function isRecurringPlanTier(value: unknown): value is RecurringPlanTier {
  return value === "starter" || value === "growth" || value === "business";
}

function readEnvPlanId(tier: RecurringPlanTier): string | null {
  const raw = process.env[PLAN_ENV_KEYS[tier]];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Server-controlled Razorpay plan IDs for recurring AutoPay.
 * Fail-closed from env — never accepts client plan IDs and never falls back to
 * hardcoded live plan IDs in test/live mode.
 */
export function getRazorpayRecurringPlanId(
  tier: PlanTier,
  mode: IntegrationMode = getIntegrationMode("RAZORPAY_INTEGRATION_MODE")
): string {
  if (!isRecurringPlanTier(tier)) {
    throw new Error(`Plan ${String(tier)} is not a recurring self-checkout tier`);
  }

  const fromEnv = readEnvPlanId(tier);
  if (fromEnv) return fromEnv;

  if (mode === "shadow" || mode === "disabled") {
    // Shadow-only synthetic IDs so local bookkeeping can run without owner plan setup.
    return `plan_shadow_${tier}`;
  }

  throw new Error(
    `Missing ${PLAN_ENV_KEYS[tier]} for RAZORPAY_INTEGRATION_MODE=${mode}. Configure test/live plan IDs explicitly — no live-ID fallback.`
  );
}

export function getTierForRazorpayPlanId(planId: string): RecurringPlanTier | null {
  const normalized = planId.trim();
  if (!normalized) return null;

  for (const tier of Object.keys(PLAN_ENV_KEYS) as RecurringPlanTier[]) {
    const configured = readEnvPlanId(tier);
    if (configured && configured === normalized) return tier;
    if (normalized === `plan_shadow_${tier}`) return tier;
  }
  return null;
}

export function getConfiguredRazorpayPlanEnvKeys(): typeof PLAN_ENV_KEYS {
  return PLAN_ENV_KEYS;
}

/** Optional single-use Razorpay offer that discounts the first AutoPay charge by the ₹999 Audit credit. */
export function getRazorpayAuditCreditOfferId(
  mode: IntegrationMode = getIntegrationMode("RAZORPAY_INTEGRATION_MODE")
): string | null {
  const raw = process.env[RAZORPAY_AUDIT_CREDIT_OFFER_ENV];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (mode === "disabled") return null;
  return trimmed;
}

export function resolveRecurringAuditCreditHandling(input: {
  eligible: boolean;
  creditAmountCents: number;
  catalogPriceCents: number;
  mode?: IntegrationMode;
}): {
  chargePriceCents: number;
  auditCreditAppliedCents: number;
  auditCreditDeferredCents: number;
  offerId: string | null;
  creditMode: "none" | "provider_offer" | "deferred_wallet";
} {
  const mode = input.mode ?? getIntegrationMode("RAZORPAY_INTEGRATION_MODE");
  if (!input.eligible || input.creditAmountCents <= 0) {
    return {
      chargePriceCents: input.catalogPriceCents,
      auditCreditAppliedCents: 0,
      auditCreditDeferredCents: 0,
      offerId: null,
      creditMode: "none",
    };
  }

  const offerId = getRazorpayAuditCreditOfferId(mode);
  if (offerId) {
    return {
      chargePriceCents: Math.max(0, input.catalogPriceCents - input.creditAmountCents),
      auditCreditAppliedCents: input.creditAmountCents,
      auditCreditDeferredCents: 0,
      offerId,
      creditMode: "provider_offer",
    };
  }

  // Preserve the ₹999 promise without expecting a discounted Razorpay plan charge.
  return {
    chargePriceCents: input.catalogPriceCents,
    auditCreditAppliedCents: 0,
    auditCreditDeferredCents: input.creditAmountCents,
    offerId: null,
    creditMode: "deferred_wallet",
  };
}
