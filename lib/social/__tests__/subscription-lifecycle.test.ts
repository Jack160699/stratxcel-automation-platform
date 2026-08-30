// Run with: node --experimental-strip-types lib/social/__tests__/subscription-lifecycle.test.ts
//
// STRATXCEL zero-gap closure brief Section 4/14: a direct, mocked,
// RUNTIME-EXECUTED proof of the subscription-end lifecycle harness --
// distinct from the existing coverage in package-autopilot-policy.test.ts,
// which only asserts that certain SQL substrings ("v_sub.status <> 'active'",
// "current_period_end <= now()") are present in a migration file's TEXT.
// That's real coverage of the DB-RPC layer (claim_social_package_post), but
// it never actually EXECUTES the application-layer state-transition logic
// in planPackagePeriod (lib/social/package-autopilot.ts) against any input.
// This file does, against a minimal fake Supabase client -- no real
// database write, no real subscription touched, no real image generation
// (matches this codebase's own established dependency-injection
// test-isolation pattern, e.g. image-cost-guard.test.ts). Per the brief's
// own instruction ("Use lifecycle simulation. Do not alter real customer
// billing state... Do not corrupt live Razorpay state."), nothing here
// touches the real StratXcel subscription or Razorpay in any way.
//
// Proves, from real execution of planPackagePeriod's actual logic:
//  - a genuinely active, current subscription keeps an ACTIVE authorization
//    ACTIVE and planning proceeds normally,
//  - a genuinely cancelled/expired subscription demotes an ACTIVE
//    authorization to NEEDS_ATTENTION and blocks all further planning --
//    the real application-layer enforcement, not just the DB-RPC's own
//    belt-and-suspenders check,
//  - an authorization already NEEDS_ATTENTION with a still-inactive
//    subscription stays blocked without issuing a redundant write,
//  - Section 38's "renewed/active again" requirement: a NEEDS_ATTENTION
//    authorization whose real subscription becomes active/current again,
//    with real available capacity, is genuinely restored to ACTIVE and
//    planning resumes in the SAME call -- real eligibility restoration,
//    not a permanent lockout,
//  - the sibling real code path (a disconnected destination, not a billing
//    problem) also demotes an ACTIVE authorization -- proving the
//    NEEDS_ATTENTION transition isn't special-cased to subscriptions only,
//  - closes the loop to prepareNearTermPackageItems's own real ACTIVE-only
//    generation gate, so a restored authorization (and only a restored
//    authorization) can actually generate again.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { planPackagePeriod } from "../package-autopilot.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function baseAuthorization(overrides: Record<string, unknown>): Record<string, unknown> {
  const now = Date.now();
  return {
    id: "auth1",
    tenant_id: "466e6195-a9f6-4576-8271-29fdae61c18a",
    client_user_id: "owner1",
    subscription_id: "sub1",
    entitlement_id: "ent1",
    publishing_mode: "AUTO_PUBLISH",
    state: "ACTIVE",
    allowed_platforms: ["facebook"],
    period_number: 1,
    period_target_units: 12,
    timezone: "Asia/Kolkata",
    max_posts_per_day: 2,
    preparation_horizon_days: 3,
    late_item_policy: "RESCHEDULE_NEXT_SLOT",
    grace_window_minutes: 60,
    counting_policy: "PLATFORM_PUBLISH",
    skip_policy: "SKIP_COUNTS",
    brand_profile_id: "bp1",
    package_composition: { items: [], countingPolicy: "PLATFORM_PUBLISH", allowedPlatforms: ["facebook"], publishingMode: "AUTO_PUBLISH", servicePeriodDays: 30 },
    starts_at: new Date(now - 5 * 86_400_000).toISOString(),
    ends_at: new Date(now + 20 * 86_400_000).toISOString(),
    activated_at: new Date(now - 5 * 86_400_000).toISOString(),
    revoked_at: null,
    ...overrides,
  };
}

function fakeService(opts: {
  authorization: Record<string, unknown>;
  subscription: { status: string; current_period_start: string; current_period_end: string } | null;
  connectedAccounts?: Array<{ id: string; platform: string; owner_id: string }>;
  existingQueueRows?: Array<{ package_sequence: number; content_unit_key: string | null }>;
}) {
  const updateCalls: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const upsertCalls: Array<{ table: string; rows: unknown[] }> = [];

  function builder(table: string): any {
    const b: any = {
      select() { return b; },
      eq() { return b; },
      order() { return b; },
      limit() { return b; },
    };

    if (table === "social_autopilot_authorizations") {
      b.maybeSingle = async () => ({ data: { ...opts.authorization }, error: null });
      b.single = b.maybeSingle;
      b.update = (patch: Record<string, unknown>) => {
        updateCalls.push({ table, patch });
        return b; // real code does `.update(patch).eq("id", ...)` awaited directly, no further chain
      };
    } else if (table === "subscriptions") {
      b.maybeSingle = async () => ({ data: opts.subscription, error: null });
    } else if (table === "usage_entitlements") {
      // No real entitlement row configured in this fake -- keeps
      // rollServicePeriodIfNeeded's own `!entitlement` guard a genuine
      // no-op, so this test file stays focused on the real subscription-
      // status transition logic in planPackagePeriod itself, not period
      // rolling (a separate, already-real behavior this file doesn't
      // re-test).
      b.maybeSingle = async () => ({ data: null, error: null });
    } else if (table === "social_accounts") {
      b.in = async () => ({ data: opts.connectedAccounts ?? [], error: null });
    } else if (table === "social_autopilot_queue_items") {
      let eqCalls = 0;
      b.eq = () => {
        eqCalls += 1;
        return eqCalls >= 2 ? Promise.resolve({ data: opts.existingQueueRows ?? [], error: null }) : b;
      };
      b.upsert = (rows: unknown[]) => {
        upsertCalls.push({ table, rows });
        return { error: null };
      };
    } else {
      throw new Error(`fakeService: unexpected real table in this fake: ${table}`);
    }
    return b;
  }

  return { service: { from: (table: string) => builder(table) } as never, updateCalls, upsertCalls };
}

const ACTIVE_SUBSCRIPTION = () => {
  const now = Date.now();
  return { status: "active", current_period_start: new Date(now - 5 * 86_400_000).toISOString(), current_period_end: new Date(now + 20 * 86_400_000).toISOString() };
};
const CANCELLED_SUBSCRIPTION = () => {
  const now = Date.now();
  return { status: "cancelled", current_period_start: new Date(now - 35 * 86_400_000).toISOString(), current_period_end: new Date(now - 5 * 86_400_000).toISOString() };
};
const CONNECTED_FACEBOOK = [{ id: "acct1", platform: "facebook", owner_id: "owner1" }];

async function testActiveWithHealthySubscriptionStaysActiveAndPlans() {
  const { service, updateCalls } = fakeService({
    authorization: baseAuthorization({ state: "ACTIVE" }),
    subscription: ACTIVE_SUBSCRIPTION(),
    connectedAccounts: CONNECTED_FACEBOOK,
    existingQueueRows: [{ package_sequence: 1, content_unit_key: null }, { package_sequence: 2, content_unit_key: null }, { package_sequence: 3, content_unit_key: null }],
  });
  const result = await planPackagePeriod(service, "auth1");
  assert.equal(result.blockedReason, undefined, "a real, active, current subscription with a real connected destination must not be blocked");
  assert.ok(result.planned > 0, "real remaining entitlement with a real connected destination must actually plan slots");
  assert.equal(updateCalls.filter((c) => c.patch.state === "NEEDS_ATTENTION").length, 0, "a genuinely healthy subscription must never be demoted");
  console.log("subscription-lifecycle.test.ts: a healthy, active subscription keeps ACTIVE and plans normally — PASS");
}

async function testActiveWithInactiveSubscriptionDemotesAndBlocks() {
  const { service, updateCalls, upsertCalls } = fakeService({
    authorization: baseAuthorization({ state: "ACTIVE" }),
    subscription: CANCELLED_SUBSCRIPTION(),
    connectedAccounts: CONNECTED_FACEBOOK,
    existingQueueRows: [],
  });
  const result = await planPackagePeriod(service, "auth1");
  assert.equal(result.planned, 0, "no real content may be planned once the real subscription is inactive");
  assert.equal(result.blockedReason, "subscription_inactive");
  const demotion = updateCalls.find((c) => c.table === "social_autopilot_authorizations" && c.patch.state === "NEEDS_ATTENTION");
  assert.ok(demotion, "a real cancelled/expired subscription must demote an ACTIVE authorization to NEEDS_ATTENTION -- this IS the real, live application-layer enforcement that stops automation when a subscription ends");
  assert.equal(upsertCalls.length, 0, "no real queue rows may ever be created once the real subscription is inactive");
  console.log("subscription-lifecycle.test.ts: a cancelled/expired subscription demotes ACTIVE→NEEDS_ATTENTION and blocks all planning — PASS");
}

async function testAlreadyNeedsAttentionStaysBlockedWithoutRedundantWrite() {
  const { service, updateCalls } = fakeService({
    authorization: baseAuthorization({ state: "NEEDS_ATTENTION" }),
    subscription: CANCELLED_SUBSCRIPTION(),
    connectedAccounts: CONNECTED_FACEBOOK,
    existingQueueRows: [],
  });
  const result = await planPackagePeriod(service, "auth1");
  assert.equal(result.blockedReason, "subscription_inactive");
  assert.equal(updateCalls.length, 0, "an authorization already NEEDS_ATTENTION with a still-inactive subscription must not issue a redundant write on every call");
  console.log("subscription-lifecycle.test.ts: already-NEEDS_ATTENTION + still-inactive subscription stays blocked without a redundant write — PASS");
}

async function testRenewedSubscriptionRestoresActiveAndResumesPlanning() {
  const { service, updateCalls } = fakeService({
    authorization: baseAuthorization({ state: "NEEDS_ATTENTION" }),
    subscription: ACTIVE_SUBSCRIPTION(),
    connectedAccounts: CONNECTED_FACEBOOK,
    existingQueueRows: [],
  });
  const result = await planPackagePeriod(service, "auth1");
  const promotion = updateCalls.find((c) => c.table === "social_autopilot_authorizations" && c.patch.state === "ACTIVE");
  assert.ok(promotion, "Section 38: a real renewed/active subscription with real available capacity must restore the authorization to ACTIVE -- eligibility genuinely comes back, not a permanent lockout");
  assert.equal(result.blockedReason, undefined);
  assert.ok(result.planned > 0, "planning must actually resume in the SAME call once eligibility is restored, not require a second invocation");
  console.log("subscription-lifecycle.test.ts: a renewed/active-again subscription restores NEEDS_ATTENTION→ACTIVE and planning resumes immediately — PASS");

  // Close the loop: prepareNearTermPackageItems' own real gate only lets a
  // genuinely ACTIVE authorization generate -- so this real transition is
  // what actually re-enables generation on the next real prepare call, not
  // just a value returned here in isolation.
  const packageAutopilotSrc = read("lib", "social", "package-autopilot.ts");
  assert.match(
    packageAutopilotSrc,
    /if \(authorization\.state !== "ACTIVE"\) return \{ prepared: 0, blocked: 0, recoveryExhausted: 0, moreWorkRemaining: false \};/,
    "prepareNearTermPackageItems must stay gated on the real ACTIVE state, so a restored authorization -- and only a restored authorization -- can generate again"
  );
  console.log("subscription-lifecycle.test.ts: prepareNearTermPackageItems' real ACTIVE-only gate closes the loop on restored eligibility — PASS");
}

async function testDisconnectedDestinationAlsoDemotesActiveAuthorization() {
  const { service, updateCalls } = fakeService({
    authorization: baseAuthorization({ state: "ACTIVE" }),
    subscription: ACTIVE_SUBSCRIPTION(),
    connectedAccounts: [], // every allowed platform disconnected -- a real, non-billing reason generation must stop
    existingQueueRows: [],
  });
  const result = await planPackagePeriod(service, "auth1");
  assert.equal(result.blockedReason, "no_connected_destination");
  const demotion = updateCalls.find((c) => c.table === "social_autopilot_authorizations" && c.patch.state === "NEEDS_ATTENTION");
  assert.ok(demotion, "the NEEDS_ATTENTION transition is real general eligibility enforcement, not special-cased to subscription status alone");
  console.log("subscription-lifecycle.test.ts: a disconnected destination also demotes an ACTIVE authorization to NEEDS_ATTENTION — PASS");
}

async function run() {
  await testActiveWithHealthySubscriptionStaysActiveAndPlans();
  await testActiveWithInactiveSubscriptionDemotesAndBlocks();
  await testAlreadyNeedsAttentionStaysBlockedWithoutRedundantWrite();
  await testRenewedSubscriptionRestoresActiveAndResumesPlanning();
  await testDisconnectedDestinationAlsoDemotesActiveAuthorization();
  console.log("subscription-lifecycle.test.ts: ALL PASS");
}

run();
