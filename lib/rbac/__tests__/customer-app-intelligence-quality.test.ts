import assert from "node:assert/strict";
import { classifySocialCopilotIntent } from "../../social/agent/copilot-intents.ts";
import {
  PLAN_DEFINITIONS,
  PLAN_LIMITS,
  WEBSITE_SERVICE_PACKAGES,
  getRecommendedIndustryArchitecture,
} from "../../../packages/payments-and-wallet/src/index.ts";
import fs from "node:fs";
import path from "node:path";

async function run() {
  console.log("Running StratXcel Final 'My Shop' + Website Factory + Services Test Suite...");

  // 1. Test Copilot Intent Classification for Plan and Growth queries
  assert.equal(
    classifySocialCopilotIntent("Hi, what's my free plan include?"),
    "ACCOUNT_PLAN_INQUIRY",
    "Should classify free plan inquiry"
  );
  assert.equal(
    classifySocialCopilotIntent("what plan am i on?"),
    "ACCOUNT_PLAN_INQUIRY",
    "Should classify plan inquiry"
  );
  assert.equal(
    classifySocialCopilotIntent("can you publish this to instagram?"),
    "ACCOUNT_PLAN_INQUIRY",
    "Should classify instagram publish question as plan inquiry"
  );
  assert.equal(
    classifySocialCopilotIntent("what should i do this week?"),
    "WEEKLY_GROWTH_ADVICE",
    "Should classify weekly growth advice inquiry"
  );
  assert.equal(
    classifySocialCopilotIntent("is hafte kya karna chahiye?"),
    "WEEKLY_GROWTH_ADVICE",
    "Should classify Hinglish weekly growth advice inquiry"
  );
  console.log("✓ Test 1: Plan and Growth advice intent classifications verified.");

  // 2. Test Plan Definitions and Entitlements Integrity
  assert.ok(PLAN_DEFINITIONS.free, "Free plan must exist in PLAN_DEFINITIONS");
  assert.ok(PLAN_DEFINITIONS.growth, "Growth plan must exist in PLAN_DEFINITIONS");
  assert.equal(PLAN_LIMITS.free.social_posts, 0, "Free plan has 0 automated posts");
  assert.equal(PLAN_LIMITS.growth.social_posts, 25, "Growth plan has 25 automated posts");
  assert.equal(PLAN_LIMITS.growth.website_maintenance, 1, "Growth plan includes website maintenance/custom domain");
  console.log("✓ Test 2: Canonical plan definitions and entitlement limits verified.");

  // 3. Test My Shop Naming, Navigation & Error Phrasing
  const brandPagePath = path.resolve("app/app/brand/page.tsx");
  const brandPageContent = fs.readFileSync(brandPagePath, "utf-8");
  assert.ok(brandPageContent.includes("My Shop"), "Brand page must use canonical 'My Shop' heading");
  assert.ok(!brandPageContent.includes("Brand Center{"), "Brand page must NOT use 'Brand Center' heading");
  assert.ok(!brandPageContent.includes("Shop Profile{"), "Brand page must NOT use 'Shop Profile' heading");
  assert.ok(!brandPageContent.includes("Brand Brain. Please try again"), "Brand page must NOT show internal 'Brand Brain' in customer error");
  assert.ok(brandPageContent.includes("We couldn't load your shop details right now."), "Brand page must show friendly error");

  const navDataPath = path.resolve("components/shell/navigation/app-nav-data.ts");
  const navDataContent = fs.readFileSync(navDataPath, "utf-8");
  assert.ok(navDataContent.includes('label: "My Shop"'), "Navigation data must specify label 'My Shop'");

  const switcherPath = path.resolve("app/app/ClientTenantSwitcher.tsx");
  const switcherContent = fs.readFileSync(switcherPath, "utf-8");
  assert.ok(switcherContent.includes("My Shop"), "Header switcher drawer must link to 'My Shop'");
  assert.ok(!switcherContent.includes("Open Brand Center & Brain"), "Header switcher must NOT say 'Brand Center & Brain'");
  console.log("✓ Test 3: Canonical 'My Shop' naming, header drawer, and friendly error phrasing verified.");

  // 4. Test Website & Domains Page Architecture
  const websitePagePath = path.resolve("app/app/website/page.tsx");
  const websitePageContent = fs.readFileSync(websitePagePath, "utf-8");
  assert.ok(websitePageContent.includes("Website & Domains"), "Website page must have Website & Domains title");
  assert.ok(websitePageContent.includes("Your Website"), "Website page must contain Your Website section");
  assert.ok(websitePageContent.includes("Your Domain"), "Website page must contain Your Domain section");
  assert.ok(websitePageContent.includes("Website Plans & Services"), "Website page must contain Website Plans & Services section");
  assert.ok(websitePageContent.includes("CustomerDomainManager"), "Website page must support CustomerDomainManager");
  console.log("✓ Test 4: Website & Domains simplified 4-section customer architecture verified.");

  // 5. Test Dedicated Website Factory Workspace
  const factoryPagePath = path.resolve("app/app/website/create/page.tsx");
  const factoryPageContent = fs.readFileSync(factoryPagePath, "utf-8");
  assert.ok(factoryPageContent.includes("Website Factory"), "Factory workspace must have Website Factory title");
  assert.ok(factoryPageContent.includes("SmartWebsiteCreator"), "Factory workspace must embed SmartWebsiteCreator");
  assert.ok(factoryPageContent.includes("Choose Your Website Package"), "Factory workspace must include package selection step");
  assert.ok(factoryPageContent.includes("Confirm Shop Identity"), "Factory workspace must prefill and confirm shop identity");
  assert.ok(factoryPageContent.includes("Visual Style & Recommended Architecture"), "Factory workspace must provide style and architecture recommendation");

  const shellPath = path.resolve("app/app/ClientAppShell.tsx");
  const shellContent = fs.readFileSync(shellPath, "utf-8");
  assert.ok(shellContent.includes("/app/website/create"), "ClientAppShell must handle /app/website/create in full-screen creation mode");
  console.log("✓ Test 5: Dedicated Website Factory full-screen workspace & multi-step flow verified.");

  // 6. Test 10x Cost Rule & Commercial Website Packages
  assert.ok(WEBSITE_SERVICE_PACKAGES.landing_page, "Landing page package must exist");
  assert.ok(WEBSITE_SERVICE_PACKAGES.five_page, "5-Page website package must exist");
  assert.ok(WEBSITE_SERVICE_PACKAGES.custom, "Custom website package must exist");

  // Verify 10x pricing invariant: priceCents == internalCostCents * 10
  assert.equal(
    WEBSITE_SERVICE_PACKAGES.landing_page.priceCents,
    WEBSITE_SERVICE_PACKAGES.landing_page.internalCostCents * 10,
    "Landing Page price must be 10x verified internal cost"
  );
  assert.equal(
    WEBSITE_SERVICE_PACKAGES.five_page.priceCents,
    WEBSITE_SERVICE_PACKAGES.five_page.internalCostCents * 10,
    "5-Page Website price must be 10x verified internal cost"
  );
  assert.equal(
    WEBSITE_SERVICE_PACKAGES.custom.priceCents,
    WEBSITE_SERVICE_PACKAGES.custom.internalCostCents * 10,
    "Custom Website price must be 10x verified internal cost"
  );

  // Verify Industry Architectures
  const salonArch = getRecommendedIndustryArchitecture("Unisex Beauty Salon");
  assert.ok(salonArch.pages.includes("Services & Pricing"), "Salon architecture must recommend Services & Pricing");
  const restaurantArch = getRecommendedIndustryArchitecture("North Indian Cafe & Restaurant");
  assert.ok(restaurantArch.pages.includes("Food Menu"), "Restaurant architecture must recommend Food Menu");
  console.log("✓ Test 6: 10x pricing rule, verified cost packages, and industry-adaptive architectures verified.");

  console.log("\n=========================================================================");
  console.log("ALL FINAL 'MY SHOP' + WEBSITE FACTORY + SERVICES TESTS PASSED!");
  console.log("=========================================================================\n");
}

run().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
