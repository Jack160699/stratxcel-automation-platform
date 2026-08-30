import type { ServiceClient } from "@stratxcel/payments-and-wallet";
import { hasEntitlement, recordMetricUsage } from "@stratxcel/payments-and-wallet";

/**
 * Hermes platform-restructure mission Sections 43-49/65/88: every tenant
 * with a real active subscription gets a real, subscription-scoped monthly
 * allowance of free audits. Confirmed live before writing this: no such
 * allowance existed anywhere in the codebase -- the real audit product was
 * either a standalone ₹999 paid order, or the unconditional free onboarding
 * audit every signup already gets regardless of subscription (that free
 * onboarding audit is completely UNCHANGED by this module -- see
 * consumeAuditIfSubscribed's fail-open behavior below).
 */
export const MONTHLY_AUDIT_ALLOWANCE = 5;

interface ActiveSubscriptionRow {
  id: string;
  current_period_start: string;
}

async function loadActiveSubscription(service: ServiceClient, tenantId: string): Promise<ActiveSubscriptionRow | null> {
  const { data } = await service
    .from("subscriptions")
    .select("id, current_period_start")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .not("current_period_start", "is", null)
    .order("current_period_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !data.current_period_start) return null;
  return data as ActiveSubscriptionRow;
}

/**
 * Grants (or resets, on a new billing period) this tenant's real 5/month
 * audit_requests entitlement, IF they have a real active subscription.
 * Never called for a tenant with no active subscription -- that tenant's
 * onboarding audit stays exactly the existing, unconditional free flow.
 *
 * Reset is derived from the real subscription's own current_period_start
 * (never a separately-invented billing calendar): if the existing
 * usage_entitlements row for audit_requests was last updated BEFORE the
 * subscription's current real period began, the tenant has rolled into a
 * new period and the allowance resets to 0 used / 5 available.
 */
export async function ensureAuditAllowanceCurrent(
  service: ServiceClient,
  tenantId: string
): Promise<{ hasActiveSubscription: boolean; limit: number; used: number; remaining: number } | null> {
  const subscription = await loadActiveSubscription(service, tenantId);
  if (!subscription) return null;

  const { data: existing } = await service
    .from("usage_entitlements")
    .select("id, current_usage, updated_at")
    .eq("tenant_id", tenantId)
    .eq("metric", "audit_requests")
    .maybeSingle();

  const periodStart = new Date(subscription.current_period_start).getTime();
  const rowIsStale = !existing || new Date(existing.updated_at).getTime() < periodStart;

  if (!existing) {
    await service.from("usage_entitlements").insert({
      tenant_id: tenantId,
      subscription_id: subscription.id,
      metric: "audit_requests",
      base_limit_amount: MONTHLY_AUDIT_ALLOWANCE,
      bonus_limit_amount: 0,
      limit_amount: MONTHLY_AUDIT_ALLOWANCE,
      current_usage: 0,
      is_paused: false,
    });
    return { hasActiveSubscription: true, limit: MONTHLY_AUDIT_ALLOWANCE, used: 0, remaining: MONTHLY_AUDIT_ALLOWANCE };
  }

  if (rowIsStale) {
    await service
      .from("usage_entitlements")
      .update({
        subscription_id: subscription.id,
        base_limit_amount: MONTHLY_AUDIT_ALLOWANCE,
        limit_amount: MONTHLY_AUDIT_ALLOWANCE,
        current_usage: 0,
        is_paused: false,
        notification_sent_80: false,
        notification_sent_90: false,
        notification_sent_100: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return { hasActiveSubscription: true, limit: MONTHLY_AUDIT_ALLOWANCE, used: 0, remaining: MONTHLY_AUDIT_ALLOWANCE };
  }

  return {
    hasActiveSubscription: true,
    limit: MONTHLY_AUDIT_ALLOWANCE,
    used: existing.current_usage,
    remaining: Math.max(0, MONTHLY_AUDIT_ALLOWANCE - existing.current_usage),
  };
}

/**
 * Best-effort consumption of 1 unit of the real monthly audit allowance,
 * called right where a real audit is about to start processing (the
 * onboarding trigger today -- app/api/platform/onboarding/route.ts).
 *
 * Fail-open by design (Section 44's own requirement is additive, not a new
 * restriction): a tenant with NO active subscription yet returns
 * { hasActiveSubscription: false } and consumes nothing -- the existing,
 * unconditional free onboarding audit every new signup gets is completely
 * unaffected. A tenant WITH an active subscription but zero allowance
 * remaining returns { consumed: false, remaining: 0 } -- callers decide
 * whether that should block a LATER re-run; it must never block the
 * onboarding audit itself, which this module is never wired to block.
 */
export async function consumeAuditIfSubscribed(
  service: ServiceClient,
  tenantId: string
): Promise<{ hasActiveSubscription: boolean; consumed: boolean; remaining: number | null }> {
  try {
    const state = await ensureAuditAllowanceCurrent(service, tenantId);
    if (!state) return { hasActiveSubscription: false, consumed: false, remaining: null };

    const canConsume = await hasEntitlement(service, tenantId, "audit_requests", 1);
    if (!canConsume) {
      return { hasActiveSubscription: true, consumed: false, remaining: 0 };
    }

    const result = await recordMetricUsage(service, tenantId, "audit_requests", 1);
    return {
      hasActiveSubscription: true,
      consumed: true,
      remaining: Math.max(0, result.limit - result.currentUsage),
    };
  } catch {
    // Best-effort only -- a failure here must never block the real audit
    // generation this observes, same discipline as recordAudit() elsewhere.
    return { hasActiveSubscription: false, consumed: false, remaining: null };
  }
}
