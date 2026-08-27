// Explicit personalization scenarios against realistic fixtures (build
// brief Phase G). Run with:
// node --experimental-strip-types lib/social/__tests__/personalization.test.ts

import assert from "node:assert/strict";
import { buildVerifiedBusinessInformation } from "../package-business-facts.ts";
import { buildCreativeBrief } from "../creative-brief.ts";
import {
  RESTAURANT_FIXTURE,
  SALON_FIXTURE,
  GYM_FIXTURE,
  REAL_ESTATE_FIXTURE,
} from "./fixtures/business-fixtures.ts";

const PHONE_SHAPED = /\b\d{10}\b|\b\+?\d[\d -]{8,14}\d\b/;
const RATING_SHAPED = /\b\d(?:\.\d)?\s?(?:star|stars|\/\s?5|out of 5)\b/i;
const DISCOUNT_SHAPED = /\b\d{1,3}\s?%\s?(?:off|discount)\b/i;

function factsFor(fixture: typeof RESTAURANT_FIXTURE) {
  return buildVerifiedBusinessInformation({ googleBusiness: fixture.googleBusiness, brandBrain: fixture.brandBrain });
}

// --- Complete data: all relevant facts are used correctly. ---
function testCompleteDataUsesAllAvailableFacts() {
  const facts = factsFor(RESTAURANT_FIXTURE);
  assert.ok(facts.some((f) => f.includes("Fort Kochi")), "location must be present");
  assert.ok(facts.some((f) => f.toLowerCase().includes("seafood")), "Google Business category must be present");
  assert.ok(facts.some((f) => f.includes("thali")), "priority offering must be present");
  assert.ok(facts.some((f) => f.includes("₹600-900")), "average customer spend must be present");
  console.log("personalization.test.ts: complete data -> every available verified fact is surfaced — PASS");
}

// --- Partial data: available facts used, unavailable omitted. ---
function testPartialDataOmitsWhatIsNotAvailable() {
  const facts = factsFor(SALON_FIXTURE);
  assert.ok(facts.some((f) => f.includes("Bandra West")), "the salon's real location must be used");
  assert.ok(!facts.some((f) => /website/i.test(f)), "websiteUri was null for this fixture -- must be omitted, not defaulted to empty string or invented");
  assert.ok(!facts.some((f) => /differentiation|average customer spend|business stage|growth priority/i.test(f)), "fields the fixture never provided must be entirely absent, not present with a placeholder");
  console.log("personalization.test.ts: partial data -> only what's actually available is used, the rest is cleanly omitted — PASS");
}

// --- No phone: no fake phone ever appears. ---
function testNoPhoneNeverFabricatesOne() {
  for (const fixture of [RESTAURANT_FIXTURE, SALON_FIXTURE, GYM_FIXTURE]) {
    const facts = factsFor(fixture);
    assert.ok(!facts.some((f) => PHONE_SHAPED.test(f)), `${fixture.key}: no phone number was ever provided -- verified facts must never contain a phone-shaped value`);
  }
  console.log("personalization.test.ts: no phone provided -> no phone-shaped value ever appears in verified facts — PASS");
}

// --- No address: no fake address appears (gym has no GBP connection at all). ---
function testNoAddressNeverFabricatesOne() {
  const facts = factsFor(GYM_FIXTURE);
  assert.ok(!facts.some((f) => /address/i.test(f)), "GYM_FIXTURE has no Google Business connection -- an address fact must never appear");
  console.log("personalization.test.ts: no Google Business connection -> no address fact appears — PASS");
}

// --- No rating: no fabricated rating/review count anywhere, for any fixture. ---
function testNoRatingIsEverFabricated() {
  for (const fixture of [RESTAURANT_FIXTURE, SALON_FIXTURE, GYM_FIXTURE, REAL_ESTATE_FIXTURE]) {
    const facts = factsFor(fixture);
    assert.ok(!facts.some((f) => RATING_SHAPED.test(f)), `${fixture.key}: no rating was ever connected -- package-business-facts.ts has no rating field at all, so none can leak in`);
  }
  console.log("personalization.test.ts: no fixture ever has a fabricated rating in its verified facts — PASS");
}

// --- No offer: no fabricated discount appears, for any fixture. ---
function testNoOfferIsEverFabricated() {
  for (const fixture of [RESTAURANT_FIXTURE, SALON_FIXTURE, GYM_FIXTURE, REAL_ESTATE_FIXTURE]) {
    const facts = factsFor(fixture);
    assert.ok(!facts.some((f) => DISCOUNT_SHAPED.test(f)), `${fixture.key}: no offer was ever configured -- verified facts must never contain a discount-shaped value`);
  }
  console.log("personalization.test.ts: no offer configured -> no discount-shaped value ever appears — PASS");
}

// --- Multiple locations: the specific location actually being promoted is
// distinguishable from the tenant's other location, and a single post
// stays focused on one rather than blending both into one confused post.
// LIMITATION (documented, not silently overclaimed): true per-branch
// content targeting -- a distinct Brand Brain / fact set per physical
// location -- is not a built capability. Today's model is one Brand Brain
// per TENANT; a multi-location tenant's "priority offering" field is the
// only lever available to point generation at one location over another. ---
function testMultipleLocationsPriorityOfferingDistinguishesTheActiveOne() {
  const facts = factsFor(REAL_ESTATE_FIXTURE);
  const combinedLocationFact = facts.find((f) => f.startsWith("Business location"));
  const priorityFact = facts.find((f) => f.startsWith("Priority offering"));
  assert.ok(combinedLocationFact?.includes("Whitefield") && combinedLocationFact?.includes("Sarjapur"), "the tenant-level location fact legitimately lists both active projects");
  assert.ok(priorityFact?.includes("Whitefield"), "priority offering must name the SPECIFIC project this content cycle is about");
  assert.ok(!priorityFact?.includes("Sarjapur"), "the priority offering must point at exactly one location, not blend both");
  console.log("personalization.test.ts: multiple locations -> priorityOffering distinguishes the specific one to focus on (documented limitation: no per-branch Brand Brain yet) — PASS");
}

// --- No brand assets: the system still produces a coherent, non-empty
// creative brief (no logo, empty/sparse brand voice+colors). ---
function testNoBrandAssetsStillProducesACoherentBrief() {
  assert.equal(GYM_FIXTURE.hasLogo, false);
  const facts = factsFor(GYM_FIXTURE);
  const brief = buildCreativeBrief({
    businessName: GYM_FIXTURE.businessName,
    industryText: GYM_FIXTURE.industryText,
    descriptionText: GYM_FIXTURE.descriptionText,
    platform: "instagram",
    mediaType: "image",
    availablePillars: GYM_FIXTURE.contentPillars,
    verifiedFacts: facts,
    brandTone: [],
    brandColors: [],
    audience: GYM_FIXTURE.audience,
    objective: "ENGAGEMENT",
  });
  assert.ok(brief.concept.length > 0 && brief.visualDirection.length > 0 && brief.cta.length > 0, "a brief with zero brand tone/colors/logo must still be complete and coherent");
  assert.ok(brief.brandDirection.length > 0, "brandDirection must fall back to a sensible default, never be empty, when no brand voice/colors are saved");
  console.log("personalization.test.ts: zero brand assets (no logo, no tone, no colors) -> still a coherent, complete brief — PASS");
}

// --- Existing content: new concepts avoid repeating recent ones. ---
function testExistingContentHistoryChangesTheNextConcept() {
  const first = buildCreativeBrief({
    businessName: RESTAURANT_FIXTURE.businessName,
    industryText: RESTAURANT_FIXTURE.industryText,
    platform: "instagram",
    mediaType: "image",
    availablePillars: RESTAURANT_FIXTURE.contentPillars,
    verifiedFacts: [],
    objective: "ENGAGEMENT",
  });
  const withHistory = buildCreativeBrief({
    businessName: RESTAURANT_FIXTURE.businessName,
    industryText: RESTAURANT_FIXTURE.industryText,
    platform: "instagram",
    mediaType: "image",
    availablePillars: RESTAURANT_FIXTURE.contentPillars,
    verifiedFacts: [],
    objective: "ENGAGEMENT",
    recentPillars: [first.contentPillar, first.contentPillar],
    recentConcepts: [first.concept],
  });
  assert.notEqual(withHistory.contentPillar, first.contentPillar, "content pillar must rotate away once the prior one was used repeatedly");
  assert.notEqual(withHistory.concept, first.concept, "creative concept must rotate away from the immediately preceding one");
  console.log("personalization.test.ts: existing content history changes both the next pillar and concept — PASS");
}

function run() {
  testCompleteDataUsesAllAvailableFacts();
  testPartialDataOmitsWhatIsNotAvailable();
  testNoPhoneNeverFabricatesOne();
  testNoAddressNeverFabricatesOne();
  testNoRatingIsEverFabricated();
  testNoOfferIsEverFabricated();
  testMultipleLocationsPriorityOfferingDistinguishesTheActiveOne();
  testNoBrandAssetsStillProducesACoherentBrief();
  testExistingContentHistoryChangesTheNextConcept();
  console.log("personalization.test.ts: ALL PASS");
}

run();
