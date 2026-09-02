// Run with: node --experimental-strip-types lib/agent-core/__tests__/business-priorities.test.ts
import assert from "node:assert/strict";
import { computeRealEntitlementSnapshot } from "../business-priorities.ts";

type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            async eq(column: string, value: string) {
              const rows = (tables[table] ?? []).filter((r) => r[column] === value);
              return { data: rows, error: null };
            },
          };
        },
      };
    },
  };
}

async function run() {
  // No real rows anywhere: honest empty/UNKNOWN snapshot, never fabricated.
  {
    const supabase = fakeSupabase({});
    const snap = await computeRealEntitlementSnapshot(supabase, "t1");
    assert.equal(snap.allocationPolicy, "UNKNOWN");
    assert.deepEqual(snap.packageComposition, []);
    assert.deepEqual(snap.relevantEntitlements, {});
    assert.equal(snap.planTier, undefined);
    assert.equal(snap.subscriptionId, null);
    assert.deepEqual(snap.purchasedServiceKeys, []);
  }

  // A real active subscription + real usage rows populate the snapshot from evidence.
  {
    const supabase = fakeSupabase({
      subscriptions: [
        { id: "sub1", tenant_id: "t1", plan_tier: "advanced_growth", status: "active", current_period_start: "2026-08-01T00:00:00Z", current_period_end: "2026-09-01T00:00:00Z" },
        { id: "sub_old", tenant_id: "t1", plan_tier: "starter", status: "cancelled", current_period_start: null, current_period_end: null },
      ],
      usage_entitlements: [
        { id: "u1", tenant_id: "t1", metric: "social_posts", limit_amount: 28, current_usage: 10 },
        { id: "u2", tenant_id: "t1", metric: "whatsapp_contacts", limit_amount: 500, current_usage: 120 },
      ],
    });
    const snap = await computeRealEntitlementSnapshot(supabase, "t1");
    assert.equal(snap.planTier, "advanced_growth"); // the active sub, not the cancelled one
    assert.equal(snap.subscriptionId, "sub1");
    assert.equal(snap.relevantEntitlements.social_posts, 28);
    assert.equal(snap.currentUsage?.social_posts, 10);
    assert.equal(snap.relevantEntitlements.whatsapp_contacts, 500);
    assert.deepEqual(snap.purchasedServiceKeys, ["advanced_growth"]);
  }

  // A completed audit adds a real, evidence-backed purchasedServiceKeys entry.
  {
    const supabase = fakeSupabase({
      audit_orders: [
        { id: "a1", tenant_id: "t1", audit_completed_at: "2026-08-15T00:00:00Z" },
        { id: "a2", tenant_id: "t1", audit_completed_at: null }, // not completed -- must not count
      ],
    });
    const snap = await computeRealEntitlementSnapshot(supabase, "t1");
    assert.deepEqual(snap.purchasedServiceKeys, ["brand_audit"]);
  }

  // No subscription at all with only an incomplete audit order: honestly empty, never guessed.
  {
    const supabase = fakeSupabase({
      audit_orders: [{ id: "a1", tenant_id: "t1", audit_completed_at: null }],
    });
    const snap = await computeRealEntitlementSnapshot(supabase, "t1");
    assert.deepEqual(snap.purchasedServiceKeys, []);
  }

  console.log("business-priorities.test.ts (lib/agent-core): ALL PASS");
}

run();
