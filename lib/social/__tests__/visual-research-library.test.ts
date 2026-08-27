import assert from "node:assert/strict";
import { VISUAL_RESEARCH_LIBRARY, researchInsightsForIndustry } from "../visual-research-library.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`visual-research-library.test.ts: ${name} — PASS`);
  } catch (err) {
    console.error(`visual-research-library.test.ts: ${name} — FAIL`);
    throw err;
  }
}

test("every entry has a real source, url, date, pattern, why, and what-not-to-copy", () => {
  assert.ok(VISUAL_RESEARCH_LIBRARY.length >= 5);
  for (const entry of VISUAL_RESEARCH_LIBRARY) {
    assert.ok(entry.source.length > 5, "source");
    assert.ok(entry.url.startsWith("https://"), "url");
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(entry.dateAccessed), "dateAccessed");
    assert.ok(entry.pattern.length > 20, "pattern");
    assert.ok(entry.whyItWorks.length > 10, "whyItWorks");
    assert.ok(entry.whatNotToCopy.length > 10, "whatNotToCopy");
  }
});

test("no entry asserts a bare unproven performance number as fact in pattern/whyItWorks", () => {
  for (const entry of VISUAL_RESEARCH_LIBRARY) {
    const combined = `${entry.pattern} ${entry.whyItWorks}`;
    assert.ok(!/\d+x\s+(more|higher|greater)/i.test(combined), `entry from ${entry.source} states a bare multiplier claim as fact`);
  }
});

test("researchInsightsForIndustry never leaks reportedClaims into the generation-facing output", () => {
  const insights = researchInsightsForIndustry("local_service");
  const combined = insights.join(" ");
  assert.ok(!combined.includes("agency-reported"));
  assert.ok(!/\d+x\s+(more|higher)/i.test(combined));
});

test("industry-specific entries only surface for their industry (plus 'all')", () => {
  const restaurantInsights = researchInsightsForIndustry("restaurant");
  const localServiceInsights = researchInsightsForIndustry("local_service");
  assert.ok(localServiceInsights.length > restaurantInsights.length, "local_service should include its own entry plus 'all', restaurant only 'all'");
});

console.log("visual-research-library.test.ts: ALL PASS");
