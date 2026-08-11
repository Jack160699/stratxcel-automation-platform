import type { BusinessGrowthEntitlementSnapshot } from "../../planning/types.ts";
import type { EntitlementHealth, EntitlementHealthRecord, PaymentState } from "../types.ts";

const LOW_REMAINING_RATIO = 0.2;

function periodExpired(snapshot: BusinessGrowthEntitlementSnapshot, now = Date.now()): boolean {
  if (!snapshot.periodEndIso) return false;
  const end = Date.parse(snapshot.periodEndIso);
  return Number.isFinite(end) && end < now;
}

function metricKeys(snapshot: BusinessGrowthEntitlementSnapshot): string[] {
  const keys = new Set<string>([
    ...Object.keys(snapshot.relevantEntitlements ?? {}),
    ...Object.keys(snapshot.currentUsage ?? {}),
    ...Object.keys(snapshot.remainingUsage ?? {}),
  ]);
  return [...keys];
}

function healthForMetric(
  snapshot: BusinessGrowthEntitlementSnapshot,
  metric: string,
  paymentState: PaymentState,
): EntitlementHealthRecord {
  if (paymentState === "failed" || paymentState === "past_due" || paymentState === "paused") {
    return {
      metric,
      health: "PAUSED",
      limit: snapshot.relevantEntitlements[metric] ?? null,
      used: snapshot.currentUsage?.[metric] ?? null,
      remaining: snapshot.remainingUsage?.[metric] ?? null,
      reason: `payment_state_${paymentState}`,
    };
  }
  if (paymentState === "cancelled" || periodExpired(snapshot)) {
    return {
      metric,
      health: "EXPIRED",
      limit: snapshot.relevantEntitlements[metric] ?? null,
      used: snapshot.currentUsage?.[metric] ?? null,
      remaining: snapshot.remainingUsage?.[metric] ?? null,
      reason: paymentState === "cancelled" ? "subscription_cancelled" : "period_ended",
    };
  }

  const limit = snapshot.relevantEntitlements[metric];
  if (limit == null || !Number.isFinite(limit)) {
    return {
      metric,
      health: "CONFIGURATION_REQUIRED",
      limit: null,
      used: snapshot.currentUsage?.[metric] ?? null,
      remaining: null,
      reason: "missing_entitlement_limit",
    };
  }

  const used = snapshot.currentUsage?.[metric] ?? 0;
  const remainingExplicit = snapshot.remainingUsage?.[metric];
  const remaining = remainingExplicit != null ? remainingExplicit : Math.max(0, limit - used);

  let health: EntitlementHealth;
  let reason: string;
  if (remaining <= 0 || used >= limit) {
    health = "EXHAUSTED";
    reason = "usage_reached_limit";
  } else if (remaining / limit <= LOW_REMAINING_RATIO) {
    health = "LOW_REMAINING";
    reason = "below_20_percent_remaining";
  } else {
    health = "ACTIVE";
    reason = "within_entitlement";
  }

  return { metric, health, limit, used, remaining, reason };
}

/**
 * EntitlementHealth from billing truth — never invents consumption.
 * Payment failure forces PAUSED across metrics (surfaces risk without mutating).
 */
export function evaluateEntitlementHealth(
  snapshot: BusinessGrowthEntitlementSnapshot,
  paymentState: PaymentState = "current",
): EntitlementHealthRecord[] {
  const keys = metricKeys(snapshot);
  if (keys.length === 0) {
    if (paymentState === "failed" || paymentState === "past_due" || paymentState === "paused") {
      return [{
        metric: "subscription",
        health: "PAUSED",
        limit: null,
        used: null,
        remaining: null,
        reason: `payment_state_${paymentState}`,
      }];
    }
    if (snapshot.allocationPolicy === "UNKNOWN" && !(snapshot.purchasedServiceKeys?.length)) {
      return [{
        metric: "subscription",
        health: "CONFIGURATION_REQUIRED",
        limit: null,
        used: null,
        remaining: null,
        reason: "no_entitlement_metrics",
      }];
    }
    if (paymentState === "cancelled" || periodExpired(snapshot)) {
      return [{
        metric: "subscription",
        health: "EXPIRED",
        limit: null,
        used: null,
        remaining: null,
        reason: "subscription_inactive",
      }];
    }
    return [{
      metric: "subscription",
      health: "ACTIVE",
      limit: null,
      used: null,
      remaining: null,
      reason: "service_keys_only",
    }];
  }

  // When payment failed, every metric is PAUSED (test: every h.health === PAUSED)
  if (paymentState === "failed" || paymentState === "past_due" || paymentState === "paused") {
    return keys.map((metric) => healthForMetric(snapshot, metric, paymentState));
  }

  return keys.map((metric) => healthForMetric(snapshot, metric, paymentState));
}

export function isPlanExhausted(health: readonly EntitlementHealthRecord[]): boolean {
  const tracked = health.filter((h) => h.limit != null || h.health === "EXHAUSTED");
  if (tracked.length === 0) return false;
  const hasExhausted = tracked.some((h) => h.health === "EXHAUSTED");
  const hasUsable = tracked.some((h) => h.health === "ACTIVE" || h.health === "LOW_REMAINING");
  return hasExhausted && !hasUsable;
}
