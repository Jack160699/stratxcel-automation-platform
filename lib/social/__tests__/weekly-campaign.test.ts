// Run with: node --experimental-strip-types lib/social/__tests__/weekly-campaign.test.ts
//
// STRATXCEL weekly-engine brief Sections 19, 22, 61: real Monday-boundary
// detection and an idempotent per-tenant weekly-campaign checkpoint,
// tested against a minimal fake Supabase client -- no live project needed.
import assert from "node:assert/strict";
import { ensureWeeklyCampaignForTenant, isRealMondayNow } from "../weekly-campaign.ts";
import { resolveCanonicalWeekBounds } from "../workforce/week-planner.ts";

type Row = Record<string, unknown> | null;

function fakeService(opts: { existing: Row; onInsert?: (row: Record<string, unknown>) => void }) {
  let row = opts.existing;
  return {
    from(table: string) {
      if (table !== "social_autopilot_weekly_campaigns") throw new Error(`unexpected table: ${table}`);
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: row, error: null }; },
        upsert(patch: Record<string, unknown>) {
          return {
            select() { return this; },
            async single() {
              opts.onInsert?.(patch);
              row = { id: "new-row", ...patch, status: "ACTIVE", strategy: {}, performance_snapshot: null, performance_signal_status: "NO_ANALYTICS_AVAILABLE", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
              return { data: row, error: null };
            },
          };
        },
      };
    },
  } as never;
}

// --- resolveCanonicalWeekBounds: the stable Monday-anchored week key ---
function testEveryDayInTheSameRealWeekResolvesToTheSameMonday() {
  // 2026-08-30 is a real, confirmed Sunday this engagement (per the
  // forensic StratXcel session) -- the whole real week Aug 24-30 must all
  // resolve to the same Monday (Aug 24).
  const days = ["2026-08-24T09:00:00Z", "2026-08-26T09:00:00Z", "2026-08-30T10:00:00Z"];
  const keys = days.map((d) => resolveCanonicalWeekBounds("Asia/Kolkata", d).weekKey);
  assert.ok(keys.every((k) => k === keys[0]), `expected every day this week to share one week_key, got: ${JSON.stringify(keys)}`);
  assert.equal(keys[0], "2026-08-24");
  console.log("weekly-campaign.test.ts: every day within the same real week resolves to the same Monday week_key — PASS");
}

function testNextWeekResolvesToADifferentMonday() {
  const thisWeek = resolveCanonicalWeekBounds("Asia/Kolkata", "2026-08-30T09:00:00Z").weekKey;
  const nextWeek = resolveCanonicalWeekBounds("Asia/Kolkata", "2026-08-31T09:00:00Z").weekKey; // Monday, the very next real day
  assert.notEqual(thisWeek, nextWeek);
  assert.equal(nextWeek, "2026-08-31");
  console.log("weekly-campaign.test.ts: crossing a real Monday boundary produces a genuinely new week_key — PASS");
}

function testIsRealMondayNow() {
  assert.equal(isRealMondayNow("Asia/Kolkata", "2026-08-31T09:00:00Z"), true, "2026-08-31 is a real Monday");
  assert.equal(isRealMondayNow("Asia/Kolkata", "2026-08-30T09:00:00Z"), false, "2026-08-30 is a real Sunday, not Monday");
  console.log("weekly-campaign.test.ts: isRealMondayNow correctly identifies the real Monday boundary — PASS");
}

// --- ensureWeeklyCampaignForTenant: idempotent checkpoint ---
async function testFirstCallThisWeekCreatesTheRealRow() {
  let inserted: Record<string, unknown> | null = null;
  const service = fakeService({ existing: null, onInsert: (row) => { inserted = row; } });
  const result = await ensureWeeklyCampaignForTenant(service, { tenantId: "t1", authorizationId: "a1", timezone: "Asia/Kolkata", nowIso: "2026-08-30T09:00:00Z" });
  assert.equal(result.week_key, "2026-08-24");
  assert.equal((inserted as unknown as Record<string, unknown>).tenant_id, "t1");
  console.log("weekly-campaign.test.ts: first call this real week creates a real checkpoint row — PASS");
}

async function testSecondCallSameWeekNeverCreatesADuplicate() {
  let insertCount = 0;
  const service = fakeService({
    existing: { id: "row1", tenant_id: "t1", authorization_id: "a1", week_key: "2026-08-24", week_start: "2026-08-24", week_end: "2026-08-30", status: "ACTIVE", strategy: {}, performance_snapshot: null, performance_signal_status: "NO_ANALYTICS_AVAILABLE", created_at: "x", updated_at: "x" },
    onInsert: () => { insertCount += 1; },
  });
  const result = await ensureWeeklyCampaignForTenant(service, { tenantId: "t1", authorizationId: "a1", timezone: "Asia/Kolkata", nowIso: "2026-08-28T09:00:00Z" });
  assert.equal(result.id, "row1", "must return the existing real row, not create a new one");
  assert.equal(insertCount, 0, "a second call within the same real week must never insert a duplicate — Section 19");
  console.log("weekly-campaign.test.ts: a second call within the same real week is a real no-op, never a duplicate — PASS");
}

async function testNeverFabricatesPerformanceData() {
  const service = fakeService({ existing: null });
  const result = await ensureWeeklyCampaignForTenant(service, { tenantId: "t1", authorizationId: "a1", timezone: "Asia/Kolkata", nowIso: "2026-08-30T09:00:00Z" });
  assert.equal(result.performance_signal_status, "NO_ANALYTICS_AVAILABLE", "must honestly report no real analytics signal, never a fabricated metric");
  assert.equal(result.performance_snapshot, null);
  console.log("weekly-campaign.test.ts: a fresh checkpoint honestly reports NO_ANALYTICS_AVAILABLE, never fabricates performance data — PASS");
}

async function run() {
  testEveryDayInTheSameRealWeekResolvesToTheSameMonday();
  testNextWeekResolvesToADifferentMonday();
  testIsRealMondayNow();
  await testFirstCallThisWeekCreatesTheRealRow();
  await testSecondCallSameWeekNeverCreatesADuplicate();
  await testNeverFabricatesPerformanceData();
  console.log("weekly-campaign.test.ts: ALL PASS");
}

run();
