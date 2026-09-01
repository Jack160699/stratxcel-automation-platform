// Regression for the Simple/Detailed dashboard view toggle
// (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 23). The
// account owner was explicit: this is a DIFFERENT concept from the
// existing Growth automation toggle (search_projects.enabled, Update 22,
// pinned by growth-toggle.test.ts) -- a customer-facing UI-only
// detail-level preference, never wired to backend scheduler eligibility,
// entitlement, the website connection, or billing. This test pins that
// the two stay genuinely separate: different endpoint, different column,
// different labels.
//
// Run with: node --experimental-strip-types app/app/search/__tests__/view-mode-toggle.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const searchPage = stripComments(read("app", "app", "search", "page.tsx"));
const viewModeRoute = stripComments(read("app", "api", "platform", "search", "view-mode", "route.ts"));
const toggleRoute = stripComments(read("app", "api", "platform", "search", "toggle", "route.ts"));

// --- calls a genuinely different endpoint than the Growth automation toggle ---
assert.match(searchPage, /\/api\/platform\/search\/view-mode/, "the Simple/Detailed control must call its own dedicated endpoint");

// --- labeled Simple/Detailed, never "Growth ON/OFF" (which implies automation control) ---
assert.match(searchPage, /Simple view/, "must be labeled 'Simple view', never implying automation state");
assert.match(searchPage, /Detailed view/, "must be labeled 'Detailed view', never implying automation state");

// --- renders the two real, existing components -- never a third/fabricated dashboard ---
assert.match(searchPage, /viewMode === "detailed" \? <SearchGrowthDashboardView initialData=\{data\} \/> : <SimpleGrowthSummary data=\{data\} \/>/, "must switch between the two existing real dashboard components over the same already-loaded data, never a third fabricated view or a second fetch");

// --- never touches growthEnabled / the automation toggle's own state ---
assert.doesNotMatch(searchPage, /changeViewMode[\s\S]{0,400}growthEnabled/, "changeViewMode must never read or write growthEnabled -- it is a purely separate concept");
assert.doesNotMatch(searchPage, /toggleGrowth[\s\S]{0,400}viewMode/, "toggleGrowth (the real backend-automation switch) must never read or write viewMode -- it is a purely separate concept");

// --- the view-mode route persists to its own dedicated column, gates on a real permission, and never mutates enabled ---
assert.match(viewModeRoute, /requireTenantContext\(/, "view-mode route must authenticate tenant membership");
assert.match(viewModeRoute, /can\(ctx\.role,\s*"mission:view"\)/, "view-mode route must gate on a real permission");
assert.match(viewModeRoute, /update\(\{\s*view_mode:/, "view-mode route must update the dedicated view_mode column");
assert.doesNotMatch(viewModeRoute, /update\(\{[^}]*\benabled\s*:/, "view-mode route must never write to the enabled column -- that is the separate Growth automation gate");
assert.doesNotMatch(viewModeRoute, /\.from\("search_projects"\)\s*\.\s*(insert|upsert)/, "view-mode route must only ever update an existing project row, never insert/upsert a new one");

// --- the Growth automation route, symmetrically, must never write view_mode ---
assert.doesNotMatch(toggleRoute, /update\(\{[^}]*\bview_mode\s*:/, "the Growth automation toggle route must never write view_mode -- that is the separate UI-presentation preference");

console.log("view-mode-toggle.test.ts: ALL PASS -- Simple/Detailed is a genuinely separate, correctly-labeled, correctly-gated UI preference, never conflated with the Growth automation toggle");
