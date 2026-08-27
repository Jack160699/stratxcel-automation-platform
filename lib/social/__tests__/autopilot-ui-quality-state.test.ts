// Phase K (UI must present a real quality state, not just PLANNED/BLOCKED):
// verifies the quality score computed and persisted during preparation
// (package-autopilot.ts's creativeSpec.qualityScore) actually reaches the
// API response and is rendered in the dashboard -- not just computed and
// discarded. Source-text verification, matching this test suite's existing
// convention for files whose module graph can't be resolved standalone.
// Run with: node --experimental-strip-types lib/social/__tests__/autopilot-ui-quality-state.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const autopilot = read("lib", "social", "package-autopilot.ts");
  const api = read("app", "api", "platform", "social", "autopilot", "route.ts");
  const ui = read("app", "app", "content", "autopilot", "AutopilotDashboard.tsx");

  // --- Persisted at preparation time, in the existing extensible column. ---
  assert.ok(autopilot.includes("creativeSpec:") && autopilot.includes("qualityScore: qualityScore.score"), "the real quality score must be persisted on the content variant at preparation time");
  assert.ok(autopilot.includes("concept: brief.concept"), "the creative concept must be persisted alongside the score for later display/diversity tracking");

  // --- Read back and returned by the API, never fabricated client-side. ---
  assert.ok(api.includes("creative_spec"), "the API must select creative_spec to read the persisted quality score back");
  assert.ok(api.includes("qualityScore") && api.includes("typeof creativeSpec.qualityScore === \"number\""), "qualityScore must only be exposed when it's a real persisted number, never defaulted or fabricated");

  // --- Rendered in the dashboard as an actual quality state. ---
  assert.ok(ui.includes("qualityScore"), "the dashboard must render the quality score, not just status/caption");
  assert.ok(ui.includes("Quality "), "the quality state must be visibly labeled, not a bare unexplained number");
  assert.ok(ui.includes("item.qualityScore != null"), "the quality chip must only render when a real score exists -- never show a fabricated default for older content");

  console.log("autopilot-ui-quality-state.test.ts: ALL PASS (real quality score flows preparation -> API -> dashboard)");
}

run();
