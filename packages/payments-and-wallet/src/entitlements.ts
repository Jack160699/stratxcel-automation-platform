import type { ServiceClient } from "./db.ts";

export interface PlanEntitlementLimits {
  social_posts: number;
  meta_ad_campaigns: number;
  whatsapp_contacts: number;
  website_maintenance: number;
}

/**
 * Notion v1 catalog (free/starter/growth/business/scale), aligned with the
 * production-applied migration 20260809010000_subscription_v1_catalog_alignment.sql,
 * which patched the reconcile_and_fulfill_razorpay_payment_v4() SQL body in place —
 * starter/growth/business are the only self-checkout-payable tiers; their four
 * numbers here (social_posts, meta_ad_campaigns, whatsapp_contacts,
 * website_maintenance) MUST stay byte-for-byte identical to that migration's
 * v_limits_starter / v_limits_growth / v_limits_business arrays.
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
 */
export const PLAN_LIMITS: Record<"launch" | "custom_growth" | "free" | "starter" | "growth" | "business" | "scale", PlanEntitlementLimits> = {
  launch: {
    social_posts: 12,
    meta_ad_campaigns: 1,
    whatsapp_contacts: 500,
    website_maintenance: 0,
  },
  custom_growth: {
    social_posts: 60,
    meta_ad_campaigns: 4,
    whatsapp_contacts: 10000,
    website_maintenance: 1,
  },
  free: {
    social_posts: 0,
    meta_ad_campaigns: 0,
    whatsapp_contacts: 0,
    website_maintenance: 0,
  },
  starter: {
    social_posts: 12,
    meta_ad_campaigns: 1,
    whatsapp_contacts: 100,
    website_maintenance: 0,
  },
  growth: {
    social_posts: 25,
    meta_ad_campaigns: 1,
    whatsapp_contacts: 500,
    website_maintenance: 1,
  },
  business: {
    social_posts: 50,
    meta_ad_campaigns: 3,
    whatsapp_contacts: 1500,
    website_maintenance: 1,
  },
  scale: {
    social_posts: 75,
    meta_ad_campaigns: 5,
    whatsapp_contacts: 2500,
    website_maintenance: 1,
  },
};

export interface CheckUsageResult {
  metric: string;
  limit: number;
  currentUsage: number;
  percentage: number;
  isPaused: boolean;
  notificationTriggered: "80" | "90" | "100" | null;
}

export type EntitlementMetric = "social_posts" | "meta_ad_campaigns" | "whatsapp_contacts" | "website_maintenance";

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
  metric: "social_posts" | "meta_ad_campaigns" | "whatsapp_contacts" | "website_maintenance",
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
