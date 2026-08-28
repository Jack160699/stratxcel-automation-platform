import type { ServiceClient } from "./db.ts";

export interface PlanEntitlementLimits {
  social_posts: number;
  meta_ad_campaigns: number;
  whatsapp_contacts: number;
  website_maintenance: number;
  content_generation_monthly: number;
  automated_content_monthly: number;
  social_autopilot_automated_monthly: number;
  social_autopilot_manual_monthly: number;
  /** Max image generation attempts per month (Free: 3; Advanced Social / Advanced Growth: 100). */
  image_generation_attempts_monthly: number;
  /** Copilot monthly usage allowance (Free: 3; Standard: 10; Advanced: 100). */
  copilot_monthly_uses: number;
}

export type GoogleGrowthLevel = "basic" | "advanced" | "maximum";

export interface PlanCapabilities {
  google_growth_level: GoogleGrowthLevel;
  seo_level: GoogleGrowthLevel;
  seo_execution: boolean;
  social_autopilot: boolean;
  direct_publishing: boolean;
  logo_brand_kit: boolean;
  landing_page: boolean;
  landing_page_bonus: boolean;
  website_included: boolean;
  website_commitment_months: number;
  premium_content: boolean;
  advanced_competitor_research: boolean;
  advanced_seo_research: boolean;
  blog_posting: boolean;
  strategic_planning: boolean;
  trend_research: boolean;
  advanced_visual_research: boolean;
  whatsapp_assistant_access: boolean;
}

export const PLAN_LIMITS: Record<string, PlanEntitlementLimits> = {
  free: {
    social_posts: 0,
    meta_ad_campaigns: 0,
    whatsapp_contacts: 0,
    website_maintenance: 0,
    content_generation_monthly: 0,
    automated_content_monthly: 0,
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
    image_generation_attempts_monthly: 3, // 3 trial attempts
    copilot_monthly_uses: 3,
  },
  seo: {
    social_posts: 0,
    meta_ad_campaigns: 0,
    whatsapp_contacts: 0,
    website_maintenance: 0,
    content_generation_monthly: 0,
    automated_content_monthly: 0,
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
    image_generation_attempts_monthly: 0,
    copilot_monthly_uses: 10,
  },
  social: {
    social_posts: 28, // 28 premium posts/month
    meta_ad_campaigns: 0,
    whatsapp_contacts: 0,
    website_maintenance: 0,
    content_generation_monthly: 28,
    automated_content_monthly: 0,
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
    image_generation_attempts_monthly: 28,
    copilot_monthly_uses: 10,
  },
  seo_and_social: {
    social_posts: 28,
    meta_ad_campaigns: 0,
    whatsapp_contacts: 0,
    website_maintenance: 0,
    content_generation_monthly: 28,
    automated_content_monthly: 0,
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
    image_generation_attempts_monthly: 28,
    copilot_monthly_uses: 10,
  },
  advanced_seo: {
    social_posts: 0,
    meta_ad_campaigns: 0,
    whatsapp_contacts: 0,
    website_maintenance: 0,
    content_generation_monthly: 0,
    automated_content_monthly: 0,
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
    image_generation_attempts_monthly: 0,
    copilot_monthly_uses: 10,
  },
  advanced_social: {
    social_posts: 28,
    meta_ad_campaigns: 0,
    whatsapp_contacts: 0,
    website_maintenance: 0,
    content_generation_monthly: 28,
    automated_content_monthly: 28,
    social_autopilot_automated_monthly: 28,
    social_autopilot_manual_monthly: 10,
    image_generation_attempts_monthly: 100, // max 100 image attempts/month
    copilot_monthly_uses: 100,
  },
  advanced_growth: {
    social_posts: 28,
    meta_ad_campaigns: 0,
    whatsapp_contacts: 0,
    website_maintenance: 1,
    content_generation_monthly: 28,
    automated_content_monthly: 28,
    social_autopilot_automated_monthly: 28,
    social_autopilot_manual_monthly: 10,
    image_generation_attempts_monthly: 100, // max 100 image attempts/month
    copilot_monthly_uses: 100,
  },
  website_landing_page: {
    social_posts: 0,
    meta_ad_campaigns: 0,
    whatsapp_contacts: 0,
    website_maintenance: 1,
    content_generation_monthly: 0,
    automated_content_monthly: 0,
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
    image_generation_attempts_monthly: 0,
    copilot_monthly_uses: 0,
  },
  website_standard: {
    social_posts: 0,
    meta_ad_campaigns: 0,
    whatsapp_contacts: 0,
    website_maintenance: 1,
    content_generation_monthly: 0,
    automated_content_monthly: 0,
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
    image_generation_attempts_monthly: 0,
    copilot_monthly_uses: 0,
  },
  website_custom: {
    social_posts: 0,
    meta_ad_campaigns: 0,
    whatsapp_contacts: 0,
    website_maintenance: 1,
    content_generation_monthly: 0,
    automated_content_monthly: 0,
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
    image_generation_attempts_monthly: 0,
    copilot_monthly_uses: 0,
  },

  // Legacy tiers for DB compatibility
  starter: {
    social_posts: 12,
    meta_ad_campaigns: 1,
    whatsapp_contacts: 100,
    website_maintenance: 0,
    content_generation_monthly: 10,
    automated_content_monthly: 0,
    social_autopilot_automated_monthly: 12,
    social_autopilot_manual_monthly: 0,
    image_generation_attempts_monthly: 10,
    copilot_monthly_uses: 10,
  },
  growth: {
    social_posts: 25,
    meta_ad_campaigns: 1,
    whatsapp_contacts: 500,
    website_maintenance: 1,
    content_generation_monthly: 20,
    automated_content_monthly: 10,
    social_autopilot_automated_monthly: 30,
    social_autopilot_manual_monthly: 10,
    image_generation_attempts_monthly: 30,
    copilot_monthly_uses: 30,
  },
  business: {
    social_posts: 50,
    meta_ad_campaigns: 3,
    whatsapp_contacts: 1500,
    website_maintenance: 1,
    content_generation_monthly: 30,
    automated_content_monthly: 0,
    social_autopilot_automated_monthly: 30,
    social_autopilot_manual_monthly: 10,
    image_generation_attempts_monthly: 50,
    copilot_monthly_uses: 50,
  },
  launch: {
    social_posts: 12,
    meta_ad_campaigns: 1,
    whatsapp_contacts: 500,
    website_maintenance: 0,
    content_generation_monthly: 10,
    automated_content_monthly: 0,
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
    image_generation_attempts_monthly: 10,
    copilot_monthly_uses: 10,
  },
  custom_growth: {
    social_posts: 60,
    meta_ad_campaigns: 4,
    whatsapp_contacts: 10000,
    website_maintenance: 1,
    content_generation_monthly: 30,
    automated_content_monthly: 10,
    social_autopilot_automated_monthly: 0,
    social_autopilot_manual_monthly: 0,
    image_generation_attempts_monthly: 30,
    copilot_monthly_uses: 30,
  },
  scale: {
    social_posts: 75,
    meta_ad_campaigns: 5,
    whatsapp_contacts: 2500,
    website_maintenance: 1,
    content_generation_monthly: 40,
    automated_content_monthly: 15,
    social_autopilot_automated_monthly: 30,
    social_autopilot_manual_monthly: 10,
    image_generation_attempts_monthly: 50,
    copilot_monthly_uses: 50,
  },
};

// Unlock Autopilot For All Plans mission: Social Autopilot is now the
// platform's core feature and must be available on every plan, including
// Starter/free-tier and SEO-only/website-only plans -- previously gated
// to advanced_social/advanced_growth (and the legacy growth/business/
// custom_growth/scale tiers) only. Every social_autopilot: false below is
// deliberately flipped to true; PLAN_LIMITS' numeric quotas (social_posts,
// social_autopilot_automated_monthly, etc.) are untouched -- a plan with a
// genuine 0 post quota (e.g. SEO-only/website-only) can now see and
// activate the toggle, but has nothing to actually schedule until it has
// a real, non-zero content quota. That's an honest, pre-existing "zero
// entitlement" state (planPackagePeriod's own blockedReason/
// NEEDS_ATTENTION handling), not a fabricated quota this mission never
// asked for.
export const PLAN_CAPABILITIES: Record<string, PlanCapabilities> = {
  free: {
    google_growth_level: "basic",
    seo_level: "basic",
    seo_execution: false,
    social_autopilot: true,
    direct_publishing: false,
    logo_brand_kit: false,
    landing_page: false,
    landing_page_bonus: false,
    website_included: false,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: false,
    advanced_seo_research: false,
    blog_posting: false,
    strategic_planning: false,
    trend_research: false,
    advanced_visual_research: false,
    whatsapp_assistant_access: false,
  },
  seo: {
    google_growth_level: "basic",
    seo_level: "basic",
    seo_execution: true,
    social_autopilot: true,
    direct_publishing: false,
    logo_brand_kit: false,
    landing_page: false,
    landing_page_bonus: false,
    website_included: false,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: false,
    advanced_seo_research: false,
    blog_posting: false,
    strategic_planning: false,
    trend_research: false,
    advanced_visual_research: false,
    whatsapp_assistant_access: false,
  },
  social: {
    google_growth_level: "basic",
    seo_level: "basic",
    seo_execution: false,
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: false,
    landing_page_bonus: false,
    website_included: false,
    website_commitment_months: 0,
    premium_content: true,
    advanced_competitor_research: false,
    advanced_seo_research: false,
    blog_posting: false,
    strategic_planning: false,
    trend_research: false,
    advanced_visual_research: false,
    whatsapp_assistant_access: false,
  },
  seo_and_social: {
    google_growth_level: "basic",
    seo_level: "basic",
    seo_execution: true,
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: false,
    landing_page_bonus: false,
    website_included: false,
    website_commitment_months: 0,
    premium_content: true,
    advanced_competitor_research: false,
    advanced_seo_research: false,
    blog_posting: false,
    strategic_planning: false,
    trend_research: false,
    advanced_visual_research: false,
    whatsapp_assistant_access: false,
  },
  advanced_seo: {
    google_growth_level: "advanced",
    seo_level: "advanced",
    seo_execution: true,
    social_autopilot: true,
    direct_publishing: false,
    logo_brand_kit: false,
    landing_page: false,
    landing_page_bonus: false,
    website_included: false,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: true,
    advanced_seo_research: true,
    blog_posting: true,
    strategic_planning: false,
    trend_research: false,
    advanced_visual_research: false,
    whatsapp_assistant_access: false,
  },
  advanced_social: {
    google_growth_level: "basic",
    seo_level: "basic",
    seo_execution: false,
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: false,
    landing_page_bonus: false,
    website_included: false,
    website_commitment_months: 0,
    premium_content: true,
    advanced_competitor_research: true,
    advanced_seo_research: false,
    blog_posting: false,
    strategic_planning: true,
    trend_research: true,
    advanced_visual_research: true,
    whatsapp_assistant_access: false,
  },
  advanced_growth: {
    google_growth_level: "advanced",
    seo_level: "advanced",
    seo_execution: true,
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: true,
    landing_page_bonus: true, // FREE basic landing page bonus
    website_included: true,
    website_commitment_months: 0,
    premium_content: true,
    advanced_competitor_research: true,
    advanced_seo_research: true,
    blog_posting: true,
    strategic_planning: true,
    trend_research: true,
    advanced_visual_research: true,
    whatsapp_assistant_access: true, // WhatsApp Autopilot unlocked
  },
  website_landing_page: {
    google_growth_level: "basic",
    seo_level: "basic",
    seo_execution: false,
    social_autopilot: true,
    direct_publishing: false,
    logo_brand_kit: true,
    landing_page: true,
    landing_page_bonus: false,
    website_included: true,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: false,
    advanced_seo_research: false,
    blog_posting: false,
    strategic_planning: false,
    trend_research: false,
    advanced_visual_research: false,
    whatsapp_assistant_access: false,
  },
  website_standard: {
    google_growth_level: "basic",
    seo_level: "basic",
    seo_execution: false,
    social_autopilot: true,
    direct_publishing: false,
    logo_brand_kit: true,
    landing_page: true,
    landing_page_bonus: false,
    website_included: true,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: false,
    advanced_seo_research: false,
    blog_posting: false,
    strategic_planning: false,
    trend_research: false,
    advanced_visual_research: false,
    whatsapp_assistant_access: false,
  },
  website_custom: {
    google_growth_level: "basic",
    seo_level: "basic",
    seo_execution: false,
    social_autopilot: true,
    direct_publishing: false,
    logo_brand_kit: true,
    landing_page: true,
    landing_page_bonus: false,
    website_included: true,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: false,
    advanced_seo_research: false,
    blog_posting: false,
    strategic_planning: false,
    trend_research: false,
    advanced_visual_research: false,
    whatsapp_assistant_access: false,
  },

  // Legacy capabilities
  starter: {
    google_growth_level: "basic",
    seo_level: "basic",
    seo_execution: true,
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: false,
    landing_page_bonus: false,
    website_included: false,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: false,
    advanced_seo_research: false,
    blog_posting: false,
    strategic_planning: false,
    trend_research: false,
    advanced_visual_research: false,
    whatsapp_assistant_access: false,
  },
  growth: {
    google_growth_level: "advanced",
    seo_level: "advanced",
    seo_execution: true,
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: true,
    landing_page_bonus: false,
    website_included: false,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: true,
    advanced_seo_research: true,
    blog_posting: true,
    strategic_planning: true,
    trend_research: true,
    advanced_visual_research: true,
    whatsapp_assistant_access: false,
  },
  business: {
    google_growth_level: "maximum",
    seo_level: "maximum",
    seo_execution: true,
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: true,
    landing_page_bonus: false,
    website_included: true,
    website_commitment_months: 3,
    premium_content: true,
    advanced_competitor_research: true,
    advanced_seo_research: true,
    blog_posting: true,
    strategic_planning: true,
    trend_research: true,
    advanced_visual_research: true,
    whatsapp_assistant_access: true,
  },
  launch: {
    google_growth_level: "basic",
    seo_level: "basic",
    seo_execution: true,
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: false,
    landing_page_bonus: false,
    website_included: false,
    website_commitment_months: 0,
    premium_content: false,
    advanced_competitor_research: false,
    advanced_seo_research: false,
    blog_posting: false,
    strategic_planning: false,
    trend_research: false,
    advanced_visual_research: false,
    whatsapp_assistant_access: false,
  },
  custom_growth: {
    google_growth_level: "maximum",
    seo_level: "maximum",
    seo_execution: true,
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: true,
    landing_page_bonus: false,
    website_included: true,
    website_commitment_months: 0,
    premium_content: true,
    advanced_competitor_research: true,
    advanced_seo_research: true,
    blog_posting: true,
    strategic_planning: true,
    trend_research: true,
    advanced_visual_research: true,
    whatsapp_assistant_access: true,
  },
  scale: {
    google_growth_level: "maximum",
    seo_level: "maximum",
    seo_execution: true,
    social_autopilot: true,
    direct_publishing: true,
    logo_brand_kit: true,
    landing_page: true,
    landing_page_bonus: false,
    website_included: true,
    website_commitment_months: 0,
    premium_content: true,
    advanced_competitor_research: true,
    advanced_seo_research: true,
    blog_posting: true,
    strategic_planning: true,
    trend_research: true,
    advanced_visual_research: true,
    whatsapp_assistant_access: true,
  },
};

export function getPlanCapabilities(tier: string): PlanCapabilities {
  return PLAN_CAPABILITIES[tier] ?? PLAN_CAPABILITIES.free;
}

export function hasCapability<K extends keyof PlanCapabilities>(
  tier: string,
  key: K
): PlanCapabilities[K] {
  return (PLAN_CAPABILITIES[tier] ?? PLAN_CAPABILITIES.free)[key];
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
  | "social_autopilot_manual_monthly"
  | "image_generation_attempts_monthly"
  | "copilot_monthly_uses";

export interface EntitlementStatus {
  metric: EntitlementMetric;
  limit: number;
  currentUsage: number;
  remaining: number;
  isPaused: boolean;
  hasCapacity: boolean;
}

/**
 * Central tenant-safe entitlement check.
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
    isPaused = true;
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
