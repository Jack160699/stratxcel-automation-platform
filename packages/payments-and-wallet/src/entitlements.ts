import type { ServiceClient } from "./db.ts";
import { PLANS, type PlanId } from "./plans.ts";

export interface PlanEntitlementLimits { social_posts: number; meta_ad_campaigns: number; whatsapp_contacts: number; website_maintenance: number; }
export const PLAN_LIMITS: Record<PlanId, PlanEntitlementLimits> = Object.fromEntries(Object.values(PLANS).map((plan) => [plan.id, { social_posts: plan.entitlements.managedPosts, meta_ad_campaigns: plan.entitlements.campaigns, whatsapp_contacts: plan.entitlements.aiHandledLeads, website_maintenance: plan.entitlements.websites }])) as Record<PlanId, PlanEntitlementLimits>;
export type MeteredMetric = keyof PlanEntitlementLimits;
export interface CheckUsageResult { metric: string; limit: number; currentUsage: number; percentage: number; isPaused: boolean; notificationTriggered: "80" | "90" | "100" | null; continuityMode: "normal" | "capture_only"; }

export async function recordMetricUsage(supabase: ServiceClient, tenantId: string, metric: MeteredMetric, incrementBy = 1): Promise<CheckUsageResult> {
  const { data: entitlement, error } = await supabase.from("usage_entitlements").select("*").eq("tenant_id", tenantId).eq("metric", metric).maybeSingle();
  if (error || !entitlement) return { metric, limit: 0, currentUsage: incrementBy, percentage: 100, isPaused: true, notificationTriggered: null, continuityMode: metric === "whatsapp_contacts" ? "capture_only" : "normal" };
  const newUsage = entitlement.current_usage + incrementBy;
  const limit = entitlement.limit_amount;
  const percentage = limit > 0 ? Math.round((newUsage / limit) * 100) : 100;
  let trigger: "80" | "90" | "100" | null = null;
  let update80 = entitlement.notification_sent_80;
  let update90 = entitlement.notification_sent_90;
  let update100 = entitlement.notification_sent_100;
  let isPaused = entitlement.is_paused;
  if (percentage >= 100 && !update100) { trigger = "100"; update100 = true; isPaused = true; }
  else if (percentage >= 90 && !update90) { trigger = "90"; update90 = true; }
  else if (percentage >= 80 && !update80) { trigger = "80"; update80 = true; }
  await supabase.from("usage_entitlements").update({ current_usage: newUsage, notification_sent_80: update80, notification_sent_90: update90, notification_sent_100: update100, is_paused: isPaused, updated_at: new Date().toISOString() }).eq("id", entitlement.id);
  return { metric, limit, currentUsage: newUsage, percentage, isPaused, notificationTriggered: trigger, continuityMode: metric === "whatsapp_contacts" && percentage >= 100 ? "capture_only" : "normal" };
}
