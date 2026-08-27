// Re-scores a previously captured real-generation results file against the
// CURRENT quality-score.ts, reconstructing each item's exact
// recentCaptions/recentConcepts/recentPillars history in original order
// (required for an accurate creativeOriginality/diversity recomputation).
// Re-scores REAL previously-generated model text -- no new API calls, no
// new spend -- to honestly measure the effect of scorer fixes on the
// existing real dataset rather than requiring a fresh, costly re-run.
//
// Usage: node --experimental-strip-types scripts/quality-campaign-rescore.ts <resultsJsonPath>

import fs from "node:fs";
import { parseGeneratedCopy } from "../lib/social/generated-copy-parser.ts";
import { scoreGeneratedContent } from "../lib/social/quality-score.ts";
import { ALL_FIXTURES } from "../lib/social/__tests__/fixtures/business-fixtures.ts";

interface StoredResult {
  fixture: string;
  index: number;
  contentPillar: string;
  concept: string;
  industry: string;
  audience: string;
  verifiedFacts: string[];
  objective: string;
  rawModelText: string[];
}

const RESULTS_PATH = process.argv[2];
if (!RESULTS_PATH) {
  console.error("Usage: quality-campaign-rescore.ts <resultsJsonPath>");
  process.exit(1);
}

const results: StoredResult[] = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
const byFixture = new Map<string, StoredResult[]>();
for (const r of results) {
  if (!byFixture.has(r.fixture)) byFixture.set(r.fixture, []);
  byFixture.get(r.fixture)!.push(r);
}
for (const list of byFixture.values()) list.sort((a, b) => a.index - b.index);

interface RescoredItem { fixture: string; index: number; score: number; passed: boolean; hardFailures: string[] }
const rescored: RescoredItem[] = [];

for (const [fixtureKey, items] of byFixture) {
  const fixture = ALL_FIXTURES.find((f) => f.key === fixtureKey)!;
  const recentCaptions: string[] = [];
  const recentConcepts: string[] = [];
  for (const item of items) {
    // Re-parse from the LAST real attempt's raw model text (the same text
    // the original run's final scoring decision was based on).
    const lastRaw = item.rawModelText[item.rawModelText.length - 1];
    const copy = lastRaw ? parseGeneratedCopy(lastRaw) : { title: "", masterIdea: "", caption: "", hashtags: [] };
    const result = scoreGeneratedContent({
      caption: copy.caption,
      title: copy.title,
      hashtags: copy.hashtags,
      businessName: fixture.businessName,
      contentPillar: item.contentPillar,
      concept: item.concept,
      industry: item.industry as never,
      verifiedFacts: item.verifiedFacts,
      brandTone: fixture.brandTone,
      audience: item.audience,
      objective: item.objective as never,
      recentCaptions: [...recentCaptions],
      recentConcepts: [...recentConcepts],
    });
    rescored.push({ fixture: fixtureKey, index: item.index, score: result.score, passed: result.passed, hardFailures: result.hardFailures.map((f) => f.reason) });
    // Mirror the real harness's history accumulation: every item's pillar/
    // concept is added; caption only if one was actually produced.
    recentConcepts.unshift(item.concept);
    if (copy.caption) recentCaptions.unshift(copy.caption);
  }
}

const passed = rescored.filter((r) => r.passed);
const scores = rescored.map((r) => r.score).sort((a, b) => a - b);
console.log(`Total: ${rescored.length}, Passed: ${passed.length}, Pass rate: ${((passed.length / rescored.length) * 100).toFixed(1)}%`);
console.log(`Avg: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}, Median: ${scores[Math.floor(scores.length / 2)]}, Min: ${scores[0]}, Max: ${scores[scores.length - 1]}`);
console.log();
const byFixtureAgg = new Map<string, RescoredItem[]>();
for (const r of rescored) {
  if (!byFixtureAgg.has(r.fixture)) byFixtureAgg.set(r.fixture, []);
  byFixtureAgg.get(r.fixture)!.push(r);
}
for (const [fixture, items] of byFixtureAgg) {
  const p = items.filter((i) => i.passed).length;
  const avg = (items.reduce((a, i) => a + i.score, 0) / items.length).toFixed(1);
  const reasons = [...new Set(items.filter((i) => !i.passed).flatMap((i) => i.hardFailures))];
  console.log(`  ${fixture.padEnd(14)} ${p}/${items.length} passed, avg ${avg}${reasons.length ? `  hard-fail reasons: ${reasons.join(", ")}` : ""}`);
}
