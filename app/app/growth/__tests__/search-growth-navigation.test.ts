// Regression for docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update
// 18: /app/growth is the only primary-nav "Growth" destination this app
// has (components/shell/navigation/app-nav-data.ts), but it never linked
// to the real Search Growth OS (SEO/AEO/GEO -- /app/search) at all -- a
// customer had no discoverable path there short of a manually typed URL.
// Fixed by linking the existing "Growth" nav entry's own page to it,
// rather than adding a second, duplicate "Growth"/"Search Growth" nav
// item (the brief explicitly forbids separate permanent nav items for
// SEO/AEO/GEO).
//
// Run with: node --experimental-strip-types app/app/growth/__tests__/search-growth-navigation.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

const growthPage = read("app", "app", "growth", "page.tsx");
assert.match(growthPage, /<Link href="\/app\/search"/, "the Growth page must contain a real, clickable link to /app/search");
assert.doesNotMatch(growthPage, /websiteSeo/, "the old hardcoded, mission-derived 'Website & SEO Status: Active' card must actually be replaced, not left as dead code alongside the new link");

const navData = read("components", "shell", "navigation", "app-nav-data.ts");
const growthEntries = (navData.match(/href:\s*"\/app\/(growth|search)"/g) ?? []).length;
assert.equal(growthEntries, 1, "must not add a second, separate permanent nav item for Search Growth/SEO/AEO/GEO -- exactly one nav entry ('Growth') should exist, now correctly leading to the real engine");

console.log("search-growth-navigation.test.ts: ALL PASS");
