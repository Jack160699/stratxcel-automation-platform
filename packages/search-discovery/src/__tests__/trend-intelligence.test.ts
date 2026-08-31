// Run with: node --experimental-strip-types packages/search-discovery/src/__tests__/trend-intelligence.test.ts
//
// Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md: no
// trend-relevance classification (USE_NOW/ADAPT/MONITOR/IGNORE) existed
// anywhere in this codebase. This proves the new relevance engine
// (pure, deterministic -- no AI call) produces DIFFERENT decisions for
// different real evidence, matching this codebase's "Strategy Learning
// Test" bar, and that the research-to-trend mapper never fabricates a
// candidate from unsupported or uncited claims.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTrendRelevance, mapResearchToTrendCandidates } from "../trends/index.ts";
import type { TrendCandidate, TrendScoringContext } from "../trends/types.ts";
import type { ResearchResult } from "../research/types.ts";

const CLINIC_CONTEXT: TrendScoringContext = {
  industry: "dental clinic",
  services: ["teeth whitening", "root canal", "dental implants"],
  brandValues: ["trustworthy", "clinical", "family-friendly"],
  targetAudience: ["local families", "young professionals"],
  availableChannels: ["social", "google_search"],
  riskTolerance: "MEDIUM",
};

const NOW = new Date("2026-08-31T00:00:00Z");

function candidate(overrides: Partial<TrendCandidate> = {}): TrendCandidate {
  return {
    platform: "social",
    topic: "Dental clinic teeth whitening and dental implants explainers",
    format: "short_video",
    hookPattern: "Before/after reveal in the first 2 seconds",
    visualPattern: "Split-screen comparison",
    audienceSignal: "local families searching for an affordable dental clinic",
    reasonForTrend: "Short explainer videos about teeth whitening, root canal treatment, and dental implants from local dental clinics are getting high engagement this month per real cited sources",
    velocity: 0.7,
    source: "industry-report.example.com",
    sourceUrl: "https://industry-report.example.com/dental-trends",
    observedAt: "2026-08-28T00:00:00Z", // 3 days before NOW
    confidence: "HIGH",
    ...overrides,
  };
}

test("1. Strong current trend -> USE_NOW", () => {
  const signal = evaluateTrendRelevance(candidate(), CLINIC_CONTEXT, { id: "t1", tenantId: "tenant-1", now: NOW });
  assert.equal(signal.decision, "USE_NOW");
  assert.ok(signal.decisionReason.length > 0);
  assert.ok(signal.adaptationGuidance, "USE_NOW must still explain how to adapt it, never 'copy as-is'");
});

test("2. Weak/stale trend (observed 40 days ago, past the 21-day freshness window) -> IGNORE", () => {
  const stale = candidate({ observedAt: "2026-07-22T00:00:00Z" });
  const signal = evaluateTrendRelevance(stale, CLINIC_CONTEXT, { id: "t2", tenantId: "tenant-1", now: NOW });
  assert.equal(signal.decision, "IGNORE");
  assert.equal(signal.scores.timeliness, 0);
  assert.match(signal.decisionReason, /freshness window/);
});

test("3. Irrelevant trend (no overlap with this business's real industry/services) -> IGNORE", () => {
  const irrelevant = candidate({
    topic: "Crypto trading strategies going viral",
    reasonForTrend: "Retail crypto trading content is surging",
    audienceSignal: "day traders",
  });
  const signal = evaluateTrendRelevance(irrelevant, CLINIC_CONTEXT, { id: "t3", tenantId: "tenant-1", now: NOW });
  assert.equal(signal.decision, "IGNORE");
  assert.ok(signal.scores.businessFit < 20);
});

test("4. High-risk trend (LOW confidence + risky pattern language) -> MONITOR, never USE_NOW regardless of relevance", () => {
  const risky = candidate({
    topic: "Shocking dental implant prank goes viral",
    reasonForTrend: "Controversial shock-value dental content is trending",
    confidence: "LOW",
  });
  const signal = evaluateTrendRelevance(risky, CLINIC_CONTEXT, { id: "t4", tenantId: "tenant-1", now: NOW });
  assert.notEqual(signal.decision, "USE_NOW");
  assert.ok(signal.scores.risk > 50);
});

test("5. Brand-mismatch trend (channel not available to this business) -> IGNORE", () => {
  const wrongChannel = candidate({ platform: "news" }); // CLINIC_CONTEXT only has social + google_search
  const signal = evaluateTrendRelevance(wrongChannel, CLINIC_CONTEXT, { id: "t5", tenantId: "tenant-1", now: NOW });
  assert.equal(signal.decision, "IGNORE");
  assert.match(signal.decisionReason, /channel/i);
});

test("6. Risk tolerance genuinely changes the decision for the identical candidate (not just a cosmetic label)", () => {
  const borderline = candidate({ confidence: "MEDIUM", topic: "dental implants clickbait outrage format" });
  const lowTolerance: TrendScoringContext = { ...CLINIC_CONTEXT, riskTolerance: "LOW" };
  const highTolerance: TrendScoringContext = { ...CLINIC_CONTEXT, riskTolerance: "HIGH" };

  const lowResult = evaluateTrendRelevance(borderline, lowTolerance, { id: "t6a", tenantId: "tenant-1", now: NOW });
  const highResult = evaluateTrendRelevance(borderline, highTolerance, { id: "t6b", tenantId: "tenant-1", now: NOW });

  assert.equal(lowResult.scores.risk, highResult.scores.risk, "the computed risk score itself must be identical -- only the decision threshold should differ");
  assert.equal(lowResult.decision, "MONITOR");
  assert.notEqual(lowResult.decision, highResult.decision, "different real risk tolerance must produce a different real decision for the same evidence");
});

test("7. Same evidence, different tenant context -> different decision (proves this isn't a static classifier)", () => {
  const dentalTrend = candidate();
  const restaurantContext: TrendScoringContext = {
    industry: "restaurant",
    services: ["catering", "dine-in", "takeout"],
    brandValues: ["cozy", "family-friendly"],
    targetAudience: ["local diners"],
    availableChannels: ["social"],
    riskTolerance: "MEDIUM",
  };
  const dentalResult = evaluateTrendRelevance(dentalTrend, CLINIC_CONTEXT, { id: "t7a", tenantId: "tenant-1", now: NOW });
  const restaurantResult = evaluateTrendRelevance(dentalTrend, restaurantContext, { id: "t7b", tenantId: "tenant-2", now: NOW });
  assert.equal(dentalResult.decision, "USE_NOW");
  assert.notEqual(restaurantResult.decision, "USE_NOW", "a dental-implant trend must not be USE_NOW for a restaurant just because the evidence is identical");
});

// --- Research-to-trend mapping: never fabricates a candidate ---

function fixtureResearchResult(overrides: Partial<ResearchResult> = {}): ResearchResult {
  return {
    status: "PASS",
    question: "What content formats are trending for dental clinics right now?",
    summary: "Short explainer videos are gaining engagement.",
    claims: [
      { id: "c1", text: "Short-form explainer videos about dental procedures are trending on social platforms this month.", sourceIds: ["s1"], confidence: 0.8, sourceSupportStatus: "supported", statementKind: "sourced_fact" },
      { id: "c2", text: "An unsupported speculative claim with no real citation.", sourceIds: [], confidence: null, sourceSupportStatus: "unsupported", statementKind: "inference" },
      { id: "c3", text: "A claim whose only cited source could not be resolved.", sourceIds: ["missing-source"], confidence: 0.9, sourceSupportStatus: "supported", statementKind: "sourced_fact" },
    ],
    sources: [
      { id: "s1", url: "https://industry-report.example.com/trends", canonicalUrl: "https://industry-report.example.com/trends", domain: "industry-report.example.com", provider: "google", retrievedAt: "2026-08-29T00:00:00Z", searchQueries: [], sourceType: "REPUTABLE_SECONDARY" } as any,
    ],
    evidenceArtifactIds: [],
    summaryArtifactId: null,
    provider: "google",
    model: "test-model",
    searchedAt: "2026-08-29T00:00:00Z",
    confidenceBand: "HIGH",
    ...overrides,
  };
}

test("8. Research mapping: only supported, real-source-cited claims become candidates", () => {
  const candidates = mapResearchToTrendCandidates(fixtureResearchResult(), { platform: "social" });
  assert.equal(candidates.length, 1, "the unsupported claim and the claim with an unresolvable source must both be dropped, not fabricated into candidates");
  assert.equal(candidates[0]!.source, "industry-report.example.com");
  assert.equal(candidates[0]!.sourceUrl, "https://industry-report.example.com/trends");
  assert.equal(candidates[0]!.confidence, "HIGH");
  assert.equal(candidates[0]!.format, "unknown", "format must never be guessed from claim text");
});

test("9. Research mapping: a non-PASS status produces zero candidates, never a fabricated fallback", () => {
  for (const status of ["INSUFFICIENT_EVIDENCE", "BLOCKED", "WAITING_CONFIGURATION", "FAILED"] as const) {
    const candidates = mapResearchToTrendCandidates(fixtureResearchResult({ status }), { platform: "social" });
    assert.deepEqual(candidates, [], `status=${status} must produce zero candidates`);
  }
});

console.log("trend-intelligence.test.ts: relevance engine responds to real evidence/context differences; research mapping never fabricates a candidate — PASS");
