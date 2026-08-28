import type { PlanEntitlementLimits, PlanCapabilities } from "./entitlements.ts";
import { PLAN_LIMITS, PLAN_CAPABILITIES } from "./entitlements.ts";

/**
 * Canonical Service & Plan Tiers — Single Source of Truth for StratXcel Commercial Architecture.
 *
 * Current Commercial Model:
 * - free: Free trial (Audit access, 3 image-generation attempts/month trial; blocked from SEO, website, Autopilot, WhatsApp).
 * - seo: SEO Growth (₹2,999/mo GST included). Standard SEO execution upon payment.
 * - social: Social Content (₹3,999/mo GST included). 28 premium posts/mo, quality gate, AI visuals, scheduling, publishing.
 * - seo_and_social: SEO + Social (₹6,998/mo GST included). 28 posts/mo + standard SEO.
 * - advanced_seo: Advanced SEO (₹9,999/mo GST included). Advanced analytics, research, opportunity discovery, blog posting.
 * - advanced_social: Advanced Social (₹8,499/mo GST included). 28 posts/mo, full Social Autopilot, trend research, 100 image attempts/mo.
 * - advanced_growth: Advanced Growth (₹18,498/mo GST included). Advanced SEO + Advanced Social + Free Landing Page + WhatsApp Autopilot.
 * - website_landing_page: Basic Landing Page (₹999 one-time GST included).
 * - website_standard: 5–6 Page Website (₹2,999 one-time GST included).
 * - website_custom: Custom Website (Quote-led via specialist).
 *
 * Legacy DB compatibility tiers (starter, growth, business, launch, custom_growth, scale) are retained
 * for historical row readability only and fail closed for any new self-service payment.
 */
export type PlanTier =
  | "free"
  | "seo"
  | "social"
  | "seo_and_social"
  | "advanced_seo"
  | "advanced_social"
  | "advanced_growth"
  | "website_landing_page"
  | "website_standard"
  | "website_custom"
  // Legacy DB tiers for historical subscriptions/invoices
  | "starter"
  | "growth"
  | "business"
  | "launch"
  | "custom_growth"
  | "scale";

export interface PlanDefinition {
  tier: PlanTier;
  publicName: string;
  /** GST-inclusive monthly or one-time price in paise. Null for quote-led services. */
  priceCents: number | null;
  /** For quote-led plans: the lowest price customers are told to expect, GST-inclusive. */
  startingAtCents: number | null;
  billingIntervalMonths: number;
  billingType: "RECURRING" | "ONE_TIME" | "QUOTE";
  entitlements: PlanEntitlementLimits;
  capabilities: PlanCapabilities;
  status: "active" | "legacy";
  /** Whether a customer can buy this plan through self-service checkout. */
  selfServiceCheckout: boolean;
}

export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  free: {
    tier: "free",
    publicName: "Free Trial",
    priceCents: 0,
    startingAtCents: null,
    billingIntervalMonths: 1,
    billingType: "RECURRING",
    entitlements: PLAN_LIMITS.free,
    capabilities: PLAN_CAPABILITIES.free,
    status: "active",
    selfServiceCheckout: false,
  },
  seo: {
    tier: "seo",
    publicName: "SEO Growth",
    priceCents: 299_900, // ₹2,999.00/mo, GST-inclusive
    startingAtCents: null,
    billingIntervalMonths: 1,
    billingType: "RECURRING",
    entitlements: PLAN_LIMITS.seo,
    capabilities: PLAN_CAPABILITIES.seo,
    status: "active",
    selfServiceCheckout: true,
  },
  social: {
    tier: "social",
    publicName: "Social Content",
    priceCents: 399_900, // ₹3,999.00/mo, GST-inclusive (28 posts/mo)
    startingAtCents: null,
    billingIntervalMonths: 1,
    billingType: "RECURRING",
    entitlements: PLAN_LIMITS.social,
    capabilities: PLAN_CAPABILITIES.social,
    status: "active",
    selfServiceCheckout: true,
  },
  seo_and_social: {
    tier: "seo_and_social",
    publicName: "SEO + Social Content",
    priceCents: 699_800, // ₹6,998.00/mo, GST-inclusive (₹2,999 + ₹3,999)
    startingAtCents: null,
    billingIntervalMonths: 1,
    billingType: "RECURRING",
    entitlements: PLAN_LIMITS.seo_and_social,
    capabilities: PLAN_CAPABILITIES.seo_and_social,
    status: "active",
    selfServiceCheckout: true,
  },
  advanced_seo: {
    tier: "advanced_seo",
    publicName: "Advanced SEO",
    priceCents: 999_900, // ₹9,999.00/mo, GST-inclusive
    startingAtCents: null,
    billingIntervalMonths: 1,
    billingType: "RECURRING",
    entitlements: PLAN_LIMITS.advanced_seo,
    capabilities: PLAN_CAPABILITIES.advanced_seo,
    status: "active",
    selfServiceCheckout: true,
  },
  advanced_social: {
    tier: "advanced_social",
    publicName: "Advanced Social",
    priceCents: 849_900, // ₹8,499.00/mo, GST-inclusive (28 posts, Autopilot, 100 images)
    startingAtCents: null,
    billingIntervalMonths: 1,
    billingType: "RECURRING",
    entitlements: PLAN_LIMITS.advanced_social,
    capabilities: PLAN_CAPABILITIES.advanced_social,
    status: "active",
    selfServiceCheckout: true,
  },
  advanced_growth: {
    tier: "advanced_growth",
    publicName: "Advanced Growth",
    priceCents: 1_849_800, // ₹18,498.00/mo, GST-inclusive (₹9,999 + ₹8,499)
    startingAtCents: null,
    billingIntervalMonths: 1,
    billingType: "RECURRING",
    entitlements: PLAN_LIMITS.advanced_growth,
    capabilities: PLAN_CAPABILITIES.advanced_growth,
    status: "active",
    selfServiceCheckout: true,
  },
  website_landing_page: {
    tier: "website_landing_page",
    publicName: "Basic Landing Page",
    priceCents: 99_900, // ₹999.00 one-time, GST-inclusive
    startingAtCents: null,
    billingIntervalMonths: 0,
    billingType: "ONE_TIME",
    entitlements: PLAN_LIMITS.website_landing_page,
    capabilities: PLAN_CAPABILITIES.website_landing_page,
    status: "active",
    selfServiceCheckout: true,
  },
  website_standard: {
    tier: "website_standard",
    publicName: "5–6 Page Website",
    priceCents: 299_900, // ₹2,999.00 one-time, GST-inclusive
    startingAtCents: null,
    billingIntervalMonths: 0,
    billingType: "ONE_TIME",
    entitlements: PLAN_LIMITS.website_standard,
    capabilities: PLAN_CAPABILITIES.website_standard,
    status: "active",
    selfServiceCheckout: true,
  },
  website_custom: {
    tier: "website_custom",
    publicName: "Custom Website",
    priceCents: null,
    startingAtCents: 499_900, // Custom Quote
    billingIntervalMonths: 0,
    billingType: "QUOTE",
    entitlements: PLAN_LIMITS.website_custom,
    capabilities: PLAN_CAPABILITIES.website_custom,
    status: "active",
    selfServiceCheckout: false,
  },

  // Legacy DB tiers for historical subscriptions/invoices (display-only; fail closed for new self-service)
  starter: {
    tier: "starter",
    publicName: "Starter (Legacy)",
    priceCents: 299_900,
    startingAtCents: null,
    billingIntervalMonths: 1,
    billingType: "RECURRING",
    entitlements: PLAN_LIMITS.starter,
    capabilities: PLAN_CAPABILITIES.starter,
    status: "legacy",
    selfServiceCheckout: false,
  },
  growth: {
    tier: "growth",
    publicName: "Growth (Legacy)",
    priceCents: 799_900,
    startingAtCents: null,
    billingIntervalMonths: 1,
    billingType: "RECURRING",
    entitlements: PLAN_LIMITS.growth,
    capabilities: PLAN_CAPABILITIES.growth,
    status: "legacy",
    selfServiceCheckout: false,
  },
  business: {
    tier: "business",
    publicName: "Business (Legacy)",
    priceCents: 1_599_900,
    startingAtCents: null,
    billingIntervalMonths: 1,
    billingType: "RECURRING",
    entitlements: PLAN_LIMITS.business,
    capabilities: PLAN_CAPABILITIES.business,
    status: "legacy",
    selfServiceCheckout: false,
  },
  launch: {
    tier: "launch",
    publicName: "Launch (Legacy)",
    priceCents: 949_900,
    startingAtCents: null,
    billingIntervalMonths: 1,
    billingType: "RECURRING",
    entitlements: PLAN_LIMITS.launch,
    capabilities: PLAN_CAPABILITIES.launch,
    status: "legacy",
    selfServiceCheckout: false,
  },
  custom_growth: {
    tier: "custom_growth",
    publicName: "Custom Growth (Legacy)",
    priceCents: null,
    startingAtCents: 2_399_900,
    billingIntervalMonths: 1,
    billingType: "RECURRING",
    entitlements: PLAN_LIMITS.custom_growth,
    capabilities: PLAN_CAPABILITIES.custom_growth,
    status: "legacy",
    selfServiceCheckout: false,
  },
  scale: {
    tier: "scale",
    publicName: "Scale / Custom (Legacy)",
    priceCents: null,
    startingAtCents: 2_999_900,
    billingIntervalMonths: 1,
    billingType: "QUOTE",
    entitlements: PLAN_LIMITS.scale,
    capabilities: PLAN_CAPABILITIES.scale,
    status: "legacy",
    selfServiceCheckout: false,
  },
};

export function isPlanTier(value: unknown): value is PlanTier {
  return (
    value === "free" ||
    value === "seo" ||
    value === "social" ||
    value === "seo_and_social" ||
    value === "advanced_seo" ||
    value === "advanced_social" ||
    value === "advanced_growth" ||
    value === "website_landing_page" ||
    value === "website_standard" ||
    value === "website_custom" ||
    value === "starter" ||
    value === "growth" ||
    value === "business" ||
    value === "launch" ||
    value === "custom_growth" ||
    value === "scale"
  );
}

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLAN_DEFINITIONS[tier] ?? PLAN_DEFINITIONS.free;
}

/** Returns the plan only if it can be self-service checked out; null otherwise. */
export function getSelfServicePlan(tier: PlanTier): PlanDefinition | null {
  const plan = PLAN_DEFINITIONS[tier];
  if (!plan || !plan.selfServiceCheckout || plan.priceCents == null) return null;
  return plan;
}

export const SELF_SERVICE_PLAN_TIERS: readonly PlanTier[] = (Object.values(PLAN_DEFINITIONS) as PlanDefinition[])
  .filter((p) => p.selfServiceCheckout && p.status === "active")
  .map((p) => p.tier);
