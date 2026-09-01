// Regression for the manual "Analyze Now" control
// (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 23): once a
// project already existed, there was no way to trigger a fresh analysis --
// "Run Search Analysis" only ever rendered in the pre-project onboarding
// branch. This pins that the new control actually reuses the real,
// existing analysis engine (never a second/duplicate one), uses the
// project's own already-known propertyUrl (no re-entry), and has real
// idle/running/success/error states with duplicate-click prevention.
//
// Run with: node --experimental-strip-types app/app/search/__tests__/analyze-now.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const searchPage = stripComments(read("app", "app", "search", "page.tsx"));

// --- reuses the exact same real analysis endpoint as onboarding's "Run Search Analysis" -- never a second engine ---
const runCalls = searchPage.match(/fetch\("\/api\/platform\/search\/run"/g) ?? [];
assert.equal(runCalls.length, 2, "both runFirstAnalysis (onboarding) and analyzeNow (post-onboarding) must call the same real /api/platform/search/run endpoint -- exactly two call sites, never a third/duplicate one");

// --- analyzeNow uses the project's own already-known propertyUrl, never forcing re-entry ---
assert.match(searchPage, /propertyUrl:\s*data\.propertyUrl/, "Analyze Now must send the real, already-known project propertyUrl, not require the customer to retype their website");

// --- real idle/running/success/error state machine, not a fabricated instant success ---
assert.match(searchPage, /analyzeState/, "must track a real analyze state");
assert.match(searchPage, /"Analyzing…"/, "must show a real in-progress label while the request is outstanding");
assert.match(searchPage, /"Analysis complete"/, "must show a real success label, only after the real endpoint responds ok");
assert.match(searchPage, /We couldn't complete the analysis/, "must show an honest failure message, never a raw stack trace or silent failure");
assert.match(searchPage, /Retry/, "a failed analysis must offer a real retry, not a dead end");

// --- duplicate-click prevention: the trigger must bail while already running, and the button must be disabled while running ---
assert.match(searchPage, /analyzeState === "running"\)\s*return/, "analyzeNow must bail out immediately if a run is already in progress, preventing duplicate concurrent triggers");
assert.match(searchPage, /disabled=\{analyzeState === "running"\}/, "the Analyze Now button must be disabled while a run is in progress");

// --- must only ever fire after a real ok response -- never a fabricated success shown before the server confirms ---
assert.match(searchPage, /await load\(\);\s*\n\s*setAnalyzeState\("success"\)/, "success state must only be set after reloading real dashboard data post-completion, never optimistically before the server responds");

// --- surfaces a real "Last analyzed" timestamp sourced from the dashboard's own real data, never a client-side Date.now() fabrication ---
assert.match(searchPage, /data\.lastAnalysisCompletedAt/, "must surface the real lastAnalysisCompletedAt from SearchGrowthDashboardData, never a locally fabricated timestamp");
assert.doesNotMatch(searchPage, /Last analyzed:.*Date\.now\(\)/, "must never fabricate a 'Last analyzed' timestamp from the current instant instead of a real completed run");

console.log("analyze-now.test.ts: ALL PASS -- Analyze Now reuses the real analysis engine, uses the known propertyUrl, has honest running/success/error states with duplicate-click prevention, and a real Last analyzed timestamp");
