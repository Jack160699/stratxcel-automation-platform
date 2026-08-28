import type { ServiceClient } from "./db.ts";

export interface PlanEntitlementLimits {
  social_posts: number;
  meta_ad_campaigns: number;
  whatsapp_contacts: number;
  website_maintenance: number;
  /** Monthly user-requested image/content generation allowance (Starter: single pool of 10; Growth/Business: the user-requested/premium pool). */
  content_generation_monthly: number;
  /** Monthly system-generated (autonomously researched) content allowance, ON TOP of content_generation_monthly. Only Growth grants this as a distinct pool today. */
  automated_content_monthly: number;
  /** Subscription-gated visual-archetype system: monthly automated (cron)
   * Social Autopilot generation quota. Deliberately a NEW, distinct metric
   * from automated_content_monthly (Creative Studio/Copilot's own pool) --
   * see 20260828030000_social_autopilot_archetype_tier_quotas.sql for why
   * overloading the existing metric would have silently changed every
   * current subscriber's Creative Studio/Copilot quota. Starter is
   * BASIC_ESSENTIAL-only automated generation; Growth+ cycles through the
   * subscriber's 1-3 saved archetype preferences. */
  social_autopilot_automated_monthly: number;
  /** Monthly on-demand/manual Social Autopilot generation quota (explicit
   * archetype choice per generation). Zero for Starter -- manual generation
   * is a Growth+ capability entirely, not just a smaller allowance. */
  social_autopilot_manual_monthly: number;
}

/**
 * Notion v1 catalog (free/starter/growth/business/scale), aligned with the
 * production-applied migration 20260809010000_subscription_v1_catalog_alignment.sql,
 * which patched the reconcile_and_fulfill_razorpay_payment_v4() SQL body in place —
 * starter/growth/business are the only self-checkout-payable tiers; their six
 * numbers here (social_posts, meta_ad_campaigns, whatsapp_contacts,
 * website_maintenance, content_generation_monthly, automated_content_monthly)
 * MUST stay byte-for-byte identical to the v_limits_starter / v_limits_growth /
 * v_limits_business arrays patched into that RPC by
 * <timestamp>_v2_commercial_model_realignment.sql.
 *
 * `launch` and `custom_growth` are kept only as historical DB-compatibility
 * identifiers (existing rows may still carry them) — their numbers are
 * unchanged from before this alignment. They are not part of the current
 * commercial offer and fail closed (`legacy_plan_not_payable`) for any NEW
 * payment in the hardened SQL function; do not offer them in new checkout UI.
 *
 * `free` and `scale` have no self-checkout fulfilment path in the SQL RPC
 * (`plan_not_self_checkout`) — free grants no paid automation, and scale's
 * entitlements below are a display-only starting figure for a quote-led
 * custom order, not an enforced self-checkout grant.
 *
 * social_posts (Social Autopilot's monthly publishing package size, reusing
 * already-uploaded/generated assets — see lib/social/package-composition.ts)
 * is intentionally left at its pre-existing values: the locked commercial
 * model's "image generations/month" figures (content_generation_monthly /
 * automated_content_monthly) are a separate, new concept governing Creative
 * Studio / Copilot generation quota, not Autopilot's publish cadence.
 */
export const PLAN_LIMITS: Record<"launch" | "custom_growth" | "free" | "starter" | "growth" | "business" | "scale", PlanEntitlementLimits> = {
  launch: {
    social_posts: 12,
    meta_ad_campaigns: 1,
    whatsapp_contacts: 500,
    website_maintenance: 0,
    content_generation_monthly: 10,
    automated_content_monthly: 0,
    // Legacy tier, fails closed (legacy_plan_not_payable) for any NEW
    // payment/renewal in the RPCs -- these numbers are never actually
    // granted by a real transaction, kept only for TS-side completeness.
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
  },
  custom_growth: {
    social_posts: 60,
    meta_ad_campaigns: 4,
    whatsapp_contacts: 10000,
    website_maintenance: 1,
    content_generation_monthly: 30,
    automated_content_monthly: 10,
    // Same "never actually granted" caveat as launch above.
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
  },
  free: {
    social_posts: 0,
    meta_ad_campaigns: 0,
    whatsapp_contacts: 0,
    website_maintenance: 0,
    content_generation_monthly: 0,
    automated_content_monthly: 0,
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
  },
  starter: {
    social_posts: 12,
    meta_ad_campaigns: 1,
    whatsapp_contacts: 100,
    website_maintenance: 0,
    // Single pool of 10 (default allocation: 5 system-generated + 5 user-requested — brief §1).
    content_generation_monthly: 10,
    automated_content_monthly: 0,
    // ₹2,999 "Automated Core": exactly 12 automated BASIC_ESSENTIAL
    // creatives/month, zero manual/on-demand access at this tier.
    social_autopilot_automated_monthly: 12,
    social_autopilot_manual_monthly: 0,
  },
  growth: {
    social_posts: 25,
    meta_ad_campaigns: 1,
    whatsapp_contacts: 500,
    website_maintenance: 1,
    // 20 user-requested PLUS 10 system-generated as a distinct pool (brief §2).
    content_generation_monthly: 20,
    automated_content_monthly: 10,
    // ₹7,999 "Premium Curation": 30 automated creatives/month cycling the
    // subscriber's 1-3 saved archetype preferences, plus 10 manual/on-demand
    // generations/month with an explicit per-generation archetype choice.
    social_autopilot_automated_monthly: 30,
    social_autopilot_manual_monthly: 10,
  },
  business: {
    social_posts: 50,
    meta_ad_campaigns: 3,
    whatsapp_contacts: 1500,
    website_maintenance: 1,
    // 30 premium generations/month, single pool (brief §3 — not split like Growth).
    content_generation_monthly: 30,
    automated_content_monthly: 0,
    // Not separately specified by the ₹2,999/₹7,999 brief -- mirrors Growth
    // since Business is a superset of Growth everywhere else in
    // PLAN_CAPABILITIES (social_autopilot/premium_content both already
    // true). Revisit if a distinct Business figure is decided later.
    social_autopilot_automated_monthly: 30,
    social_autopilot_manual_monthly: 10,
  },
  scale: {
    social_posts: 75,
    meta_ad_campaigns: 5,
    whatsapp_contacts: 2500,
    website_maintenance: 1,
    content_generation_monthly: 40,
    automated_content_monthly: 15,
    // Quote-led custom order, no self-checkout grant path -- display-only,
    // same caveat as the rest of this tier's figures (see class comment above).
    social_autopilot_automated_monthly: 30,
    social_autopilot_manual_monthly: 10,
  },
};

export type GoogleGrowthLevel = "basic" | "advanced" | "maximum";

/**
 * Plan-level capability flags — pure functions of plan_tier, resolved
 * entirely in code (no usage_entitlements row, no DB write). Anything that
 * already knows the tenant's active plan_tier (billing page, EntitlementGate,
 * Growth Assistant, website factory, WhatsApp worker) can resolve these with
 * zero additional queries via getPlanCapabilities()/hasCapability() below.
 * Consumable/incrementing quotas live in PLAN_LIMITS + usage_entitlements
 * instead — these are booleans/levels only.
 */
export interface PlanCapabilities {
  google_growth_level: GoogleGrowthLevel;
  seo_level: GoogleGrowthLevel;
  social_autopilot: boolean;
  direct_publishing: boolean;
  logo_brand_kit: boolean;
  landing_page: boolean;
  website_included: boolean;
  /** Minimum subscription commitment (months) required to keep an included website. 0 = no commitment. */
  website_commitment_months: number;
  premium_content: boolean;
  advanced_competitor_research: boolean;
  whatsapp_assistant_access: boolean;
}

export const PLAN_CAPABILITIES: Record<"launch" | "custom_growth" | "free" | "starter" | "growth" | "business" | "scale", PlanCapabilities> = {
  free: {
    google_growth_level: "basic",
    seo_level: "basic",
    social_autopilot: false,
    direct_publishing: false,
    logo_brand_kit: false,
    landing_page: false,
    website_included: false,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: false,
    whatsapp_assistant_access: false,
  },
  starter: {
    google_growth_level: "basic",
    seo_level: "basic",
    // Real commercial decision (not an oversight): Starter (₹2,999) gets
    // automated-only Social Autopilot, BASIC_ESSENTIAL layout exclusively,
    // 12 automated / 0 manual generations per month (see
    // social_autopilot_automated_monthly / social_autopilot_manual_monthly
    // in PLAN_LIMITS above, and lib/social/archetype-routing.ts for the
    // server-side enforcement that makes this real, not just a flag).
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: false,
    website_included: false,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: false,
    whatsapp_assistant_access: false,
  },
  growth: {
    google_growth_level: "advanced",
    seo_level: "advanced",
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: true,
    website_included: false,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: true,
    whatsapp_assistant_access: false,
  },
  business: {
    google_growth_level: "maximum",
    seo_level: "maximum",
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: true,
    website_included: true,
    website_commitment_months: 3,
    premium_content: true,
    advanced_competitor_research: true,
    whatsapp_assistant_access: true,
  },
  // Legacy/quote-led tiers — not part of the current commercial offer, kept for
  // historical rows and Scale display only. Mirrors the closest active tier.
  launch: {
    google_growth_level: "basic",
    seo_level: "basic",
    social_autopilot: false,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: false,
    website_included: false,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: false,
    whatsapp_assistant_access: false,
  },
  custom_growth: {
    google_growth_level: "maximum",
    seo_level: "maximum",
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: true,
    website_included: true,
    website_commitment_months: 0,
    premium_content: true,
    advanced_competitor_research: true,
    whatsapp_assistant_access: true,
  },
  scale: {
    google_growth_level: "maximum",
    seo_level: "maximum",
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: true,
    website_included: true,
    website_commitment_months: 0,
    premium_content: true,
    advanced_competitor_research: true,
    whatsapp_assistant_access: true,
  },
};

export function getPlanCapabilities(
  tier: "launch" | "custom_growth" | "free" | "starter" | "growth" | "business" | "scale"
): PlanCapabilities {
  return PLAN_CAPABILITIES[tier];
}

export function hasCapability<K extends keyof PlanCapabilities>(
  tier: "launch" | "custom_growth" | "free" | "starter" | "growth" | "business" | "scale",
  key: K
): PlanCapabilities[K] {
  return PLAN_CAPABILITIES[tier][key];
}

export interface CheckUsageResult {
  metric: string;
  limit: number;
  currentUsage: number;
  percentage: number;
  isPaused: boolean;
  notificationTriggered: "80" | "90" | "100" | null;
}

export type EntitlementMetric =
  | "social_posts"
  | "meta_ad_campaigns"
  | "whatsapp_contacts"
  | "website_maintenance"
  | "content_generation_monthly"
  | "automated_content_monthly"
  | "social_autopilot_automated_monthly"
  | "social_autopilot_manual_monthly";

export interface EntitlementStatus {
  metric: EntitlementMetric;
  limit: number;
  currentUsage: number;
  remaining: number;
  isPaused: boolean;
  hasCapacity: boolean;
}

/**
 * Central tenant-safe entitlement check. Application code across Hermes, Social,
 * WhatsApp, CRM and the website module should call this — "does this tenant have
 * entitlement X?" — rather than checking UI plan-tier strings scattered through the
 * app. Derives strictly from `usage_entitlements`, which is only ever written by the
 * payment-fulfilment RPCs (active subscription + plan), never from client input.
 * A tenant with no row for a metric has no entitlement (fails closed).
 */
export async function hasEntitlement(
  supabase: ServiceClient,
  tenantId: string,
  metric: EntitlementMetric,
  units = 1
): Promise<boolean> {
  const { data: entitlement } = await supabase
    .from("usage_entitlements")
    .select("limit_amount, current_usage, is_paused")
    .eq("tenant_id", tenantId)
    .eq("metric", metric)
    .maybeSingle();

  if (!entitlement || entitlement.is_paused) return false;
  return entitlement.current_usage + units <= entitlement.limit_amount;
}

/** Full entitlement snapshot for a tenant — what the billing page and admin visibility render. */
export async function getEntitlementSummary(
  supabase: ServiceClient,
  tenantId: string
): Promise<EntitlementStatus[]> {
  const { data } = await supabase
    .from("usage_entitlements")
    .select("metric, limit_amount, current_usage, is_paused")
    .eq("tenant_id", tenantId);

  return (data ?? []).map((row) => ({
    metric: row.metric as EntitlementMetric,
    limit: row.limit_amount,
    currentUsage: row.current_usage,
    remaining: Math.max(0, row.limit_amount - row.current_usage),
    isPaused: row.is_paused,
    hasCapacity: !row.is_paused && row.current_usage < row.limit_amount,
  }));
}

export async function recordMetricUsage(
  supabase: ServiceClient,
  tenantId: string,
  metric: EntitlementMetric,
  incrementBy = 1
): Promise<CheckUsageResult> {
  const { data: entitlement, error } = await supabase
    .from("usage_entitlements")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("metric", metric)
    .maybeSingle();

  if (error || !entitlement) {
    return {
      metric,
      limit: 10,
      currentUsage: incrementBy,
      percentage: 10,
      isPaused: false,
      notificationTriggered: null,
    };
  }

  const newUsage = entitlement.current_usage + incrementBy;
  const limit = entitlement.limit_amount;
  const percentage = Math.round((newUsage / limit) * 100);

  let trigger: "80" | "90" | "100" | null = null;
  let update80 = entitlement.notification_sent_80;
  let update90 = entitlement.notification_sent_90;
  let update100 = entitlement.notification_sent_100;
  let isPaused = entitlement.is_paused;

  if (percentage >= 100 && !update100) {
    trigger = "100";
    update100 = true;
    isPaused = true; // Pause non-essential expansion work at 100%
  } else if (percentage >= 90 && !update90) {
    trigger = "90";
    update90 = true;
  } else if (percentage >= 80 && !update80) {
    trigger = "80";
    update80 = true;
  }

  await supabase
    .from("usage_entitlements")
    .update({
      current_usage: newUsage,
      notification_sent_80: update80,
      notification_sent_90: update90,
      notification_sent_100: update100,
      is_paused: isPaused,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entitlement.id);

  return {
    metric,
    limit,
    currentUsage: newUsage,
    percentage,
    isPaused,
    notificationTriggered: trigger,
  };
}
