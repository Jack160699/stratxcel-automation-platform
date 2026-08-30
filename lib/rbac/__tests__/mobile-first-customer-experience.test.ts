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
  ["home", "customer-audit", "content", "growth"],
  "Mobile dock primary keys must be home, audit, content, growth"
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
assert.ok(pageFile.includes("StratXcel is working on"), "Subscribed dashboard must present operational running work");
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

// STRATXCEL full-system closure brief, Section 28 (regression sweep): real,
// pre-existing test drift found while running every dedicated suite --
// this test predates the real commercial-model v3 catalog migration
// (packages/payments-and-wallet/src/plans.ts, git history: "GoFree
// subscription redemption was unredeemable for every current plan",
// "commercial_model_v3_subscription_tier_guard_fix"). starter/growth/
// business are still real PLAN_DEFINITIONS entries (their real legacy
// prices below are unchanged and still correct -- kept for existing
// subscribers) but are now explicitly `status: "legacy"` with
// `selfServiceCheckout: false`, so SELF_SERVICE_PLAN_TIERS (a real,
// computed filter over PLAN_DEFINITIONS by status==="active" &&
// selfServiceCheckout) correctly excludes them. Fixed to assert the real,
// current, deliberately-authored self-service catalog rather than
// inventing a rollback of a genuine, already-shipped product decision.
assert.equal(PLAN_DEFINITIONS.starter.priceCents, 299_900, "Starter (legacy, existing subscribers only) must remain ₹2,999/mo (299_900 paise)");
assert.equal(PLAN_DEFINITIONS.growth.priceCents, 799_900, "Growth (legacy, existing subscribers only) must remain ₹7,999/mo (799_900 paise)");
assert.equal(PLAN_DEFINITIONS.business.priceCents, 1_599_900, "Business (legacy, existing subscribers only) must remain ₹15,999/mo (1_599_900 paise)");
assert.equal(PLAN_DEFINITIONS.starter.status, "legacy", "starter must be explicitly legacy, never silently reactivated for new self-service checkout");
assert.equal(PLAN_DEFINITIONS.growth.status, "legacy", "growth must be explicitly legacy, never silently reactivated for new self-service checkout");
assert.equal(PLAN_DEFINITIONS.business.status, "legacy", "business must be explicitly legacy, never silently reactivated for new self-service checkout");
assert.deepEqual(
  Array.from(SELF_SERVICE_PLAN_TIERS),
  ["seo", "social", "seo_and_social", "advanced_seo", "advanced_social", "advanced_growth", "website_landing_page", "website_standard"],
  "Self-service payable plans must be the real, current v3 catalog -- never the pre-migration starter/growth/business tiers, which are legacy-only"
);

// The billing page sources price cents from the shared catalog
// (lib/commercial/catalog.ts PRICING_TIERS[].priceCents, kept in lockstep
// with PLAN_DEFINITIONS) rather than a second hardcoded literal map — assert
// the duplicate map is gone and the shared source carries the right numbers.
const billingPageFile = read("app", "app", "billing", "page.tsx");
assert.ok(!billingPageFile.includes("SELF_SERVICE_TIER_PRICE_CENTS"), "Billing page must not re-declare its own price map");
// Same real v3 migration as above (Section 28 regression sweep): 799_900
// (legacy Growth) and 1_599_900 (legacy Business) were intentionally
// removed from the real, current catalog -- legacy plans are priced only
// in PLAN_DEFINITIONS (still checked above) for existing subscribers, no
// longer duplicated into the self-service catalog customers actually see.
// Checks the real, current v3 tiers' prices instead (seo unchanged at
// 299_900; advanced_growth, the real flagship tier, at 1_849_800).
const catalogFile = read("lib", "commercial", "catalog.ts");
assert.ok(catalogFile.includes("299_900"), "Catalog must carry the canonical SEO Growth price (299_900)");
assert.ok(catalogFile.includes("849_900"), "Catalog must carry the canonical Advanced Social price (849_900)");
assert.ok(catalogFile.includes("1_849_800"), "Catalog must carry the canonical Advanced Growth (flagship) price (1_849_800)");

console.log("✓ Canonical billing plans and pricing verified.");

console.log("\n=================================================================");
console.log("ALL MOBILE-FIRST CUSTOMER EXPERIENCE TESTS PASSED SUCCESSFULLY!");
console.log("=================================================================\n");
