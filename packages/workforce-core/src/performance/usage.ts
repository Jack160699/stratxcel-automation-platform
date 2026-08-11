/**
 * Usage / entitlement reporting — billing truth only.
 */

import type { UsageAccountingRow } from "./types.ts";

export interface BillingEntitlementTruth {
  metric: string;
  included: number;
  used: number;
  isPaused?: boolean;
}

export function toUsageAccounting(rows: readonly BillingEntitlementTruth[]): UsageAccountingRow[] {
  return rows.map((row) => {
    const included = Number.isFinite(row.included) ? row.included : 0;
    const used = Number.isFinite(row.used) ? row.used : 0;
    const remaining = Math.max(0, included - used);
    const blocked = row.isPaused === true || remaining <= 0;
    return {
      metric: row.metric,
      included,
      used,
      remaining,
      blocked,
      source: "billing_usage_entitlements" as const,
    };
  });
}

export function unusedEntitlements(rows: readonly UsageAccountingRow[]): UsageAccountingRow[] {
  return rows.filter((r) => r.remaining > 0 && !r.blocked);
}
