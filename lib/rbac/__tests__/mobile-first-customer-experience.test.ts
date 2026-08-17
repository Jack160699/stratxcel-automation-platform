import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveGlobalCustomerState } from "../../billing/customer-entitlement.ts";
import { resolveCustomerPlanSummary } from "../../billing/customer-plan.ts";
import { PLAN_DEFINITIONS, SELF_SERVICE_PLAN_TIERS } from "@stratxcel/payments-and-wallet";
import { APP_MOBILE_NAV_KEYS, APP_NAV_GROUPS_DATA } from "../../../components/shell/navigation/app-nav-data.ts";

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf-8");
}

console.log("Running StratXcel Mobile-First Customer Experience Test Suite...\n");

// =========================================================================
// Test 1: Global Customer Entitlement State Model
// =========================================================================
console.log("Test 1: Global Customer Entitlement State Model...");

// Free / Unsubscribed state
const freePlanSummary = resolveCustomerPlanSummary({
  plan_tier: "free",
  status: "free",
});
const freeCustomerState = deriveGlobalCustomerState({
  planSummary: freePlanSummary,
  walletBalanceCents: 0,
  activeMissionsCount: 0,
  auditStatus: "completed",
  hasReportData: true,
  connectedSourcesCount: 3,
});

assert.equal(freeCustomerState.isSubscribed, false, "Free customer must have isSubscribed = false");
assert.equal(freeCustomerState.subscriptionStatus, "NONE", "Free customer subscriptionStatus must be NONE");
assert.equal(freeCustomerState.plan, "NONE", "Free customer plan key must be NONE");
assert.equal(freeCustomerState.walletBalanceCents, 0, "Free customer wallet balance must be 0");
assert.equal(freeCustomerState.activeMissionsCount, 0, "Free customer active missions must be 0");
assert.equal(freeCustomerState.auditStatus, "COMPLETE", "Audit status must derive as COMPLETE when report data exists");

// Subscribed state
const activePlanSummary = resolveCustomerPlanSummary({
  plan_tier: "growth",
  status: "active",
  price_cents: 999_900,
  next_charge_at: "2026-09-15T00:00:00Z",
});
const subscribedCustomerState = deriveGlobalCustomerState({
  planSummary: activePlanSummary,
  walletBalanceCents: 500_000,
  activeMissionsCount: 3,
  runningServicesCount: 2,
  auditStatus: "completed",
  hasReportData: true,
  connectedSourcesCount: 5,
  monthlyUsagePercent: 45,
});

assert.equal(subscribedCustomerState.isSubscribed, true, "Subscribed customer must have isSubscribed = true");
assert.equal(subscribedCustomerState.subscriptionStatus, "ACTIVE", "Subscribed customer subscriptionStatus must be ACTIVE");
assert.equal(subscribedCustomerState.plan, "GROWTH", "Subscribed customer plan key must be GROWTH");
assert.equal(subscribedCustomerState.walletBalanceCents, 500_000, "Subscribed customer wallet balance must match");
assert.equal(subscribedCustomerState.activeMissionsCount, 3, "Subscribed customer active missions must match");
assert.equal(subscribedCustomerState.monthlyUsagePercent, 45, "Subscribed customer monthly usage must match");
assert.equal(subscribedCustomerState.nextBillingDate, "2026-09-15T00:00:00Z", "Next billing date must be preserved");

console.log("✓ Global customer state model verified.");

// =========================================================================
// Test 2: Mobile Bottom Navigation Dock & Top Command Bar
// =========================================================================
console.log("\nTest 2: Mobile Bottom Navigation Dock & Top Command Bar...");

assert.deepEqual(
  APP_MOBILE_NAV_KEYS,
  ["home", "customer-audit", "copilot", "brand"],
  "Mobile dock primary keys must be home, audit, copilot, business"
);

const mobileNavFile = read("components", "shell", "MobileBottomNav.tsx");
assert.ok(mobileNavFile.includes("grid-cols-5"), "Mobile nav must render 5 columns (4 primary + More)");
assert.ok(mobileNavFile.includes("fixed inset-x-0 bottom-0"), "Mobile nav must be fixed at the bottom");
assert.ok(mobileNavFile.includes("Menu & Shortcuts") || mobileNavFile.includes("More"), "More button must open mobile sheet");

const headerActionsFile = read("app", "app", "components", "CustomerHeaderActions.tsx");
assert.ok(headerActionsFile.includes("Account & Profile"), "Profile must open compact account sheet");
assert.ok(headerActionsFile.includes("Wallet"), "Profile sheet must display wallet balance");
assert.ok(headerActionsFile.includes("Sign out"), "Profile sheet must provide sign out action");

console.log("✓ Mobile bottom dock and top command bar verified.");

// =========================================================================
// Test 3: Free vs Subscribed Dashboard Architecture
// =========================================================================
console.log("\nTest 3: Free vs Subscribed Dashboard Architecture...");

const pageFile = read("app", "app", "page.tsx");
assert.ok(pageFile.includes("FreeUserDashboard"), "Page must have dedicated FreeUserDashboard component");
assert.ok(pageFile.includes("SubscribedUserDashboard"), "Page must have dedicated SubscribedUserDashboard component");
assert.ok(pageFile.includes("What's verified and ready") || pageFile.includes("What&apos;s verified and ready"), "Free dashboard must present verified foundation checklist");
assert.ok(pageFile.includes("What you can unlock"), "Free dashboard must highlight unlockable value");
assert.ok(pageFile.includes("Running now"), "Subscribed dashboard must present operational running work");
assert.ok(!pageFile.includes("Awaiting funds"), "Dashboard must NOT show misleading awaiting funds text");

console.log("✓ Free vs Subscribed dashboard architecture verified.");

// =========================================================================
// Test 4: Copilot 3-Tab Mobile Structure & Plan Awareness
// =========================================================================
console.log("\nTest 4: Copilot 3-Tab Mobile Structure & Plan Awareness...");

const copilotFile = read("app", "app", "copilot", "page.tsx");
assert.ok(copilotFile.includes('activeTab === "ask"'), "Copilot must have Ask tab");
assert.ok(copilotFile.includes('activeTab === "missions"'), "Copilot must have Missions tab");
assert.ok(copilotFile.includes('activeTab === "activity"'), "Copilot must have Activity tab");
assert.ok(copilotFile.includes("This action needs an active plan"), "Copilot must gate unstarted work on paid plan");
assert.ok(copilotFile.includes("NO ACTIVE PLAN") || copilotFile.includes("No active plan"), "Missions tab must indicate no active plan when unsubscribed");

console.log("✓ Copilot mobile structure and plan awareness verified.");

// =========================================================================
// Test 5: Canonical Billing Plans & Pricing
// =========================================================================
console.log("\nTest 5: Canonical Billing Plans & Pricing...");

assert.equal(PLAN_DEFINITIONS.starter.priceCents, 499_900, "Starter plan must be ₹4,999/mo (499_900 paise)");
assert.equal(PLAN_DEFINITIONS.growth.priceCents, 999_900, "Growth plan must be ₹9,999/mo (999_900 paise)");
assert.equal(PLAN_DEFINITIONS.business.priceCents, 1_999_900, "Business plan must be ₹19,999/mo (1_999_900 paise)");
assert.deepEqual(
  Array.from(SELF_SERVICE_PLAN_TIERS),
  ["starter", "growth", "business"],
  "Self-service payable plans must be starter, growth, and business"
);

const billingPageFile = read("app", "app", "billing", "page.tsx");
assert.ok(billingPageFile.includes("499_900"), "Billing page must use canonical Starter price (499_900)");
assert.ok(billingPageFile.includes("999_900"), "Billing page must use canonical Growth price (999_900)");
assert.ok(billingPageFile.includes("1_999_900"), "Billing page must use canonical Business price (1_999_900)");

console.log("✓ Canonical billing plans and pricing verified.");

console.log("\n=================================================================");
console.log("ALL MOBILE-FIRST CUSTOMER EXPERIENCE TESTS PASSED SUCCESSFULLY!");
console.log("=================================================================\n");
