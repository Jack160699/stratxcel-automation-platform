// Run with: node --experimental-strip-types lib/audit/__tests__/audit-entitlement.test.ts
//
// Hermes platform-restructure mission Sections 43-49/65/88: a real,
// subscription-scoped 5/month audit allowance. Tests the real fail-open
// behavior against a minimal fake Supabase client, no live project needed.
import assert from "node:assert/strict";
import { consumeAuditIfSubscribed, ensureAuditAllowanceCurrent, MONTHLY_AUDIT_ALLOWANCE } from "../audit-entitlement.ts";

type SubRow = { id: string; current_period_start: string } | null;
type EntRow = { id: string; current_usage: number; updated_at: string; limit_amount?: number } | null;

function fakeService(opts: { subscription: SubRow; entitlement: EntRow; onUpdate?: (patch: Record<string, unknown>) => void; onInsert?: (row: Record<string, unknown>) => void }) {
  let entitlement = opts.entitlement;
  return {
    from(table: string) {
      if (table === "subscriptions") {
        return {
          select() { return this; },
          eq() { return this; },
          not() { return this; },
          order() { return this; },
          limit() { return this; },
          async maybeSingle() { return { data: opts.subscription, error: null }; },
        };
      }
      if (table === "usage_entitlements") {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: entitlement, error: null }; },
          async insert(row: Record<string, unknown>) {
            opts.onInsert?.(row);
            entitlement = { id: "new-row", current_usage: (row.current_usage as number) ?? 0, updated_at: new Date().toISOString() };
            return { data: null, error: null };
          },
          update(patch: Record<string, unknown>) {
            opts.onUpdate?.(patch);
            return {
              eq: async () => {
                if (entitlement) entitlement = { ...entitlement, current_usage: (patch.current_usage as number) ?? entitlement.current_usage, updated_at: new Date().toISOString() };
                return { data: null, error: null };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as never;
}

async function testNoActiveSubscriptionIsANoOp() {
  const service = fakeService({ subscription: null, entitlement: null });
  const state = await ensureAuditAllowanceCurrent(service, "t1");
  assert.equal(state, null, "a tenant with no active subscription must get no allowance state at all");

  const result = await consumeAuditIfSubscribed(service, "t1");
  assert.deepEqual(result, { hasActiveSubscription: false, consumed: false, remaining: null }, "must be a real, honest no-op — never blocks the free onboarding audit for a non-subscriber");
  console.log("audit-entitlement.test.ts: no active subscription is a real no-op — PASS");
}

async function testFirstEverGrantCreatesTheRealRow() {
  let inserted: Record<string, unknown> | null = null;
  const service = fakeService({
    subscription: { id: "sub1", current_period_start: new Date().toISOString() },
    entitlement: null,
    onInsert: (row) => { inserted = row; },
  });
  const state = await ensureAuditAllowanceCurrent(service, "t1");
  assert.equal(state?.remaining, MONTHLY_AUDIT_ALLOWANCE);
  assert.equal((inserted as unknown as Record<string, unknown>).metric, "audit_requests");
  assert.equal((inserted as unknown as Record<string, unknown>).limit_amount, MONTHLY_AUDIT_ALLOWANCE);
  console.log("audit-entitlement.test.ts: first-ever grant creates a real 5-unit allowance row — PASS");
}

async function testStaleRowResetsOnNewPeriod() {
  const oldPeriodStart = new Date(Date.now() - 20 * 86_400_000).toISOString(); // 20 days ago
  const staleRowUpdatedAt = new Date(Date.now() - 40 * 86_400_000).toISOString(); // 40 days ago -- before the new period started
  let updatePatch: Record<string, unknown> | null = null;
  const service = fakeService({
    subscription: { id: "sub1", current_period_start: oldPeriodStart },
    entitlement: { id: "row1", current_usage: 5, updated_at: staleRowUpdatedAt },
    onUpdate: (patch) => { updatePatch = patch; },
  });
  const state = await ensureAuditAllowanceCurrent(service, "t1");
  assert.equal(state?.used, 0, "a row from a prior billing period must reset used count to 0");
  assert.equal(state?.remaining, MONTHLY_AUDIT_ALLOWANCE);
  assert.equal((updatePatch as unknown as Record<string, unknown>).current_usage, 0);
  console.log("audit-entitlement.test.ts: a stale (prior-period) row resets on the real subscription's own period start — PASS");
}

async function testFreshRowIsNotReset() {
  const periodStart = new Date(Date.now() - 40 * 86_400_000).toISOString();
  const freshRowUpdatedAt = new Date().toISOString(); // updated after the period started
  const service = fakeService({
    subscription: { id: "sub1", current_period_start: periodStart },
    entitlement: { id: "row1", current_usage: 3, updated_at: freshRowUpdatedAt },
  });
  const state = await ensureAuditAllowanceCurrent(service, "t1");
  assert.equal(state?.used, 3, "a row already current for this period must not be reset");
  assert.equal(state?.remaining, MONTHLY_AUDIT_ALLOWANCE - 3);
  console.log("audit-entitlement.test.ts: a fresh (current-period) row is never reset mid-period — PASS");
}

async function testNeverThrows() {
  const throwingService = {
    from() {
      throw new Error("simulated DB outage");
    },
  } as never;
  const result = await consumeAuditIfSubscribed(throwingService, "t1");
  assert.deepEqual(result, { hasActiveSubscription: false, consumed: false, remaining: null });
  console.log("audit-entitlement.test.ts: a DB failure never throws into the real audit generation it observes — PASS");
}

async function run() {
  await testNoActiveSubscriptionIsANoOp();
  await testFirstEverGrantCreatesTheRealRow();
  await testStaleRowResetsOnNewPeriod();
  await testFreshRowIsNotReset();
  await testNeverThrows();
  console.log("audit-entitlement.test.ts: ALL PASS");
}

run();
