// Static-source-assertion regression for real fabrication defects found live
// in SearchGrowthDashboardView.tsx (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
// Update 14): this component had zero test coverage of any kind before this
// file (grepped the whole repo -- no .test.tsx exists anywhere, and this
// codebase's plain `node --experimental-strip-types` convention can't
// execute JSX directly, so a full render-and-assert test isn't a quick add).
// This is the proportionate alternative: assert the specific fabricated
// fallback patterns found and fixed can never silently reappear, the same
// static-source-assertion pattern already established elsewhere in this
// repo (e.g. app/api/platform/search/__tests__/api-security.test.ts).
//
// Every pattern below was a REAL, confirmed defect: a null/missing real
// value silently replaced with a specific, plausible-looking fake number or
// claim (65/100 AI visibility, 17 opportunities, "in 2 days" unconditionally
// regardless of the real date, "HIGH confidence" with no real evidence,
// specific fabricated competitor claims) -- shown to whoever views this
// component with zero indication anything was invented.
//
// Run with: node --experimental-strip-types components/search-growth/__tests__/no-fabrication.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "components", "search-growth", "SearchGrowthDashboardView.tsx"),
  "utf8",
);

// --- Fabricated fallback numbers that looked exactly like real measurements ---
assert.doesNotMatch(source, /\?\?\s*65\b/, "must never fall back to a fabricated AI visibility score (65)");
assert.doesNotMatch(source, /\?\?\s*70\b/, "must never fall back to a fabricated mention coverage percentage (70)");
assert.doesNotMatch(source, /\?\?\s*40\b/, "must never fall back to a fabricated competitor citation share (40)");
assert.doesNotMatch(source, /\|\|\s*17\b/, "must never fall back to a fabricated opportunity count (17)");
assert.doesNotMatch(source, /achievedProof\?\.\w+\?\.length\s*\?\?\s*1\b/, "achievedProof counts must never fabricate a fake '1' when real data is missing -- honest 0");

// --- The exact broken ternary that always returned "in 2 days" regardless of the real date ---
assert.doesNotMatch(
  source,
  /nextCycleDueAt\s*\?\s*"in 2 days"\s*:\s*"in 2 days"/,
  "must never use a ternary whose two branches are identical fabricated literals",
);

// --- Specific fabricated narrative fallbacks (never invent a claim about a real competitor or strategy) ---
assert.doesNotMatch(source, /Competitor movement detected on 3 priority queries/, "must never show a fabricated specific strategy narrative as a fallback");
assert.doesNotMatch(source, /dedicated location-specific landing pages and deeper schema coverage/, "must never show a fabricated specific competitor-gap claim as a fallback");
assert.doesNotMatch(source, /Deploy optimized local service schema and dedicated target page/, "must never show a fabricated specific recommended action as a fallback");
assert.doesNotMatch(source, /wtw\.confidence \|\| "HIGH"/, "confidence must never fall back to a fabricated HIGH when no real evidence exists");

// --- Honest fallbacks must exist where the fabricated ones were removed ---
assert.match(source, /Not yet scheduled/, "the next-cycle date must have a real honest fallback for when it is genuinely unknown");
assert.match(source, /Not available/, "AI-search metrics must have a real honest 'Not available' state for null values");

console.log("PASS: SearchGrowthDashboardView contains none of the confirmed fabrication defects; honest fallbacks are present.");
