import type { ServiceClient } from "./db.ts";

export interface PlanEntitlementLimits {
  social_posts: number;
  meta_ad_campaigns: number;
  whatsapp_contacts: number;
  website_maintenance: number;
}

export const PLAN_LIMITS: Record<"launch" | "growth" | "custom_growth", PlanEntitlementLimits> = {
  launch: {
    social_posts: 12,
    meta_ad_campaigns: 1,
    whatsapp_contacts: 500,
    website_maintenance: 0,
  },
  growth: {
    social_posts: 30,
    meta_ad_campaigns: 2,
    whatsapp_contacts: 2500,
    website_maintenance: 1,
  },
  custom_growth: {
    social_posts: 60,
    meta_ad_campaigns: 4,
    whatsapp_contacts: 10000,
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
