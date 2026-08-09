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
 * Notion v1 catalog (approved Tier-1 catalog, production-applied via
 * 20260809010000_subscription_v1_catalog_alignment.sql): free, starter, growth,
 * business, scale. Only starter/growth/business are self-checkout payable —
 * free is not a paid subscription and scale/custom is quote-led, never
 * self-checkout. Prices and limits below MUST match that migration exactly.
 *
 * Do NOT revive Signal/Mesh/Fleet — those identifiers may still exist in
 * historical rows and must not be renamed destructively, but they are not part
 * of the current commercial offer. `launch` and `custom_growth` are the
 * previous (pre-v1-catalog) commercial tiers; they remain valid DB-compatibility
 * identifiers for historical rows only and fail closed for any NEW payment
 * (see the hardened SQL function's `legacy_plan_not_payable` branch) — never
 * offer them in new checkout UI.
 */
export type PlanTier = "launch" | "custom_growth" | "free" | "starter" | "growth" | "business" | "scale";

export interface PlanDefinition {
  tier: PlanTier;
  publicName: string;
  /** GST-inclusive monthly price in paise. Null for plans without a fixed self-service price. */
  priceCents: number | null;
  /** For quote-led plans: the lowest price customers are told to expect, GST-inclusive. */
  startingAtCents: number | null;
  billingIntervalMonths: 1;
  entitlements: PlanEntitlementLimits;
  status: "active" | "legacy";
  /** Whether a customer can buy this plan through the in-app checkout without a human quote. */
  selfServiceCheckout: boolean;
}

export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  launch: {
    tier: "launch",
    publicName: "Launch",
    priceCents: 949_900, // ₹9,499.00/mo, GST-inclusive — historical price, display-only
    startingAtCents: null,
    billingIntervalMonths: 1,
    entitlements: PLAN_LIMITS.launch,
    status: "legacy",
    selfServiceCheckout: false,
  },
  custom_growth: {
    tier: "custom_growth",
    publicName: "Custom Growth",
    priceCents: null,
    startingAtCents: 2_399_900, // "Starting ₹23,999.00/mo", GST-inclusive — historical, display-only
    billingIntervalMonths: 1,
    entitlements: PLAN_LIMITS.custom_growth,
    status: "legacy",
    selfServiceCheckout: false,
  },
  free: {
    tier: "free",
    publicName: "Free",
    priceCents: 0, // ₹0
    startingAtCents: null,
    billingIntervalMonths: 1,
    entitlements: PLAN_LIMITS.free,
    status: "active",
    selfServiceCheckout: false,
  },
  starter: {
    tier: "starter",
    publicName: "Starter",
    priceCents: 499_900, // ₹4,999.00/mo, GST-inclusive
    startingAtCents: null,
    billingIntervalMonths: 1,
    entitlements: PLAN_LIMITS.starter,
    status: "active",
    selfServiceCheckout: true,
  },
  growth: {
    tier: "growth",
    publicName: "Growth",
    priceCents: 999_900, // ₹9,999.00/mo, GST-inclusive
    startingAtCents: null,
    billingIntervalMonths: 1,
    entitlements: PLAN_LIMITS.growth,
    status: "active",
    selfServiceCheckout: true,
  },
  business: {
    tier: "business",
    publicName: "Business",
    priceCents: 1_999_900, // ₹19,999.00/mo, GST-inclusive
    startingAtCents: null,
    billingIntervalMonths: 1,
    entitlements: PLAN_LIMITS.business,
    status: "active",
    selfServiceCheckout: true,
  },
  scale: {
    tier: "scale",
    publicName: "Scale / Custom",
    // Genuinely custom — no universal recurring amount exists to charge automatically.
    priceCents: null,
    startingAtCents: 3_499_900, // "Starting ₹34,999.00/mo", GST-inclusive
    billingIntervalMonths: 1,
    entitlements: PLAN_LIMITS.scale,
    status: "active",
    selfServiceCheckout: false,
  },
};

export function isPlanTier(value: unknown): value is PlanTier {
  return (
    value === "launch" ||
    value === "custom_growth" ||
    value === "free" ||
    value === "starter" ||
    value === "growth" ||
    value === "business" ||
    value === "scale"
  );
}

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLAN_DEFINITIONS[tier];
}

/** Returns the plan only if it can be self-service checked out (Starter/Growth/Business); null otherwise. */
export function getSelfServicePlan(tier: PlanTier): PlanDefinition | null {
  const plan = PLAN_DEFINITIONS[tier];
  if (!plan.selfServiceCheckout || plan.priceCents == null) return null;
  return plan;
}

export const SELF_SERVICE_PLAN_TIERS: readonly PlanTier[] = (Object.values(PLAN_DEFINITIONS) as PlanDefinition[])
  .filter((p) => p.selfServiceCheckout)
  .map((p) => p.tier);
