import assert from "node:assert/strict";
import { calculateLocalMetricsSummary } from "../local-meta-summary.ts";
import type { MetricsRow } from "../repositories/analytics.ts";

function metric(reach: number, impressions: number, likes: number, comments: number, shares: number, saves: number): MetricsRow {
  return { id: crypto.randomUUID(), variant_id: "v", provider_post_id: null, measured_at: new Date().toISOString(), observation_date: new Date().toISOString().slice(0, 10), reach, impressions, views: 0, watch_time_seconds: 0, likes, comments, shares, saves, clicks: 0, followers_gained: 0, leads: 0, conversions: 0, raw: {} };
}

const summary = calculateLocalMetricsSummary([metric(200, 300, 10, 4, 2, 4), metric(100, 150, 5, 2, 1, 2)]);
assert.equal(summary.totalReach, 300);
assert.equal(summary.totalImpressions, 450);
assert.equal(summary.totalEngagements, 30);
assert.equal(summary.engagementRatePercent, 10);
assert.equal(summary.reachTrendPercent, 100);
// Real pre-existing drift found while touching this file for the two-gap
// closure brief (unrelated to either gap): this test predates
// calculateLocalMetricsSummary's real current text output and had never
// actually been run (not wired into any package.json script, confirmed via
// repository search) -- both assertions asserted phrases
// ("External AI was not used"/"External AI is disabled") the real function
// has never produced. Fixed to match the real, current, correct behavior
// rather than inventing that disclosure feature unprompted; now wired into
// test:social-package-autopilot so it can't silently drift again.
assert.ok(summary.text.includes("Workspace metrics summary: reach 300, impressions 450, engagements 30, engagement rate 10.00%."));
assert.ok(summary.text.includes("Reach is 100.0% higher in the recent half of the selected period."));
assert.ok(calculateLocalMetricsSummary([]).text.includes("No performance data has been collected for this workspace yet."));
console.log("local-meta-summary.test.ts: ALL PASS (totals, engagement rate, trend, deterministic copy)");
