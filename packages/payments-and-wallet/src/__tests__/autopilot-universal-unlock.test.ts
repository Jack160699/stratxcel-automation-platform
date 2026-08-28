// Unlock Autopilot For All Plans mission: Social Autopilot is now the
// platform's core feature and must be available on every plan, including
// Starter.
//
// Two real, distinct gates existed, only one of which the mission's own
// wording pointed at:
// (1) PLAN_CAPABILITIES.<tier>.social_autopilot -- the plan-eligibility
//     check activatePackageAutopilot/the GET route/AutopilotModeToggle all
//     read. Previously true only for advanced_social/advanced_growth (and
//     the legacy growth/business/custom_growth/scale tiers).
// (2) A SEPARATE, previously-undiscovered gate found while verifying this
//     mission: /app/content/autopilot/page.tsx wrapped the whole page in
//     <EntitlementGate minTier="starter">, whose own TIER_RANK map
//     (components/ui/EntitlementGate.tsx) only recognizes the legacy
//     free/starter/growth/business/scale identifiers -- every CURRENT
//     commercial-model tier (seo, social, seo_and_social, advanced_seo,
//     advanced_social, advanced_growth, website_*) looked up `?? 0`, the
//     same rank as "free", silently blocking every real, currently-paying
//     tenant on the active commercial model from ever reaching the page,
//     independent of capability (1). Fixed by removing that gate entirely
//     -- AutopilotDashboard already handles its own real eligibility from
//     the live API, not a static tier guess.
//
// PLAN_LIMITS' numeric quotas are deliberately verified UNCHANGED here --
// this mission unlocks the CAPABILITY, not a promise of new content quota
// for plans that never had one (SEO-only/website-only genuinely have 0
// social_posts; that's an honest, separate pricing decision, not this
// mission's ask).
// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/autopilot-universal-unlock.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLAN_CAPABILITIES, PLAN_LIMITS, hasCapability } from "../entitlements.ts";
import { PLAN_DEFINITIONS, isPlanTier } from "../plans.ts";

const root = resolve(import.meta.dirname, "..", "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function run() {
  // --- Live: every real plan tier's capability grants Social Autopilot --
  const allTiers = Object.keys(PLAN_CAPABILITIES);
  assert.ok(allTiers.length >= 16, "sanity: the full tier catalog (current + legacy) must still be present");
  for (const tier of allTiers) {
    assert.equal(PLAN_CAPABILITIES[tier].social_autopilot, true, `${tier}: social_autopilot must be true -- Autopilot is now universal`);
    assert.equal(hasCapability(tier, "social_autopilot"), true, `${tier}: hasCapability("social_autopilot") must agree with the raw capability table`);
  }
  console.log("entitlements.ts: PLAN_CAPABILITIES.*.social_autopilot is true for every real tier — PASS");

  // --- Live: an unrecognized tier still fails closed to the free default,
  //     which also grants Autopilot now (never a crash, never a stale
  //     cached "false") --------------------------------------------------
  assert.equal(hasCapability("totally_unknown_tier_xyz", "social_autopilot"), true, "an unrecognized tier must fail closed to PLAN_CAPABILITIES.free's values, which also grant Autopilot now");
  console.log("entitlements.ts: unrecognized tier fails closed to free (Autopilot-enabled) defaults — PASS");

  // --- Live: PLAN_LIMITS numeric quotas are untouched -- this mission
  //     unlocked the capability flag only, never fabricated new quota ----
  assert.equal(PLAN_LIMITS.starter.social_posts, 12, "Starter's real social_posts quota must be untouched by this mission");
  assert.equal(PLAN_LIMITS.starter.social_autopilot_automated_monthly, 12, "Starter's real Autopilot quota must be untouched");
  assert.equal(PLAN_LIMITS.seo.social_posts, 0, "SEO-only plans must keep their real, honest 0 social_posts quota -- this mission unlocks capability, not a fabricated content allowance");
  assert.equal(PLAN_LIMITS.free.social_posts, 0, "Free trial's real 0 social_posts quota must be untouched");
  console.log("entitlements.ts: PLAN_LIMITS numeric quotas left untouched (capability-only unlock) — PASS");

  // --- Live: isPlanTier / PLAN_DEFINITIONS still agree with the tier set
  for (const tier of Object.keys(PLAN_DEFINITIONS)) {
    assert.ok(isPlanTier(tier), `${tier} must still validate as a real PlanTier`);
    assert.equal(PLAN_DEFINITIONS[tier as keyof typeof PLAN_DEFINITIONS].capabilities.social_autopilot, true, `${tier}: PLAN_DEFINITIONS must reflect the same unlocked capability`);
  }
  console.log("plans.ts: PLAN_DEFINITIONS agrees with the unlocked capability for every tier — PASS");

  // --- Section: the second, previously-undiscovered page-level gate is
  //     actually removed, not just widened ------------------------------
  const autopilotPage = read("app", "app", "content", "autopilot", "page.tsx");
  assert.ok(!autopilotPage.includes('import { EntitlementGate }'), "the page-level EntitlementGate import must be removed, not just re-parameterized -- its TIER_RANK map has zero awareness of the current commercial model's tier keys, and every non-legacy tier resolved to rank 0 through it");
  assert.ok(!autopilotPage.includes("<EntitlementGate"), "the page-level EntitlementGate JSX usage must actually be gone, not just its import");
  assert.ok(autopilotPage.includes("<AutopilotDashboard"), "AutopilotDashboard must still render directly -- it already handles its own real eligibility from the live API");
  console.log("content/autopilot/page.tsx: the second, legacy-only tier gate is removed — PASS");

  // --- Section: EntitlementGate itself is untouched (still correctly used
  //     by the unrelated /app/search SEO gate) ---------------------------
  const searchPage = read("app", "app", "search", "page.tsx");
  assert.ok(searchPage.includes("EntitlementGate"), "the unrelated SEO/search feature's own EntitlementGate usage must be left untouched -- this mission only unlocks Social Autopilot");
  console.log("app/search/page.tsx: the unrelated SEO gate is left untouched — PASS");

  console.log("autopilot-universal-unlock.test.ts: ALL PASS");
}

run();
