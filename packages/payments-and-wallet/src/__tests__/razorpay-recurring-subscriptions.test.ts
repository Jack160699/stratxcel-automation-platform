// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/razorpay-recurring-subscriptions.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRazorpayRecurringPlanId,
  getTierForRazorpayPlanId,
  isRecurringPlanTier,
  resolveRecurringAuditCreditHandling,
  getConfiguredRazorpayPlanEnvKeys,
} from "../razorpay/recurring-plans.ts";
import { isPaymentFeatureEnabled } from "../flags.ts";
import { processRazorpayWebhookEvent } from "../razorpay/webhook-events.ts";
import { isProviderManagedSubscription } from "../razorpay/subscriptions.ts";
import { PLAN_DEFINITIONS } from "../plans.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const readCode = (...parts: string[]) => read(...parts).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function testPlanMappingEnvFailClosed() {
  const keys = getConfiguredRazorpayPlanEnvKeys();
  withEnv(
    {
      RAZORPAY_INTEGRATION_MODE: "test",
      [keys.starter]: undefined,
      [keys.growth]: undefined,
      [keys.business]: undefined,
    },
    () => {
      assert.throws(() => getRazorpayRecurringPlanId("starter", "test"), /RAZORPAY_SUBSCRIPTION_PLAN_STARTER_ID/);
      assert.throws(() => getRazorpayRecurringPlanId("growth", "live"), /RAZORPAY_SUBSCRIPTION_PLAN_GROWTH_ID/);
    }
  );

  withEnv(
    {
      RAZORPAY_INTEGRATION_MODE: "test",
      [keys.starter]: "plan_test_starter",
      [keys.growth]: "plan_test_growth",
      [keys.business]: "plan_test_business",
    },
    () => {
      assert.equal(getRazorpayRecurringPlanId("starter", "test"), "plan_test_starter");
      assert.equal(getTierForRazorpayPlanId("plan_test_growth"), "growth");
      assert.equal(isRecurringPlanTier("business"), true);
      let scaleRejected = false;
      try {
        getRazorpayRecurringPlanId("scale" as any, "test");
      } catch {
        scaleRejected = true;
      }
      assert.equal(scaleRejected, true);
    }
  );

  // No hardcoded live IDs in source
  const plansSrc = read("packages", "payments-and-wallet", "src", "razorpay", "recurring-plans.ts");
  assert.equal(/plan_TO6KM4Y5ggnUtl|plan_TO6Qj9RS4GjW5A|plan_TO6STE2U2cmmrf/.test(plansSrc), false);
  assert.equal(PLAN_DEFINITIONS.starter.priceCents, 499_900);
}

function testAuditCreditHandling() {
  withEnv({ RAZORPAY_SUBSCRIPTION_AUDIT_CREDIT_OFFER_ID: undefined, RAZORPAY_INTEGRATION_MODE: "test" }, () => {
    const deferred = resolveRecurringAuditCreditHandling({
      eligible: true,
      creditAmountCents: 99_900,
      catalogPriceCents: 499_900,
      mode: "test",
    });
    assert.equal(deferred.creditMode, "deferred_wallet");
    assert.equal(deferred.chargePriceCents, 499_900);
    assert.equal(deferred.auditCreditDeferredCents, 99_900);
    assert.equal(deferred.auditCreditAppliedCents, 0);
  });

  withEnv({ RAZORPAY_SUBSCRIPTION_AUDIT_CREDIT_OFFER_ID: "offer_test_999", RAZORPAY_INTEGRATION_MODE: "test" }, () => {
    const offered = resolveRecurringAuditCreditHandling({
      eligible: true,
      creditAmountCents: 99_900,
      catalogPriceCents: 499_900,
      mode: "test",
    });
    assert.equal(offered.creditMode, "provider_offer");
    assert.equal(offered.chargePriceCents, 400_000);
    assert.equal(offered.offerId, "offer_test_999");
    assert.equal(offered.auditCreditAppliedCents, 99_900);
  });
}

function testRecurringGateFailClosed() {
  withEnv({ PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED: undefined }, () => {
    assert.equal(isPaymentFeatureEnabled("PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED"), false);
  });
}

function testProviderManagedHelper() {
  assert.equal(isProviderManagedSubscription({ billing_provider: "razorpay_subscription", provider_subscription_id: "sub_1" }), true);
  assert.equal(isProviderManagedSubscription({ billing_provider: "razorpay_payment_link", provider_subscription_id: null }), false);
}

async function testSubscriptionChargedRequiresPlanEvidence() {
  const rpcCalls: string[] = [];
  const issues: unknown[] = [];
  const mockDb = {
    from: (table: string) => {
      if (table === "payment_reconciliation_issues") {
        return { insert: async (row: unknown) => { issues.push(row); return { error: null }; } };
      }
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "sub-local-1",
                    tenant_id: "tenant-1",
                    plan_tier: "starter",
                    provider_plan_id: "plan_test_starter",
                    provider_subscription_id: "sub_rzp_1",
                    price_cents: 499900,
                    pending_plan_tier: null,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return { insert: async () => ({ error: null }) };
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push(name);
      assert.equal(args.p_mode, "test");
      assert.equal(args.p_provider_plan_id, "plan_test_starter");
      return {
        data: { fulfilled: true, already_fulfilled: false, order_id: "ord_1", purpose: "subscription_payment" },
        error: null,
      };
    },
  };

  process.env.RAZORPAY_INTEGRATION_MODE = "test";
  process.env.RAZORPAY_SUBSCRIPTION_PLAN_STARTER_ID = "plan_test_starter";

  const missingPlan = await processRazorpayWebhookEvent(mockDb as any, {
    eventType: "subscription.charged",
    providerEventId: "evt_missing_plan",
    payload: {
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: "sub_rzp_1", status: "active" } },
        payment: { entity: { id: "pay_1", amount: 499900, currency: "INR", status: "captured" } },
      },
    },
  });
  assert.equal(missingPlan.handled, false);
  assert.equal(rpcCalls.length, 0);

  const ok = await processRazorpayWebhookEvent(mockDb as any, {
    eventType: "subscription.charged",
    providerEventId: "evt_ok",
    payload: {
      event: "subscription.charged",
      payload: {
        subscription: {
          entity: {
            id: "sub_rzp_1",
            plan_id: "plan_test_starter",
            status: "active",
            notes: { tenant_id: "tenant-1", subscription_id: "sub-local-1" },
          },
        },
        payment: { entity: { id: "pay_1", amount: 499900, currency: "INR", status: "captured", order_id: "order_1" } },
      },
    },
  });
  assert.equal(ok.handled, true);
  assert.deepEqual(rpcCalls, ["reconcile_and_fulfill_razorpay_subscription_charge"]);
  assert.equal(rpcCalls.includes("reconcile_and_fulfill_razorpay_payment_v4"), false);
}

async function testSubscriptionUpdatedNoEntitlements() {
  let args: Record<string, unknown> | null = null;
  const mockDb = {
    rpc: async (_name: string, a: Record<string, unknown>) => {
      args = a;
      return { data: { success: true, entitlements_changed: false }, error: null };
    },
  };
  const result = await processRazorpayWebhookEvent(mockDb as any, {
    eventType: "subscription.updated",
    providerEventId: "evt_updated",
    payload: {
      event: "subscription.updated",
      payload: {
        subscription: {
          entity: {
            id: "sub_rzp_1",
            status: "active",
            plan_id: "plan_test_growth",
            charge_at: 1893456000,
            current_start: 1890864000,
            current_end: 1893456000,
          },
        },
      },
    },
  });
  assert.equal(result.handled, true);
  assert.equal(result.actionTaken, "subscription_updated_synced");
  assert.equal(args?.p_event_type, "subscription.updated");
  assert.equal(args?.p_provider_plan_id, "plan_test_growth");
  assert.ok(args?.p_next_charge_at);
}

function testCancelAndPlanChangeFailClosedOrdering() {
  const cancel = readCode("app", "api", "platform", "subscriptions", "[id]", "cancel", "route.ts");
  assert.ok(/cancelRazorpaySubscriptionAtPeriodEnd/.test(cancel));
  assert.ok(/provider_cancel_failed/.test(cancel));
  assert.ok(/status:\s*502/.test(cancel));
  const cancelProviderIdx = cancel.indexOf("cancelRazorpaySubscriptionAtPeriodEnd");
  const cancelLocalIdx = cancel.indexOf("set_subscription_cancellation");
  assert.ok(cancelProviderIdx > 0 && cancelLocalIdx > cancelProviderIdx, "provider cancel must run before local schedule for provider-managed");
  assert.equal(/providerSyncWarning/.test(cancel), false);

  const change = readCode("app", "api", "platform", "subscriptions", "[id]", "change-plan", "route.ts");
  assert.ok(/updateRazorpaySubscriptionPlan/.test(change));
  assert.ok(/provider_plan_update_failed/.test(change));
  assert.ok(/status:\s*502/.test(change));
  const changeProviderIdx = change.indexOf("updateRazorpaySubscriptionPlan");
  const changeLocalIdx = change.indexOf("schedule_subscription_plan_change");
  assert.ok(changeProviderIdx > 0 && changeLocalIdx > changeProviderIdx, "provider plan update must run before local pending_plan_tier");
  assert.equal(/providerSyncWarning/.test(change), false);
}

function testCheckoutAuditCreditAndEnv() {
  const checkout = readCode("app", "api", "platform", "subscriptions", "route.ts");
  assert.ok(/resolveRecurringAuditCreditHandling/.test(checkout));
  assert.ok(/audit_credit_deferred_cents/.test(checkout));
  assert.ok(/expectedFirstChargeCents/.test(checkout));
  assert.equal(/plan_TO6/.test(checkout), false);
  assert.equal(/amountCents\s*:\s*body\./.test(checkout), false);
}

function testMigrationSafety() {
  const migration = read("supabase", "migrations", "20260811133000_razorpay_recurring_pr24_fixes.sql");
  assert.equal(/create\s+table\s+.*subscriptions/i.test(migration), false);
  assert.equal(/create\s+(or\s+replace\s+)?function\s+public\.reconcile_and_fulfill_razorpay_payment_v4/i.test(migration), false);
  assert.ok(/p_mode/.test(migration));
  assert.ok(/audit_credit_deferred_cents/.test(migration));
  assert.ok(/subscription\.updated/.test(migration));
  assert.ok(/'test'/.test(migration));
  assert.equal(/'live',\s*\n\s*'razorpay_subscription'/.test(migration) || /subscription_payment', 'live'/.test(migration), false);
}

async function run() {
  testPlanMappingEnvFailClosed();
  testAuditCreditHandling();
  testRecurringGateFailClosed();
  testProviderManagedHelper();
  await testSubscriptionChargedRequiresPlanEvidence();
  await testSubscriptionUpdatedNoEntitlements();
  testCancelAndPlanChangeFailClosedOrdering();
  testCheckoutAuditCreditAndEnv();
  testMigrationSafety();
  console.log("razorpay-recurring-subscriptions.test.ts: ALL PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
