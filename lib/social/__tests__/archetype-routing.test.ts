// Run with: node --experimental-strip-types lib/social/__tests__/archetype-routing.test.ts
import assert from "node:assert/strict";
import { resolveAutomatedRouting, resolveManualRouting, sanitizePreferredArchetypes, toArchetypeTier } from "../archetype-routing.ts";
import { validateCreativeTreatment, forceArchetypeOntoTreatment, type CreativeTreatment } from "../creative-treatment.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`archetype-routing.test.ts: ${name} — PASS`);
  } catch (err) {
    console.error(`archetype-routing.test.ts: ${name} — FAIL`);
    throw err;
  }
}

const GOOD_TREATMENT: CreativeTreatment = {
  concept: "Turn the after-work energy crash into a recognizable 20-minute mobility ritual",
  hook: "Sitting all day is quietly wrecking your squat.",
  audienceTension: "Desk workers feel too depleted after work to start a real session",
  story: "A short, structured mobility ritual bridges the gap between a desk day and real training",
  visualIdea: "Coach guiding a client through a targeted hip-opener stretch mid-session",
  subject: "Coach and client mid mobility stretch, hands guiding form",
  composition: "Subject-centered, low negative space upper-left for headline",
  camera: "35mm documentary feel, slightly low angle",
  lighting: "Hard gym overheads with a warm rim light",
  environment: "Dark industrial gym floor, exposed equipment in soft focus background",
  colorDirection: "High-contrast red/black brand accents against a mostly dark frame",
  typographyDirection: "Bold condensed display for the headline, tight tracking",
  brandApplication: "IronCore Fitness wordmark small, bottom-right, red on black",
  textHierarchy: [{ role: "headline", text: "The 20-Minute Desk Reset" }],
  cta: { needed: true, text: "Drop a comment: what's your tightest spot?", rationale: "Engagement objective" },
  format: "single image post",
  whyStopScroll: "Mid-motion coaching moment with real tension in the frame, not a posed portrait",
  whyThisBusiness: "Depicts IronCore's actual coached-session format, not generic gym stock imagery",
  negativeConstraints: ["no unrelated stock gym imagery"],
  intentionallyTextLed: false,
  layoutArchetype: "SPLIT_BANNER",
};

// --- Section 17: "₹2,999 automated" -----------------------------------
test("Starter automated: expected BASIC_ESSENTIAL, forced regardless of preferences supplied", () => {
  const result = resolveAutomatedRouting({ tier: "starter", preferredArchetypes: ["NEON_NIGHTLIFE", "POLAROID_LIFESTYLE"] });
  assert.equal(result.routingContext.forcedArchetype, "BASIC_ESSENTIAL");
  assert.deepEqual(result.routingContext.allowedArchetypes, ["BASIC_ESSENTIAL"]);
  assert.equal(result.fallbackReason, null, "this isn't a fallback -- it's Starter's real, intended behavior");
});

test("Starter automated: server still produces BASIC_ESSENTIAL even when a real AI output attempts a different layout (defense in depth via validateCreativeTreatment + forceArchetypeOntoTreatment)", () => {
  const { routingContext } = resolveAutomatedRouting({ tier: "starter", preferredArchetypes: [] });
  for (const attemptedByAi of ["NEON_NIGHTLIFE", "POLAROID_LIFESTYLE", "SPLIT_BANNER"] as const) {
    const aiTreatment = { ...GOOD_TREATMENT, layoutArchetype: attemptedByAi };
    const issues = validateCreativeTreatment(aiTreatment, { concept: "training tip", routingContext });
    assert.ok(issues.some((i) => i.field === "layoutArchetype"), `expected validation to flag the AI choosing ${attemptedByAi} over the forced archetype`);
    const corrected = forceArchetypeOntoTreatment(aiTreatment, routingContext);
    assert.equal(corrected.layoutArchetype, "BASIC_ESSENTIAL", `expected the final treatment to be forced to BASIC_ESSENTIAL regardless of the AI's ${attemptedByAi} attempt`);
  }
});

// --- Section 17: "₹7,999 automated" -------------------------------------
test("Growth automated: selected layout is ALWAYS one of the tenant's saved preferences, across many rotations", () => {
  const preferences = ["SPLIT_BANNER", "POLAROID_LIFESTYLE", "CLINICAL_TRUST"];
  let history: string[] = [];
  const seenChosen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const result = resolveAutomatedRouting({ tier: "growth", preferredArchetypes: preferences, recentArchetypeHistory: history as never });
    assert.ok(preferences.includes(result.routingContext.forcedArchetype!), `expected the chosen archetype to always be one of ${preferences.join(", ")}, got ${result.routingContext.forcedArchetype}`);
    seenChosen.add(result.routingContext.forcedArchetype!);
    history = [result.routingContext.forcedArchetype!, ...history];
  }
  assert.equal(seenChosen.size, 3, "expected real rotation to reach all 3 saved preferences over enough generations, not always the same one");
});

test("Growth automated: real rotation avoids repeating the most recently used archetype when a different saved preference is due", () => {
  const preferences = ["SPLIT_BANNER", "POLAROID_LIFESTYLE", "CLINICAL_TRUST"];
  const result = resolveAutomatedRouting({ tier: "growth", preferredArchetypes: preferences, recentArchetypeHistory: ["SPLIT_BANNER", "SPLIT_BANNER", "POLAROID_LIFESTYLE"] as never });
  assert.equal(result.routingContext.forcedArchetype, "CLINICAL_TRUST", "the never-yet-used preference must be chosen over ones used repeatedly");
});

test("Business automated behaves identically to Growth (not separately specified by the brief -- mirrors Growth)", () => {
  const preferences = ["ELEVATED_BADGE", "TYPOGRAPHIC_HERO"];
  const result = resolveAutomatedRouting({ tier: "business", preferredArchetypes: preferences });
  assert.ok(preferences.includes(result.routingContext.forcedArchetype!));
  assert.deepEqual(result.routingContext.allowedArchetypes, preferences);
});

test("Growth/Business automated with no valid saved preferences: deterministic safe fallback to BASIC_ESSENTIAL, with a real documented fallback reason -- never an arbitrary premium archetype", () => {
  for (const tier of ["growth", "business"] as const) {
    const result = resolveAutomatedRouting({ tier, preferredArchetypes: [] });
    assert.equal(result.routingContext.forcedArchetype, "BASIC_ESSENTIAL");
    assert.ok(result.fallbackReason && result.fallbackReason.length > 20, `${tier}: expected a real, non-empty fallback reason to be recorded`);
  }
});

test("Growth automated with a corrupt preference array (non-array, garbage entries) sanitizes safely instead of throwing", () => {
  const result = resolveAutomatedRouting({ tier: "growth", preferredArchetypes: "not-an-array" as never });
  assert.equal(result.routingContext.forcedArchetype, "BASIC_ESSENTIAL");
  assert.ok(result.fallbackReason);
});

test("No subscription / unsupported tier: denies premium archetype access, falls back to BASIC_ESSENTIAL with a documented reason", () => {
  for (const tier of ["free", "scale", "launch"] as const) {
    const result = resolveAutomatedRouting({ tier, preferredArchetypes: ["NEON_NIGHTLIFE"] });
    assert.equal(result.routingContext.forcedArchetype, "BASIC_ESSENTIAL", `${tier}: must never grant premium archetype access`);
    assert.ok(result.fallbackReason);
  }
});

// --- Section 17: "₹7,999 manual" -----------------------------------------
test("Growth manual: request POLAROID_LIFESTYLE (in preferences) -> final layout exactly POLAROID_LIFESTYLE", () => {
  const result = resolveManualRouting({ tier: "growth", preferredArchetypes: ["SPLIT_BANNER", "POLAROID_LIFESTYLE"], requestedArchetype: "POLAROID_LIFESTYLE" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.routingContext.forcedArchetype, "POLAROID_LIFESTYLE");
    assert.deepEqual(result.routingContext.allowedArchetypes, ["SPLIT_BANNER", "POLAROID_LIFESTYLE"]);
  }
});

test("Business manual: request behaves the same as Growth manual", () => {
  const result = resolveManualRouting({ tier: "business", preferredArchetypes: ["CLINICAL_TRUST"], requestedArchetype: "CLINICAL_TRUST" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.routingContext.forcedArchetype, "CLINICAL_TRUST");
});

// --- Section 17: "Invalid archetype" --------------------------------------
test("Invalid archetype (unregistered id): structured validation failure, not a silent substitution", () => {
  const result = resolveManualRouting({ tier: "growth", preferredArchetypes: ["SPLIT_BANNER"], requestedArchetype: "MADE_UP_ARCHETYPE" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "UNKNOWN_ARCHETYPE");
});

test("Invalid archetype (wrong type, null, object): structured validation failure", () => {
  for (const bad of [null, undefined, 42, {}, ["SPLIT_BANNER"]]) {
    const result = resolveManualRouting({ tier: "growth", preferredArchetypes: ["SPLIT_BANNER"], requestedArchetype: bad });
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    if (!result.ok) assert.equal(result.error.code, "UNKNOWN_ARCHETYPE");
  }
});

// --- Section 17: "Tier bypass attempt" ------------------------------------
test("Starter requests NEON_NIGHTLIFE via manual generation: rejected -- Starter has zero manual access regardless of the requested archetype", () => {
  const result = resolveManualRouting({ tier: "starter", preferredArchetypes: [], requestedArchetype: "NEON_NIGHTLIFE" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "TIER_NO_MANUAL_ACCESS");
});

test("Starter requests BASIC_ESSENTIAL via manual generation: still rejected -- manual is a Growth+ capability entirely, not gated per-archetype for Starter", () => {
  const result = resolveManualRouting({ tier: "starter", preferredArchetypes: [], requestedArchetype: "BASIC_ESSENTIAL" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "TIER_NO_MANUAL_ACCESS");
});

// --- Section 17: "Preference tampering" -----------------------------------
test("Preference tampering: frontend submits an archetype the tenant never actually saved -- server rejects even though it's a real, valid, tier-allowed archetype", () => {
  const result = resolveManualRouting({ tier: "growth", preferredArchetypes: ["SPLIT_BANNER", "CLINICAL_TRUST"], requestedArchetype: "NEON_NIGHTLIFE" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "ARCHETYPE_NOT_IN_PREFERENCES");
});

test("Growth manual requesting BASIC_ESSENTIAL when it's not in saved preferences is also rejected (the safe-default archetype gets no special bypass)", () => {
  const result = resolveManualRouting({ tier: "growth", preferredArchetypes: ["SPLIT_BANNER"], requestedArchetype: "BASIC_ESSENTIAL" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "ARCHETYPE_NOT_IN_PREFERENCES");
});

test("No active subscription: manual generation rejected with NO_SUBSCRIPTION, not a generic/unspecific error", () => {
  const result = resolveManualRouting({ tier: "free", preferredArchetypes: [], requestedArchetype: "SPLIT_BANNER" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "NO_SUBSCRIPTION");
});

// --- v3 catalog mapping (real bug found live: advanced_growth/
// advanced_social had no archetype routing at all, forcing every
// automated post to BASIC_ESSENTIAL and hard-rejecting manual generation
// with NO_SUBSCRIPTION on a real, live, paying tenant) --------------------
test("advanced_growth/advanced_social automated: routed to the same business bucket as legacy Growth/Business, not the no-capability fallback", () => {
  for (const tier of ["advanced_growth", "advanced_social"] as const) {
    const preferences = ["ELEVATED_BADGE", "TYPOGRAPHIC_HERO"];
    const result = resolveAutomatedRouting({ tier, preferredArchetypes: preferences });
    assert.ok(preferences.includes(result.routingContext.forcedArchetype!), `${tier}: expected a real rotated premium archetype, not a fallback`);
    assert.equal(result.fallbackReason, null, `${tier}: real saved preferences must not trigger any fallback`);
  }
});

test("advanced_growth/advanced_social manual: an archetype in saved preferences is granted, not rejected as NO_SUBSCRIPTION", () => {
  for (const tier of ["advanced_growth", "advanced_social"] as const) {
    const result = resolveManualRouting({ tier, preferredArchetypes: ["CLINICAL_TRUST"], requestedArchetype: "CLINICAL_TRUST" });
    assert.equal(result.ok, true, `${tier}: expected manual generation to succeed for a real advanced_social/advanced_growth tenant`);
    if (result.ok) assert.equal(result.routingContext.forcedArchetype, "CLINICAL_TRUST");
  }
});

test("seo/social/seo_and_social/advanced_seo: zero real Social Autopilot automated/manual quota (PLAN_LIMITS) -- deliberately unmapped, same safe fallback as any tier without the capability", () => {
  for (const tier of ["seo", "social", "seo_and_social", "advanced_seo"] as const) {
    assert.equal(toArchetypeTier(tier), null, `${tier}: must not be silently granted premium archetype access it has no real quota for`);
    const automated = resolveAutomatedRouting({ tier, preferredArchetypes: ["NEON_NIGHTLIFE"] });
    assert.equal(automated.routingContext.forcedArchetype, "BASIC_ESSENTIAL");
    assert.ok(automated.fallbackReason);
    const manual = resolveManualRouting({ tier, preferredArchetypes: [], requestedArchetype: "SPLIT_BANNER" });
    assert.equal(manual.ok, false);
    if (!manual.ok) assert.equal(manual.error.code, "NO_SUBSCRIPTION");
  }
});

// --- sanitizePreferredArchetypes -------------------------------------------
test("sanitizePreferredArchetypes: filters invalid ids, dedupes, caps at 3", () => {
  assert.deepEqual(sanitizePreferredArchetypes(["SPLIT_BANNER", "NOT_REAL", "SPLIT_BANNER", "CLINICAL_TRUST", "POLAROID_LIFESTYLE", "NEON_NIGHTLIFE"]), ["SPLIT_BANNER", "CLINICAL_TRUST", "POLAROID_LIFESTYLE"]);
  assert.deepEqual(sanitizePreferredArchetypes(null), []);
  assert.deepEqual(sanitizePreferredArchetypes(undefined), []);
  assert.deepEqual(sanitizePreferredArchetypes("SPLIT_BANNER"), []);
  assert.deepEqual(sanitizePreferredArchetypes([]), []);
});

console.log("archetype-routing.test.ts: ALL PASS");
