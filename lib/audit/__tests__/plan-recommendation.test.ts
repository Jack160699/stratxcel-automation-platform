import assert from "node:assert/strict";
import { recommendPlan, deriveSignalsFromReport, type PlanRecommendationSignals } from "../plan-recommendation.ts";

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

// --- deriveSignalsFromReport: real bug fix, previously zero test coverage ---
// (Final Customer Experience Repair mission) -- every field it used to read
// does not exist on the real AuditDeliveryReport the audit engine actually
// produces, so every signal always evaluated to null/0/false. Verifies it
// now reads the report's REAL shape (categoryScores, connectorAvailability,
// whyTheyWin, contentCoverage, findings, websiteUrl).
const realShapedReport = {
  scores: { overall: 55 },
  categoryScores: {
    discoverabilitySeo: { score: 32, explanation: "Weak organic visibility.", evidenceSourceIds: ["gsc"] },
    socialContent: { score: 28, explanation: "Sparse posting cadence.", evidenceSourceIds: ["ig"] },
    websiteConversion: { score: 61, explanation: "No clear CTA.", evidenceSourceIds: ["crawl"] },
    trustReputation: { score: 70, explanation: "Good review volume.", evidenceSourceIds: ["reviews"] },
    brandPositioning: { score: null, explanation: "Not enough evidence.", evidenceSourceIds: [] },
    leadGeneration: { score: 40, explanation: "No lead capture form.", evidenceSourceIds: [] },
    customerJourney: { score: 50, explanation: "", evidenceSourceIds: [] },
    automationOperations: { score: 45, explanation: "", evidenceSourceIds: [] },
  },
  connectorAvailability: [{ provider: "google_business", state: "available" }],
  whyTheyWin: [{ competitorDomain: "a.com" }, { competitorDomain: "b.com" }],
  contentCoverage: { missingServices: ["x"], missingLocations: ["y", "z"], weakPages: [] },
  websiteUrl: "https://example.com",
  findings: [
    { id: "1", title: "t", summary: "s", impact: "HIGH", evidenceSourceIds: [], confidence: "HIGH" },
    { id: "2", title: "t2", summary: "s2", impact: "MEDIUM", evidenceSourceIds: [], confidence: "HIGH" },
    { id: "3", title: "t3", summary: "s3", impact: "HIGH", evidenceSourceIds: [], confidence: "MEDIUM" },
  ],
};
const derived = deriveSignalsFromReport(realShapedReport);
assert.equal(derived.googleBusinessConnected, true, "must read connectorAvailability, not the nonexistent report.connectors");
assert.equal(derived.discoverabilitySeoScore, 32, "must read categoryScores.discoverabilitySeo.score");
assert.equal(derived.socialContentScore, 28, "must read categoryScores.socialContent.score");
assert.equal(derived.websiteHealthScore, 61, "must read categoryScores.websiteConversion.score");
assert.equal(derived.trustReputationScore, 70, "must read categoryScores.trustReputation.score");
assert.equal(derived.competitorCount, 2, "must read whyTheyWin.length, not the nonexistent report.competitors");
assert.equal(derived.visualContentOpportunityCount, 3, "must sum contentCoverage's real arrays, not the nonexistent report.contentOpportunities");
assert.equal(derived.hasWebsite, true, "must read the real report.websiteUrl");
assert.equal(derived.highImpactFindingCount, 2, "must count findings with impact === HIGH, not the nonexistent severity/priority fields");

// A report with none of these real fields present must degrade honestly
// (null/0/false), never throw.
const emptyDerived = deriveSignalsFromReport({});
assert.equal(emptyDerived.discoverabilitySeoScore, null);
assert.equal(emptyDerived.competitorCount, 0);
assert.equal(emptyDerived.hasWebsite, false);
assert.equal(emptyDerived.highImpactFindingCount, 0);

console.log("plan-recommendation.test.ts: ALL PASS (Commercial Scenarios A-E & Demos, deriveSignalsFromReport reads the real report shape)");
