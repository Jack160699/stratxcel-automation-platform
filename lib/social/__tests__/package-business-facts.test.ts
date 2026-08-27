// Real behavioral coverage of the Fact/Claim Safety Layer used by Package
// Autopilot's caption generation. Pure function, no fakes needed.
// Run with: node --experimental-strip-types lib/social/__tests__/package-business-facts.test.ts

import assert from "node:assert/strict";
import { buildVerifiedBusinessInformation } from "../package-business-facts.ts";

function testEmptyInputsProduceNoFacts() {
  assert.deepEqual(buildVerifiedBusinessInformation({}), []);
  assert.deepEqual(buildVerifiedBusinessInformation({ googleBusiness: null, brandBrain: null }), []);
  console.log("package-business-facts.test.ts: no source data -> zero fabricated facts — PASS");
}

function testMissingFieldsAreOmittedNotDefaulted() {
  // A Google Business Profile connection with only SOME fields populated
  // must surface only those -- never a placeholder for the rest.
  const facts = buildVerifiedBusinessInformation({ googleBusiness: { address: "12 MG Road, Bengaluru", category: null, websiteUri: undefined } });
  assert.deepEqual(facts, ["Verified business address (Google Business Profile): 12 MG Road, Bengaluru"]);
  console.log("package-business-facts.test.ts: missing fields are omitted, not defaulted — PASS");
}

function testGoogleBusinessFactsAreLabeledAsVerified() {
  const facts = buildVerifiedBusinessInformation({
    googleBusiness: { address: "221B Baker Street, London", category: "Coffee shop", websiteUri: "https://example.com" },
  });
  assert.equal(facts.length, 3);
  assert.ok(facts.every((fact) => fact.startsWith("Verified")), "every Google Business fact must be explicitly labeled as verified, distinguishing it from owner self-reported data");
  console.log("package-business-facts.test.ts: Google Business facts labeled as verified — PASS");
}

function testBrandBrainFactsIncluded() {
  const facts = buildVerifiedBusinessInformation({
    brandBrain: {
      location: "Bandra West, Mumbai",
      target_audience: "Young professionals, 25-40",
      priority_offering: "Weekend brunch menu",
      differentiation: "Only rooftop cafe in the neighborhood",
      average_customer_spend: "₹600-900 per visit",
      business_stage: "GROWTH",
      growth_priority: "Weekend footfall",
    },
  });
  assert.equal(facts.length, 7);
  assert.ok(facts.some((f) => f.includes("Bandra West, Mumbai")));
  assert.ok(facts.some((f) => f.includes("Weekend brunch menu")));
  console.log("package-business-facts.test.ts: all present Brand Brain facts included — PASS");
}

function testNonStringValuesAreIgnored() {
  // Brand Brain content is loosely-typed JSONB (BrandBrainContent has an
  // index signature) -- a field holding an object/array/number instead of
  // the expected string must never crash or leak a "[object Object]" fact.
  const facts = buildVerifiedBusinessInformation({
    brandBrain: { location: { city: "Pune" } as unknown as string, target_audience: 42 as unknown as string, priority_offering: "" },
  });
  assert.deepEqual(facts, []);
  console.log("package-business-facts.test.ts: non-string / empty values never produce a fact — PASS");
}

function testCombinesBothSources() {
  const facts = buildVerifiedBusinessInformation({
    googleBusiness: { address: "Shop 4, Linking Road, Mumbai" },
    brandBrain: { target_audience: "Families with young children" },
  });
  assert.equal(facts.length, 2);
  console.log("package-business-facts.test.ts: combines Google Business + Brand Brain sources — PASS");
}

function run() {
  testEmptyInputsProduceNoFacts();
  testMissingFieldsAreOmittedNotDefaulted();
  testGoogleBusinessFactsAreLabeledAsVerified();
  testBrandBrainFactsIncluded();
  testNonStringValuesAreIgnored();
  testCombinesBothSources();
  console.log("package-business-facts.test.ts: ALL PASS (fact/claim safety layer)");
}

run();
