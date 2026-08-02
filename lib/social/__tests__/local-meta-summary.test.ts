import assert from "node:assert/strict";
import { calculateLocalMetricsSummary } from "../local-meta-summary.ts";
import type { MetricsRow } from "../repositories/analytics.ts";

function metric(reach: number, impressions: number, likes: number, comments: number, shares: number, saves: number): MetricsRow {
  return { id: crypto.randomUUID(), variant_id: "v", provider_post_id: null, measured_at: new Date().toISOString(), reach, impressions, views: 0, watch_time_seconds: 0, likes, comments, shares, saves, clicks: 0, followers_gained: 0, leads: 0, conversions: 0, raw: {} };
}

const summary = calculateLocalMetricsSummary([metric(200, 300, 10, 4, 2, 4), metric(100, 150, 5, 2, 1, 2)]);
assert.equal(summary.totalReach, 300);
assert.equal(summary.totalImpressions, 450);
assert.equal(summary.totalEngagements, 30);
assert.equal(summary.engagementRatePercent, 10);
assert.equal(summary.reachTrendPercent, 100);
assert.ok(summary.text.includes("External AI was not used"));
assert.ok(calculateLocalMetricsSummary([]).text.includes("External AI is disabled"));
console.log("local-meta-summary.test.ts: ALL PASS (totals, engagement rate, trend, deterministic copy)");
