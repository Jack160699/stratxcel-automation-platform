import assert from "node:assert/strict";
import { recommendPlan, type PlanRecommendationSignals } from "../plan-recommendation.ts";

function signals(overrides: Partial<PlanRecommendationSignals>): PlanRecommendationSignals {
  return {
    googleBusinessConnected: true,
    discoverabilitySeoScore: 70,
    competitorCount: 2,
    socialContentScore: 75,
    visualContentOpportunityCount: 1,
    hasWebsite: true,
    trustReputationScore: 75,
    highImpactFindingCount: 1,
    ...overrides,
  };
}

// Scenario A — Weak SEO + Weak Social: Expected SEO + Social (₹6,998) and upsell Advanced Growth (₹18,498)
const scenarioA = recommendPlan(signals({
  googleBusinessConnected: false,
  discoverabilitySeoScore: 35,
  competitorCount: 5,
  socialContentScore: 30,
  visualContentOpportunityCount: 4,
  hasWebsite: false,
}));
assert.equal(scenarioA.scenario, "scenario_a");
assert.equal(scenarioA.serviceKey, "seo_and_social");
assert.equal(scenarioA.priceCents, 699_800);
assert.equal(scenarioA.upsell?.key, "advanced_growth");
assert.ok(scenarioA.why.includes("SEO + Social solves both core growth channels immediately"));

// Scenario B — Strong SEO + Weak Social: Expected Social Content (₹3,999) and upsell Advanced Social (₹8,499)
const scenarioB = recommendPlan(signals({
  googleBusinessConnected: true,
  discoverabilitySeoScore: 85,
  competitorCount: 3,
  socialContentScore: 40,
  visualContentOpportunityCount: 5,
  hasWebsite: true,
}));
assert.equal(scenarioB.scenario, "scenario_b");
assert.equal(scenarioB.serviceKey, "social");
assert.equal(scenarioB.priceCents, 399_900);
assert.equal(scenarioB.upsell?.key, "advanced_social");
assert.ok(scenarioB.why.includes("28 monthly posts will keep your brand active"));

// Scenario C — Weak SEO + Strong Social: Expected SEO Growth (₹2,999) and upsell Advanced SEO (₹9,999)
const scenarioC = recommendPlan(signals({
  googleBusinessConnected: false,
  discoverabilitySeoScore: 40,
  competitorCount: 4,
  socialContentScore: 80,
  visualContentOpportunityCount: 1,
  hasWebsite: true,
}));
assert.equal(scenarioC.scenario, "scenario_c");
assert.equal(scenarioC.serviceKey, "seo");
assert.equal(scenarioC.priceCents, 299_900);
assert.equal(scenarioC.upsell?.key, "advanced_seo");
assert.ok(scenarioC.why.includes("SEO Growth fixes your local visibility"));

// Scenario D — Strong SEO + Strong Social: Expected Advanced Growth (₹18,498)
const scenarioD = recommendPlan(signals({
  googleBusinessConnected: true,
  discoverabilitySeoScore: 85,
  competitorCount: 8,
  socialContentScore: 85,
  visualContentOpportunityCount: 2,
  hasWebsite: true,
}));
assert.equal(scenarioD.scenario, "scenario_d");
assert.equal(scenarioD.serviceKey, "advanced_growth");
assert.equal(scenarioD.priceCents, 1_849_800);
assert.ok(scenarioD.why.includes("Advanced Growth combines Advanced SEO, Social Autopilot, WhatsApp Autopilot"));

// Scenario E — Website Issue: Expected websiteRecommendation
const scenarioE = recommendPlan(signals({
  hasWebsite: false,
  websiteHealthScore: null,
}));
assert.ok(scenarioE.websiteRecommendation?.needed);
assert.equal(scenarioE.websiteRecommendation?.type, "landing_page");
assert.equal(scenarioE.websiteRecommendation?.priceCents, 99_900);

// Demos verification
for (const rec of [scenarioA, scenarioB, scenarioC, scenarioD, scenarioE]) {
  assert.ok(rec.biggestOpportunity.title, "biggestOpportunity.title is present");
  assert.ok(rec.biggestOpportunity.body, "biggestOpportunity.body is present");
  assert.ok(rec.whatStratxcelCanDo.length > 0, "whatStratxcelCanDo is non-empty");
  assert.ok(rec.why.length > 0, "why is non-empty");
  assert.ok(rec.demos.socialDemo.samplePostHook, "social demo hook is present");
  assert.ok(rec.demos.seoDemo.targetKeyword, "seo demo target keyword is present");
}

console.log("plan-recommendation.test.ts: ALL PASS (Commercial Scenarios A-E & Demos)");
