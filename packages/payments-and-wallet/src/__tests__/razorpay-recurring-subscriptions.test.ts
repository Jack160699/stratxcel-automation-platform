// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/razorpay-recurring-subscriptions.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RAZORPAY_RECURRING_PLAN_IDS,
  getRazorpayRecurringPlanId,
  getTierForRazorpayPlanId,
  isRecurringPlanTier,
} from "../razorpay/recurring-plans.ts";
import { isPaymentFeatureEnabled } from "../flags.ts";
import { processRazorpayWebhookEvent } from "../razorpay/webhook-events.ts";
import { isProviderManagedSubscription } from "../razorpay/subscriptions.ts";
import { PLAN_DEFINITIONS } from "../plans.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function testPlanMapping() {
  assert.equal(RAZORPAY_RECURRING_PLAN_IDS.starter, "plan_TO6KM4Y5ggnUtl");
  assert.equal(RAZORPAY_RECURRING_PLAN_IDS.growth, "plan_TO6Qj9RS4GjW5A");
  assert.equal(RAZORPAY_RECURRING_PLAN_IDS.business, "plan_TO6STE2U2cmmrf");
  assert.equal(getRazorpayRecurringPlanId("starter"), "plan_TO6KM4Y5ggnUtl");
  assert.equal(getRazorpayRecurringPlanId("scale"), null);
  assert.equal(getTierForRazorpayPlanId("plan_TO6Qj9RS4GjW5A"), "growth");
  assert.equal(isRecurringPlanTier("business"), true);
  assert.equal(isRecurringPlanTier("free"), false);
  assert.equal(PLAN_DEFINITIONS.starter.priceCents, 499_900);
  assert.equal(PLAN_DEFINITIONS.growth.priceCents, 999_900);
  assert.equal(PLAN_DEFINITIONS.business.priceCents, 1_999_900);
}

function testRecurringGateFailClosed() {
  const prev = process.env.PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED;
  delete process.env.PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED;
  assert.equal(isPaymentFeatureEnabled("PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED"), false);
  process.env.PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED = "false";
  assert.equal(isPaymentFeatureEnabled("PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED"), false);
  process.env.PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED = "true";
  assert.equal(isPaymentFeatureEnabled("PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED"), true);
  if (prev === undefined) delete process.env.PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED;
  else process.env.PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED = prev;
}

function testProviderManagedHelper() {
  assert.equal(isProviderManagedSubscription({ billing_provider: "razorpay_subscription", provider_subscription_id: "sub_1" }), true);
  assert.equal(isProviderManagedSubscription({ billing_provider: "razorpay_payment_link", provider_subscription_id: null }), false);
  assert.equal(isProviderManagedSubscription({ billing_provider: "razorpay_subscription", provider_subscription_id: null }), false);
}

async function testSubscriptionChargedBypassesPaymentLinkV4() {
  const rpcCalls: string[] = [];
  const mockDb = {
    from: () => ({
      insert: async () => ({ error: null }),
    }),
    rpc: async (name: string) => {
      rpcCalls.push(name);
      if (name === "reconcile_and_fulfill_razorpay_subscription_charge") {
        return {
          data: {
            fulfilled: true,
            already_fulfilled: false,
            order_id: "ord_1",
            purpose: "subscription_payment",
            is_first_charge: true,
          },
          error: null,
        };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };

  const result = await processRazorpayWebhookEvent(mockDb as any, {
    eventType: "subscription.charged",
    providerEventId: "evt_sub_charge_1",
    payload: {
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: "sub_rzp_1", status: "active" } },
        payment: {
          entity: {
            id: "pay_1",
            amount: 499900,
            currency: "INR",
            status: "captured",
            order_id: "order_1",
          },
        },
      },
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.actionTaken, "subscription_charge_fulfilled");
  assert.equal(result.orderId, "ord_1");
  assert.equal(result.purpose, "subscription_payment");
  assert.deepEqual(rpcCalls, ["reconcile_and_fulfill_razorpay_subscription_charge"]);
  assert.equal(rpcCalls.includes("reconcile_and_fulfill_razorpay_payment_v4"), false);
}

async function testSubscriptionChargedIdempotent() {
  const mockDb = {
    from: () => ({ insert: async () => ({ error: null }) }),
    rpc: async () => ({
      data: { fulfilled: true, already_fulfilled: true, order_id: "ord_dup", purpose: "subscription_payment" },
      error: null,
    }),
  };

  const result = await processRazorpayWebhookEvent(mockDb as any, {
    eventType: "subscription.charged",
    providerEventId: "evt_sub_charge_dup",
    payload: {
      event: "subscription.charged",
      payload: {
        subscription: { entity: { id: "sub_rzp_1", status: "active" } },
        payment: { entity: { id: "pay_1", amount: 499900, currency: "INR", status: "captured" } },
      },
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.actionTaken, "subscription_charge_already_fulfilled");
}

async function testLifecycleEvents() {
  const statuses: string[] = [];
  const mockDb = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      statuses.push(String(args.p_provider_status));
      return { data: { success: true, status: "past_due" }, error: null };
    },
  };

  for (const eventType of [
    "subscription.halted",
    "subscription.paused",
    "subscription.resumed",
    "subscription.cancelled",
    "subscription.completed",
    "subscription.pending",
    "subscription.authenticated",
    "subscription.activated",
  ]) {
    const result = await processRazorpayWebhookEvent(mockDb as any, {
      eventType,
      providerEventId: `evt_${eventType}`,
      payload: {
        event: eventType,
        payload: { subscription: { entity: { id: "sub_rzp_1", status: eventType.replace("subscription.", "") } } },
      },
    });
    assert.equal(result.handled, true, eventType);
  }

  assert.ok(statuses.includes("halted"));
  assert.ok(statuses.includes("paused"));
  assert.ok(statuses.includes("cancelled"));
}

function testMigrationSafety() {
  const migration = read("supabase", "migrations", "20260811120000_razorpay_recurring_subscriptions.sql");
  assert.equal(/create\s+table\s+.*subscriptions/i.test(migration), false, "must not create a duplicate subscriptions table");
  assert.equal(
    /create\s+(or\s+replace\s+)?function\s+public\.reconcile_and_fulfill_razorpay_payment_v4/i.test(migration),
    false,
    "must not redefine payment-v4"
  );
  assert.ok(/reconcile_and_fulfill_razorpay_subscription_charge/.test(migration));
  assert.ok(/apply_razorpay_subscription_lifecycle_event/.test(migration));
  assert.ok(/provider_subscription_id/.test(migration));
  assert.ok(/billing_provider/.test(migration));
  assert.ok(/p_target_plan_tier not in \('starter', 'growth', 'business'\)/.test(migration));
  assert.equal(/drop\s+table/i.test(migration), false);
  assert.equal(/drop\s+column/i.test(migration), false);
}

function testCheckoutAndRenewRouting() {
  const checkout = read("app", "api", "platform", "subscriptions", "route.ts");
  assert.ok(/PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED/.test(checkout));
  assert.ok(/createRazorpaySubscription/.test(checkout));
  assert.ok(/razorpay_subscription/.test(checkout));
  assert.equal(/amountCents\s*:\s*body\./.test(checkout), false);
  assert.equal(/plan_id\s*:\s*body\./.test(checkout), false);

  const renew = read("app", "api", "internal", "subscriptions", "renew", "route.ts");
  assert.ok(/isProviderManagedSubscription/.test(renew));
  assert.ok(/skippedProviderManaged/.test(renew));

  const webhook = read("packages", "payments-and-wallet", "src", "razorpay", "webhook-events.ts");
  assert.ok(/subscription\.charged/.test(webhook));
  assert.ok(/reconcile_and_fulfill_razorpay_subscription_charge/.test(webhook));
}

async function run() {
  testPlanMapping();
  testRecurringGateFailClosed();
  testProviderManagedHelper();
  await testSubscriptionChargedBypassesPaymentLinkV4();
  await testSubscriptionChargedIdempotent();
  await testLifecycleEvents();
  testMigrationSafety();
  testCheckoutAndRenewRouting();
  console.log("razorpay-recurring-subscriptions.test.ts: ALL PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
