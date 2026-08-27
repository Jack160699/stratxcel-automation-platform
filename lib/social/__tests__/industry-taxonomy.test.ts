// Run with: node --experimental-strip-types lib/social/__tests__/industry-taxonomy.test.ts
import assert from "node:assert/strict";
import { classifyIndustry, getIndustryProfile, allIndustryCategories } from "../industry-taxonomy.ts";

function testClassifiesEachKnownIndustry() {
  assert.equal(classifyIndustry("Fine dining restaurant"), "restaurant");
  assert.equal(classifyIndustry("Unisex hair salon"), "salon");
  assert.equal(classifyIndustry("CrossFit gym"), "gym");
  assert.equal(classifyIndustry("Multi-specialty dental clinic"), "clinic");
  assert.equal(classifyIndustry("Electronics retail store"), "retail");
  assert.equal(classifyIndustry("Real estate developer"), "real_estate");
  assert.equal(classifyIndustry("Local plumbing service"), "local_service");
  console.log("industry-taxonomy.test.ts: classifies each known industry — PASS");
}

function testUnknownIndustryFallsBackToGenericNeverGuesses() {
  assert.equal(classifyIndustry("Quantum widget manufacturing"), "generic");
  assert.equal(classifyIndustry(null), "generic");
  assert.equal(classifyIndustry(undefined, ""), "generic");
  console.log("industry-taxonomy.test.ts: unknown industry -> generic, never a wrong guess — PASS");
}

function testDescriptionTextAlsoConsidered() {
  // Industry field itself may be vague ("Services"), but the description
  // carries the real signal.
  assert.equal(classifyIndustry("Services", "We are a family-run Italian restaurant serving pasta since 1990"), "restaurant");
  console.log("industry-taxonomy.test.ts: description text contributes to classification — PASS");
}

function testEveryCategoryHasMaterialLyDifferentProfile() {
  const categories = allIndustryCategories();
  const profiles = categories.map((c) => getIndustryProfile(c));
  // No two categories should share an identical concept list -- that would
  // mean the "materially different content strategy per industry" promise
  // is not actually implemented.
  const conceptSignatures = profiles.map((p) => p.concepts.join("|"));
  assert.equal(new Set(conceptSignatures).size, conceptSignatures.length, "every industry must have a distinct concept library");
  const visualSignatures = profiles.map((p) => p.visualStyle);
  assert.equal(new Set(visualSignatures).size, visualSignatures.length, "every industry must have distinct visual direction");
  console.log("industry-taxonomy.test.ts: every industry category has a materially distinct profile — PASS");
}

function run() {
  testClassifiesEachKnownIndustry();
  testUnknownIndustryFallsBackToGenericNeverGuesses();
  testDescriptionTextAlsoConsidered();
  testEveryCategoryHasMaterialLyDifferentProfile();
  console.log("industry-taxonomy.test.ts: ALL PASS");
}

run();
