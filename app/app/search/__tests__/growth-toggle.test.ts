// Regression for the Growth toggle (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
// Update 22): search_projects.enabled already existed and was already the
// real, live gate the daily scheduler filters on
// (app/api/internal/search/scheduler/route.ts's `.eq("enabled", true)") --
// but nothing anywhere ever let a customer actually change it. This pins
// both ends of that wiring: the real scheduler gate stays intact, and the
// new customer-facing control is actually rendered, not orphaned.
//
// Run with: node --experimental-strip-types app/app/search/__tests__/growth-toggle.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const scheduler = stripComments(read("app", "api", "internal", "search", "scheduler", "route.ts"));
const searchPage = stripComments(read("app", "app", "search", "page.tsx"));

// --- the real scheduler eligibility gate this whole feature depends on must remain intact ---
assert.match(scheduler, /\.eq\("enabled",\s*true\)/, "the daily scheduler must keep filtering on search_projects.enabled -- this is the real gate the customer-facing toggle controls");

// --- the toggle control is actually wired into the real page, not built and orphaned ---
assert.match(searchPage, /\/api\/platform\/search\/toggle/, "the search page must call the real toggle endpoint");
assert.match(searchPage, /role="switch"/, "a real, accessible toggle control must be rendered");
assert.match(searchPage, /aria-checked=\{data\.growthEnabled/, "the toggle's checked state must reflect the real growthEnabled value from the dashboard, never a hardcoded state");

// --- never fabricates success locally; only the real endpoint response can confirm it ---
assert.doesNotMatch(searchPage, /setData\(\(current\) => \(current \? \{ \.\.\.current, growthEnabled: next \} : current\)\);[\s\S]{0,300}return;/, "the optimistic update must be reverted on a failed response, not left standing");
assert.match(searchPage, /if \(!response\.ok\) setData\(previous\)/, "a failed toggle request must revert the optimistic UI update, never leave a fabricated on/off state showing");

console.log("growth-toggle.test.ts: ALL PASS -- real scheduler gate intact, real customer control wired, failures revert rather than fabricate");
