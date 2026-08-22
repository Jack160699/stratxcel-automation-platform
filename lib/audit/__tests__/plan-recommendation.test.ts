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

// Brief §22 Test 1 — Kirana store: weak Google, low social need, modest competition. Expected: Starter.
const kirana = recommendPlan(signals({
  googleBusinessConnected: false,
  discoverabilitySeoScore: null,
  competitorCount: 2,
  socialContentScore: 78,
  visualContentOpportunityCount: 1,
  hasWebsite: false,
  trustReputationScore: 70,
  highImpactFindingCount: 1,
}));
assert.equal(kirana.tier, "starter", `Kirana should recommend Starter, got ${kirana.tier}`);

// Brief §22 Test 2 — Boutique: high competition, strong Instagram/visual opportunity. Expected: Growth.
const boutique = recommendPlan(signals({
  googleBusinessConnected: true,
  discoverabilitySeoScore: 65,
  competitorCount: 7,
  socialContentScore: 30,
  visualContentOpportunityCount: 5,
  hasWebsite: false,
  trustReputationScore: 65,
  highImpactFindingCount: 3,
}));
assert.equal(boutique.tier, "growth", `Boutique should recommend Growth, got ${boutique.tier}`);

// Brief §22 Test 3 — high competition + high content demand + no website + high automation need. Expected: Business.
const highCompetition = recommendPlan(signals({
  googleBusinessConnected: true,
  discoverabilitySeoScore: 55,
  competitorCount: 12,
  socialContentScore: 20,
  visualContentOpportunityCount: 9,
  hasWebsite: false,
  trustReputationScore: 55,
  highImpactFindingCount: 7,
}));
assert.equal(highCompetition.tier, "business", `High-competition business should recommend Business, got ${highCompetition.tier}`);

// Brief §22 Test 4 — strong Google profile, little social demand. Expected: Starter, not an automatic upsell.
const strongProfile = recommendPlan(signals({
  googleBusinessConnected: true,
  discoverabilitySeoScore: 90,
  competitorCount: 1,
  socialContentScore: 82,
  visualContentOpportunityCount: 0,
  hasWebsite: true,
  trustReputationScore: 88,
  highImpactFindingCount: 0,
}));
assert.equal(strongProfile.tier, "starter", `Strong-profile business should stay on Starter, got ${strongProfile.tier}`);

// Every recommendation carries the full brief §11 UX shape.
for (const rec of [kirana, boutique, highCompetition, strongProfile]) {
  assert.ok(rec.biggestOpportunity.title, "biggestOpportunity.title is present");
  assert.ok(rec.biggestOpportunity.body, "biggestOpportunity.body is present");
  assert.ok(rec.whatStratxcelCanDo.length > 0, "whatStratxcelCanDo is non-empty");
  assert.ok(rec.why.length > 0, "why is non-empty");
}

console.log("plan-recommendation.test.ts: ALL PASS (brief §22 Test 1-4 worked examples)");
