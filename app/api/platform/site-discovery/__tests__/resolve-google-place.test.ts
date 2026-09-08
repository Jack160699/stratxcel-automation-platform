// Static source-inspection regression for the Business Discovery redesign's
// wiring into /api/platform/site-discovery/resolve -- this file imports
// next/server, so it can't be exercised outside a real Next.js request
// scope (same constraint as every other route-handler test in this repo,
// e.g. lib/rbac/__tests__/admin-audit-requests-authorization.test.ts). The
// actual business logic (getPlaceDetails, synthesizeOnboardingBusinessIntelligence's
// googlePlaceData priority) is covered by real behavioral tests in
// lib/identity/__tests__/google-places.test.ts and
// app/app/onboarding/__tests__/business-intelligence-synthesis.test.ts;
// this test locks in that the route actually wires them together correctly.
//
// Run with: node --experimental-strip-types app/api/platform/site-discovery/__tests__/resolve-google-place.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "resolve", "route.ts"), "utf8");

function run() {
  // --- 1. Real, billed Google calls now happen here -- must require auth,
  //        same pattern as every other onboarding endpoint. ----------------
  assert.ok(/await supabase\.auth\.getUser\(\)/.test(source), "must verify the session before doing any work");
  assert.ok(/if \(!user\)/.test(source) && /status:\s*401/.test(source), "must reject an unauthenticated request with 401");

  // --- 2. googlePlaceId is a real, distinct input -- routed through the
  //        real Places adapter, never fabricated. ---------------------------
  assert.ok(/googlePlaceId/.test(source), "must accept a googlePlaceId input");
  assert.ok(/import\s*\{[^}]*getPlaceDetails[^}]*\}\s*from ["']@\/lib\/identity\/google-places["']/.test(source), "must import the real Places adapter, never a duplicate/fabricated implementation");
  assert.ok(/await getPlaceDetails\(googlePlaceId\)/.test(source), "must actually call the real place-details lookup for a supplied googlePlaceId");

  // --- 3. Website auto-discovery (mission Section 6): only fires from a
  //        REAL discovered websiteUri, and only when the caller didn't
  //        already supply one -- never invents a website. ------------------
  assert.ok(/googlePlaceData\.websiteUri/.test(source), "must read the real websiteUri Google returned for the selected place");
  const autoDiscoverBlock = source.match(/if \(!websiteUrl && googlePlaceData\.websiteUri\) \{[\s\S]{0,120}\}/)?.[0] ?? "";
  assert.ok(autoDiscoverBlock.length > 0, "must only auto-adopt the discovered website when the caller didn't already supply one -- never override an explicit websiteUrl");

  // --- 4. Single pipeline (mission Section 12): the SAME
  //        runSmartWebsiteDiscovery and synthesizeOnboardingBusinessIntelligence
  //        calls serve both the pasted-link and search-select paths -- must
  //        not appear more than once each (i.e. no second, duplicate
  //        pipeline was built alongside this one). -------------------------
  const discoveryCalls = (source.match(/runSmartWebsiteDiscovery\(/g) ?? []).length;
  assert.equal(discoveryCalls, 1, "must reuse the one real website discovery call for both paths, never a second parallel crawler");
  const synthesisCalls = (source.match(/synthesizeOnboardingBusinessIntelligence\(/g) ?? []).length;
  assert.equal(synthesisCalls, 1, "must reuse the one real synthesis call for both paths, never a second parallel intelligence pipeline");
  assert.ok(/googlePlaceData,?\s*$/m.test(source) || /googlePlaceData\s*,/.test(source), "the single synthesis call must actually receive googlePlaceData");

  // --- 5. Never claims a place was found when it wasn't. -------------------
  assert.ok(/googlePlaceError/.test(source), "a failed place lookup must surface a real error field, not silently look identical to success");
  assert.doesNotMatch(source, /googlePlace(?:Data)?\s*=\s*\{[^}]*fake/i, "must never contain fabricated/placeholder place data");

  console.log("resolve-google-place.test.ts: ALL PASS (auth-gated, real Places adapter wired, single convergent pipeline, honest failure surfacing)");
}

run();
