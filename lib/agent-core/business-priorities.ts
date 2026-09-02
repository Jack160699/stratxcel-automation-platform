/**
 * Real BusinessGrowthEntitlementSnapshot builder -- the other real input
 * diagnoseBusinessGrowth/resolveEntryMode (packages/workforce-core/src/
 * planning/diagnosis.ts) needs alongside BusinessSignals (business-signals.ts).
 * Every real production caller of snapshotFromContract (packages/workforce-
 * core/src/planning/allocation.ts) is a test/fixture -- this is the first
 * one built from live tables: subscriptions, usage_entitlements, audit_orders.
 *
 * allocationPolicy is honestly "UNKNOWN": no per-tenant contract-level
 * composition policy (FIXED_COMPOSITION/FLEXIBLE_COMPOSITION/etc.) is stored
 * anywhere in this schema today -- "UNKNOWN" is the type's own real,
 * intended value for exactly this case (see AllocationPolicy,
 * packages/workforce-core/src/planning/types.ts), not a placeholder standing
 * in for something real. packageComposition is honestly `[]` for the same
 * reason -- PLAN_LIMITS/PLAN_CAPABILITIES (packages/payments-and-wallet/src/
 * entitlements.ts) define numeric usage ceilings per plan tier, a different
 * concept from the planning engine's per-tenant content-mix composition,
 * which no table captures.
 */
import type { BusinessGrowthEntitlementSnapshot, AllocationPolicy } from "@stratxcel/workforce-core";

interface MinimalSupabase {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

export async function computeRealEntitlementSnapshot(
  supabase: MinimalSupabase,
  tenantId: string,
): Promise<BusinessGrowthEntitlementSnapshot> {
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id, plan_tier, status, current_period_start, current_period_end")
    .eq("tenant_id", tenantId);
  const subRows = (subs ?? []) as Array<{
    id: string;
    plan_tier: string;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
  }>;
  const activeSub = subRows.find((s) => s.status === "active") ?? null;

  const { data: usage } = await supabase
    .from("usage_entitlements")
    .select("metric, limit_amount, current_usage")
    .eq("tenant_id", tenantId);
  const usageRows = (usage ?? []) as Array<{ metric: string; limit_amount: number; current_usage: number }>;
  const relevantEntitlements: Record<string, number> = {};
  const currentUsage: Record<string, number> = {};
  for (const row of usageRows) {
    relevantEntitlements[row.metric] = row.limit_amount;
    currentUsage[row.metric] = row.current_usage;
  }

  // brand_audit: a real, evidence-backed purchase signal -- an audit_orders
  // row with a real completion timestamp, not a guess from plan tier.
  const { data: auditOrders } = await supabase.from("audit_orders").select("id, audit_completed_at").eq("tenant_id", tenantId);
  const hasCompletedAudit = ((auditOrders ?? []) as Array<{ id: string; audit_completed_at: string | null }>).some(
    (r) => r.audit_completed_at,
  );

  const purchasedServiceKeys: string[] = [];
  if (activeSub?.plan_tier) purchasedServiceKeys.push(activeSub.plan_tier);
  if (hasCompletedAudit) purchasedServiceKeys.push("brand_audit");

  const allocationPolicy: AllocationPolicy = "UNKNOWN";

  return {
    allocationPolicy,
    packageComposition: [],
    relevantEntitlements,
    currentUsage,
    planTier: activeSub?.plan_tier,
    subscriptionId: activeSub?.id ?? null,
    periodStartIso: activeSub?.current_period_start ?? undefined,
    periodEndIso: activeSub?.current_period_end ?? undefined,
    purchasedServiceKeys,
  };
}
