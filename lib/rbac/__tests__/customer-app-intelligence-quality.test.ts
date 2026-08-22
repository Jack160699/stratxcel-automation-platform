import assert from "node:assert/strict";
import { classifySocialCopilotIntent } from "../../social/agent/copilot-intents.ts";
import { PLAN_DEFINITIONS, PLAN_LIMITS } from "../../../packages/payments-and-wallet/src/index.ts";
import fs from "node:fs";
import path from "node:path";

async function run() {
  console.log("Running StratXcel Customer App Intelligence & Quality Test Suite...");

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

  // 3. Test Brand Center naming and error phrasing in brand page
  const brandPagePath = path.resolve("app/app/brand/page.tsx");
  const brandPageContent = fs.readFileSync(brandPagePath, "utf-8");
  assert.ok(brandPageContent.includes("Brand Center"), "Brand page must use canonical 'Brand Center' heading");
  assert.ok(!brandPageContent.includes("Shop Profile"), "Brand page must NOT use 'Shop Profile' heading");
  assert.ok(!brandPageContent.includes("Brand Brain. Please try again"), "Brand page must NOT show internal 'Brand Brain' in customer error");
  assert.ok(brandPageContent.includes("We couldn't load your Brand details right now."), "Brand page must show customer-friendly error");
  console.log("✓ Test 3: Brand Center naming and customer-friendly error phrasing verified.");

  // 4. Test Website & Domains Page Architecture
  const websitePagePath = path.resolve("app/app/website/page.tsx");
  const websitePageContent = fs.readFileSync(websitePagePath, "utf-8");
  assert.ok(websitePageContent.includes("Website & Domain"), "Website page must have Website & Domain title");
  assert.ok(websitePageContent.includes("My Website"), "Website page must contain My Website tab");
  assert.ok(websitePageContent.includes("My Domain"), "Website page must contain My Domain tab");
  assert.ok(websitePageContent.includes("Plan Comparison"), "Website page must contain Plan Comparison tab");
  assert.ok(websitePageContent.includes("SmartWebsiteCreator"), "Website page must support SmartWebsiteCreator");
  assert.ok(websitePageContent.includes("CustomerDomainManager"), "Website page must support CustomerDomainManager");
  console.log("✓ Test 4: Website & Domains complete customer architecture verified.");

  // 5. Test Growth Assistant Mobile Composer & Sparkle Removal
  const assistantChatPath = path.resolve("app/app/social/copilot/GrowthAssistantChat.tsx");
  const assistantChatContent = fs.readFileSync(assistantChatPath, "utf-8");
  assert.ok(!assistantChatContent.includes("✨"), "Decorative sparkle AI icon must be removed from assistant empty state");
  assert.ok(assistantChatContent.includes("min-w-0 flex-1"), "Composer text input must have min-w-0 to prevent horizontal overflow");
  assert.ok(assistantChatContent.includes("aria-label=\"Chat history\""), "History button must have accessible label");
  console.log("✓ Test 5: Growth Assistant composer responsiveness and sparkle removal verified.");

  // 6. Test Content Library Strategic Angles
  const contentClientPath = path.resolve("app/app/content/ContentLibraryClient.tsx");
  const contentClientContent = fs.readFileSync(contentClientPath, "utf-8");
  assert.ok(contentClientContent.includes("STRATEGIC_ANGLES"), "ContentLibraryClient must define STRATEGIC_ANGLES");
  assert.ok(contentClientContent.includes("Why this content?"), "ContentLibraryClient must render strategic rationale");
  assert.ok(contentClientContent.includes("Regenerate with Angle:"), "ContentLibraryClient must support angle regeneration");
  console.log("✓ Test 6: Content Library strategic angles and rationale verified.");

  console.log("\n=======================================================");
  console.log("ALL CUSTOMER APP INTELLIGENCE & QUALITY TESTS PASSED!");
  console.log("=======================================================\n");
}

run().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
