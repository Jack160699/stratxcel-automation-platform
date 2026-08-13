import assert from "node:assert/strict";
import { LOCAL_BUSINESS_JOURNEY_STAGES } from "../journey-model.ts";
import { LOCAL_BUSINESS_VERTICALS, PUBLISHED_LOCAL_BUSINESS_VERTICALS } from "../local-business-verticals.ts";
import { CUSTOMER_INTENTS } from "../customer-intents.ts";
import { getPublishedSolutionSlugs, resolveSolutionPage } from "../solution-pages.ts";
import { SOLUTION_OUTCOMES } from "../outcomes.ts";
import { PRODUCTS } from "../../product-suite/taxonomy.ts";

assert.equal(LOCAL_BUSINESS_JOURNEY_STAGES.length, 5);
assert.deepEqual(
  LOCAL_BUSINESS_JOURNEY_STAGES.map((s) => s.title),
  ["Get found", "Get attention", "Get enquiries", "Follow up", "Understand"],
);

assert.equal(LOCAL_BUSINESS_VERTICALS.length, 10);
assert.equal(PUBLISHED_LOCAL_BUSINESS_VERTICALS.length, 10);
for (const vertical of LOCAL_BUSINESS_VERTICALS) {
  assert.equal(vertical.journeySteps.length, 5);
}

assert.equal(CUSTOMER_INTENTS.length, 6);
const outcomeIds = new Set(SOLUTION_OUTCOMES.map((o) => o.id));
const productIds = new Set(Object.keys(PRODUCTS));
for (const intent of CUSTOMER_INTENTS) {
  assert.ok(outcomeIds.has(intent.outcomeId), `missing outcome ${intent.outcomeId}`);
  for (const productId of intent.productIds) {
    assert.ok(productIds.has(productId), `missing product ${productId}`);
  }
}

assert.ok(resolveSolutionPage("restaurants-cafes"));
assert.equal(resolveSolutionPage("restaurants-cafes")?.kind, "local-business-vertical");
assert.ok(resolveSolutionPage("startups"));
assert.equal(resolveSolutionPage("startups")?.kind, "customer-type");
assert.equal(resolveSolutionPage("professional-services")?.kind, "local-business-vertical");

const slugs = getPublishedSolutionSlugs();
assert.ok(slugs.includes("restaurants-cafes"));
assert.ok(slugs.includes("startups"));
assert.equal(new Set(slugs).size, slugs.length);

console.log("local-business-journeys.test.ts: ALL PASS");
