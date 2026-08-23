// Regression test for a finding from live E2E testing on 2026-08-24: the
// "My Shop" Business Name field rendered genuinely blank — no value, no
// placeholder — for a real tenant whose name the platform already knows
// (tenant.name), even though every other field on the same form (Category,
// Description, Address, Phone, Business Hours) has a helpful placeholder.
// A first-time customer opening My Shop for their own already-known
// business saw an empty box for the one field that should never be empty.
//
// Confirmed live: the real tenant's brand_brain_versions.content had no
// business_name key at all (never seeded for this tenant), while
// tenants.name was "Stratxcel" the whole time and renders correctly
// everywhere else in the app chrome (header, sidebar, page title).
//
// Fix: load() now seeds content.business_name from the known tenant name
// when the Brand Brain's own value is empty, matching the fallback pattern
// already used on this same page for the logo-initials placeholder
// (`content.business_name || active?.name || "SX"`). Still just an
// in-memory default until the customer hits Save Changes — it does not
// silently write anything on their behalf.
//
// Static source-inspection test, matching the pattern used by
// app/app/brand/__tests__/save-includes-tenant-id.test.ts.
// Run with: node --experimental-strip-types app/app/brand/__tests__/business-name-tenant-fallback.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = fs.readFileSync(path.join(root, "page.tsx"), "utf8");

function run() {
  const loadFn = pageSource.match(/async function load\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.ok(loadFn.length > 0, "could not locate load() in app/app/brand/page.tsx — check it hasn't been renamed/restructured");

  // --- load() must fall back to the known tenant name when Brand Brain's
  // own business_name is empty, before content ever reaches setContent(). --
  assert.match(
    loadFn,
    /loaded\.business_name\?\.trim\(\)\s*\?\s*loaded\.business_name\s*:\s*active\?\.name/,
    "load() no longer falls back to active?.name when Brand Brain's business_name is empty — Business Name will render blank again for a known tenant"
  );
  assert.match(
    loadFn,
    /setContent\(businessName \? \{ \.\.\.loaded, business_name: businessName \} : loaded\)/,
    "load() must apply the business_name fallback to the content object it hands to setContent(), not just compute it and discard it"
  );

  // --- The fallback must still be a plain in-memory default, not an
  // automatic silent save on the customer's behalf. -----------------------
  assert.doesNotMatch(
    loadFn,
    /await save\(\)|method:\s*["']POST["']/,
    "load() must not auto-save the fallback business name — it should only pre-fill the field; the customer still confirms via Save Changes"
  );

  console.log("PASS: My Shop's Business Name field falls back to the known tenant name instead of rendering blank");
}

run();
