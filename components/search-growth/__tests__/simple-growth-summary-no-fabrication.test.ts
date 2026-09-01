// Static-source-assertion regression for SimpleGrowthSummary.tsx
// (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 23): the
// customer-facing "Simple view" of Search Growth must map ONLY real,
// already-existing SearchGrowthDashboardData fields into plain-language
// status words -- it must never invent a new metric, a hardcoded score,
// or a fallback claim that looks like real data. Same static-source-
// assertion pattern already established for SearchGrowthDashboardView.tsx
// (components/search-growth/__tests__/no-fabrication.test.ts), since this
// repo's plain `node --experimental-strip-types` convention can't execute
// JSX directly.
//
// Run with: node --experimental-strip-types components/search-growth/__tests__/simple-growth-summary-no-fabrication.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const source = stripComments(read("components", "search-growth", "SimpleGrowthSummary.tsx"));

// --- must derive its SEO/AEO/GEO status words from real, existing scorecards -- never a new field ---
assert.match(source, /data\.scorecards\.organicVisibility/, "SEO status must come from the real organicVisibility scorecard");
assert.match(source, /data\.scorecards\.aiVisibility/, "AEO status must come from the real aiVisibility scorecard");
assert.match(source, /data\.scorecards\.localPresence/, "GEO status must come from the real localPresence scorecard");

// --- the status-word derivation must be driven by the metric's own real trend/confidence/value, never a hardcoded label ---
assert.match(source, /metric\.trend\s*===\s*"INSUFFICIENT_DATA"/, "must honestly report 'not enough data' from the metric's own real trend, never guessing a status");
assert.match(source, /metric\.value\s*===\s*null/, "must honestly report 'not enough data' when the real value is null, never inventing a status for missing data");
assert.match(source, /metric\.trend\s*===\s*"DECLINING"/, "'Needs attention' must be driven by the metric's own real DECLINING trend");

// --- "what StratXcel did" must come from the real action center counts, never a fabricated number ---
assert.match(source, /actionCenter/, "must read the real actionCenter counts");
assert.doesNotMatch(source, /verifiedCount\s*(\?\?|\|\|)\s*[1-9]/, "verifiedCount must never fall back to a fabricated non-zero count");
assert.doesNotMatch(source, /inProgressCount\s*(\?\?|\|\|)\s*[1-9]/, "inProgressCount must never fall back to a fabricated non-zero count");

// --- "needs your attention" / "next" must come from real alerts/connectors/actions, with an honest empty-state fallback, never an invented specific claim ---
assert.match(source, /continuousGrowth\.activeAlerts/, "must surface real activeAlerts when present");
assert.match(source, /connectorHealth/, "must surface a real disconnected connector when present");
assert.match(source, /actionCenter\.actions/, "the 'Next' section must come from a real pending action, never an invented one");
assert.match(source, /Nothing needs your attention right now/, "must have an honest empty-state fallback when there is genuinely nothing to flag");
assert.match(source, /Nothing pending/, "must have an honest empty-state fallback when there is genuinely no next action");

// --- must never hardcode a specific plausible-looking score or count as a fallback ---
assert.doesNotMatch(source, /\?\?\s*\d{2,3}\b/, "must never fall back to a fabricated multi-digit score");
assert.doesNotMatch(source, /\|\|\s*"Good"/, "'Good' must only ever come from the real statusWord() derivation, never an unconditional || fallback");
assert.doesNotMatch(source, /\?\?\s*"Good"/, "'Good' must only ever come from the real statusWord() derivation, never an unconditional ?? fallback");

// --- must never call a new/duplicate API -- purely a presentation layer over already-fetched data ---
assert.doesNotMatch(source, /fetch\(/, "must never fetch its own data -- it only maps the SearchGrowthDashboardData already passed in as a prop");

console.log("simple-growth-summary-no-fabrication.test.ts: ALL PASS -- Simple view derives every status word from real, existing dashboard fields, with honest empty-state fallbacks, never a fabricated metric");
