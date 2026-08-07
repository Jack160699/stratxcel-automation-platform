import type { PlanEntitlementLimits } from "./entitlements.ts";
import { PLAN_LIMITS } from "./entitlements.ts";

/**
 * Canonical public plan tiers. This is the single server-side source of truth for
 * name, GST-inclusive price, billing interval, entitlements and self-service
 * availability — checkout routes, the billing page, and admin visibility all read
 * from here rather than hardcoding plan strings. The `fulfill`/`reconcile_and_
 * fulfill_razorpay_payment_v4` SQL function necessarily keeps its own copy of the
 * price/limit numbers (Postgres cannot import this module) — treat this file as
 * authoritative and keep the SQL numbers in sync with it if either ever changes.
 *
 * Do NOT revive Signal/Mesh/Fleet/Scale — those identifiers may still exist in
 * historical rows and must not be renamed destructively, but they are not part of
 * the current commercial offer.
 */
export type PlanTier = "launch" | "growth" | "custom_growth";

export interface PlanDefinition {
  tier: PlanTier;
  publicName: string;
  /** GST-inclusive monthly price in paise. Null for plans without a fixed self-service price. */
  priceCents: number | null;
  /** For quote-led plans: the lowest price customers are told to expect, GST-inclusive. */
  startingAtCents: number | null;
  billingIntervalMonths: 1;
  entitlements: PlanEntitlementLimits;
  status: "active";
  /** Whether a customer can buy this plan through the in-app checkout without a human quote. */
  selfServiceCheckout: boolean;
}

export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  launch: {
    tier: "launch",
    publicName: "Launch",
    priceCents: 949_900, // ₹9,499.00/mo, GST-inclusive
    startingAtCents: null,
    billingIntervalMonths: 1,
    entitlements: PLAN_LIMITS.launch,
    status: "active",
    selfServiceCheckout: true,
  },
  growth: {
    tier: "growth",
    publicName: "Growth",
    priceCents: 1_899_900, // ₹18,999.00/mo, GST-inclusive
    startingAtCents: null,
    billingIntervalMonths: 1,
    entitlements: PLAN_LIMITS.growth,
    status: "active",
    selfServiceCheckout: true,
  },
  custom_growth: {
    tier: "custom_growth",
    publicName: "Custom Growth",
    // Genuinely custom — no universal recurring amount exists to charge automatically.
    priceCents: null,
    startingAtCents: 2_399_900, // "Starting ₹23,999.00/mo", GST-inclusive
    billingIntervalMonths: 1,
    entitlements: PLAN_LIMITS.custom_growth,
    status: "active",
    selfServiceCheckout: false,
  },
};

export function isPlanTier(value: unknown): value is PlanTier {
  return value === "launch" || value === "growth" || value === "custom_growth";
}

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLAN_DEFINITIONS[tier];
}

/** Returns the plan only if it can be self-service checked out (Launch/Growth); null otherwise. */
export function getSelfServicePlan(tier: PlanTier): PlanDefinition | null {
  const plan = PLAN_DEFINITIONS[tier];
  if (!plan.selfServiceCheckout || plan.priceCents == null) return null;
  return plan;
}

export const SELF_SERVICE_PLAN_TIERS: readonly PlanTier[] = (Object.values(PLAN_DEFINITIONS) as PlanDefinition[])
  .filter((p) => p.selfServiceCheckout)
  .map((p) => p.tier);
