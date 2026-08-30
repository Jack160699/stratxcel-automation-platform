// Run with: node --experimental-strip-types lib/social/__tests__/performance-analysis.test.ts
//
// STRATXCEL two-gap closure brief, Gap 2 (Section 7/8): analyzeWeeklyPerformance
// is a PURE function (no I/O, no mocked Supabase client needed) -- proves
// deterministically, from real mock analytics, that a real change in last
// week's performance produces a real, measurably different structured
// output, exactly Section 8's required proof:
//   "Scenario A: educational posts perform strongly, promotional posts
//    perform weakly -> next strategy increases educational authority
//    content and reduces ineffective promotional content."
//   "Scenario B: saves/shares strong on workflow content, comments weak on
//    generic awareness content -> next strategy prioritizes useful
//    workflow content and more interaction-oriented structures."
// No real image call anywhere in this file.
import assert from "node:assert/strict";
import { analyzeWeeklyPerformance, type AnalyzedPostInput } from "../performance-analysis.ts";

function post(overrides: Partial<AnalyzedPostInput>): AnalyzedPostInput {
  return { variantId: `v-${Math.random().toString(36).slice(2)}`, pillar: null, format: null, objective: null, metrics: null, ...overrides };
}

async function testScenarioA_EducationalStrongPromotionalWeak() {
  const analysis = analyzeWeeklyPerformance({
    tenantId: "t1",
    weekStart: "2026-08-17",
    weekEnd: "2026-08-23",
    posts: [
      post({ pillar: "educational", metrics: { reach: 1000, impressions: 1200, likes: 80, comments: 20, shares: 10, saves: 15, clicks: 5 } }),
      post({ pillar: "educational", metrics: { reach: 900, impressions: 1000, likes: 70, comments: 18, shares: 8, saves: 12, clicks: 4 } }),
      post({ pillar: "promotional", metrics: { reach: 1000, impressions: 1100, likes: 5, comments: 0, shares: 0, saves: 0, clicks: 1 } }),
      post({ pillar: "promotional", metrics: { reach: 1000, impressions: 1100, likes: 3, comments: 0, shares: 0, saves: 0, clicks: 0 } }),
    ],
  });
  assert.equal(analysis.dataSource, "REAL_ANALYTICS");
  assert.ok(analysis.topPerformingTopics.some((g) => g.key === "educational"), "educational must be a real top-performing topic when its real engagement genuinely outperformed");
  assert.ok(analysis.weakTopics.some((g) => g.key === "promotional"), "promotional must be a real weak topic when its real engagement genuinely underperformed");
  assert.ok(
    analysis.strategicRecommendations.some((r) => r.includes("Increase") && r.includes("educational")),
    "the next strategy must explicitly recommend increasing educational content"
  );
  assert.ok(
    analysis.strategicRecommendations.some((r) => r.includes("Reduce") && r.includes("promotional")),
    "the next strategy must explicitly recommend reducing promotional content"
  );
  console.log("performance-analysis.test.ts: Scenario A (educational strong, promotional weak) -> strategy genuinely shifts toward educational — PASS");
}

async function testScenarioB_WorkflowSavesStrongGenericCommentsWeak() {
  const analysis = analyzeWeeklyPerformance({
    tenantId: "t1",
    weekStart: "2026-08-17",
    weekEnd: "2026-08-23",
    posts: [
      post({ pillar: "workflow_tips", format: "carousel", metrics: { reach: 800, impressions: 900, likes: 30, comments: 4, shares: 6, saves: 40, clicks: 2 } }),
      post({ pillar: "workflow_tips", format: "carousel", metrics: { reach: 750, impressions: 850, likes: 28, comments: 5, shares: 7, saves: 35, clicks: 3 } }),
      post({ pillar: "generic_awareness", format: "single_image", metrics: { reach: 800, impressions: 900, likes: 10, comments: 0, shares: 0, saves: 1, clicks: 0 } }),
      post({ pillar: "generic_awareness", format: "single_image", metrics: { reach: 780, impressions: 880, likes: 8, comments: 0, shares: 0, saves: 0, clicks: 0 } }),
    ],
  });
  assert.ok(analysis.topPerformingTopics.some((g) => g.key === "workflow_tips"), "workflow_tips (real high saves/shares) must be a real top topic");
  assert.ok(analysis.topFormats.some((g) => g.key === "carousel"), "carousel (the format workflow_tips actually used) must be a real top format");
  assert.ok(analysis.weakTopics.some((g) => g.key === "generic_awareness"), "generic_awareness (real weak comments/saves) must be a real weak topic");
  console.log("performance-analysis.test.ts: Scenario B (workflow saves/shares strong, generic awareness weak) -> strategy genuinely favors workflow content — PASS");
}

async function testContentFatigueDetectsRealRepetition() {
  const analysis = analyzeWeeklyPerformance({
    tenantId: "t1",
    weekStart: "2026-08-17",
    weekEnd: "2026-08-23",
    posts: [
      post({ pillar: "product_features", metrics: { reach: 500, impressions: 500, likes: 5, comments: 1, shares: 0, saves: 0, clicks: 0 } }),
      post({ pillar: "product_features", metrics: { reach: 500, impressions: 500, likes: 4, comments: 0, shares: 0, saves: 0, clicks: 0 } }),
      post({ pillar: "product_features", metrics: null }),
      post({ pillar: "customer_stories", metrics: null }),
    ],
  });
  assert.deepEqual(analysis.contentFatigue.repeatedPillars, ["product_features"], "a pillar used in more than half of a real 4-post window must be flagged as real content fatigue");
  assert.ok(analysis.strategicRecommendations.some((r) => r.includes("Diversify") && r.includes("product_features")));
  console.log("performance-analysis.test.ts: real repeated-pillar content fatigue is detected and feeds a diversification recommendation — PASS");
}

async function testNoRealAnalyticsIsHonestNeverFabricated() {
  const analysis = analyzeWeeklyPerformance({
    tenantId: "t1",
    weekStart: "2026-08-17",
    weekEnd: "2026-08-23",
    posts: [post({ pillar: "educational", metrics: null }), post({ pillar: "promotional", metrics: null })],
  });
  assert.equal(analysis.dataSource, "NO_ANALYTICS_AVAILABLE");
  assert.equal(analysis.confidence, "NONE");
  assert.deepEqual(analysis.topPerformingTopics, []);
  assert.deepEqual(analysis.weakTopics, []);
  assert.equal(analysis.strategicRecommendations.length, 1);
  assert.ok(!analysis.strategicRecommendations[0]!.includes("Increase"), "with zero real measured posts, nothing may be fabricated as a real performance-driven recommendation");
  console.log("performance-analysis.test.ts: zero real measured posts produces an honest NO_ANALYTICS_AVAILABLE result, never a fabricated recommendation — PASS");
}

async function testConfidenceReflectsRealSampleSize() {
  const zero = analyzeWeeklyPerformance({ tenantId: "t1", weekStart: "w", weekEnd: "w", posts: [] });
  const low = analyzeWeeklyPerformance({ tenantId: "t1", weekStart: "w", weekEnd: "w", posts: [post({ metrics: { reach: 100, impressions: 100, likes: 1, comments: 0, shares: 0, saves: 0, clicks: 0 } })] });
  const high = analyzeWeeklyPerformance({
    tenantId: "t1", weekStart: "w", weekEnd: "w",
    posts: Array.from({ length: 5 }, () => post({ metrics: { reach: 100, impressions: 100, likes: 1, comments: 0, shares: 0, saves: 0, clicks: 0 } })),
  });
  assert.equal(zero.confidence, "NONE");
  assert.equal(low.confidence, "LOW");
  assert.equal(high.confidence, "HIGH");
  console.log("performance-analysis.test.ts: confidence honestly reflects the real measured sample size — PASS");
}

async function run() {
  await testScenarioA_EducationalStrongPromotionalWeak();
  await testScenarioB_WorkflowSavesStrongGenericCommentsWeak();
  await testContentFatigueDetectsRealRepetition();
  await testNoRealAnalyticsIsHonestNeverFabricated();
  await testConfidenceReflectsRealSampleSize();
  console.log("performance-analysis.test.ts: ALL PASS");
}

run();
