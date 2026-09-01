// Regression for the STRATXCEL — MASTER AUTONOMOUS GROWTH PLATFORM brief
// (Section 29): a Google account with zero accessible Business Profile
// accounts needs a different, more specific message and CTA than one whose
// account has locations that just didn't automatically match -- the real
// discovery outcome (google-business.ts's real accounts/locations
// discovery) was already captured in social_accounts.metadata.
// discovery_status but never read by anything downstream. Static-source-
// assertion pattern: this repo has zero .test.tsx execution capability for
// React component/page files (see website-connector-card.test.ts's own
// header comment) and gbpLocationSetupCopy() is a page-local, non-exported
// function.
//
// Run with: node --experimental-strip-types app/app/integrations/__tests__/gbp-discovery-status-copy.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const page = stripComments(read("app", "app", "integrations", "page.tsx"));
const loadIntegrationsData = stripComments(read("lib", "connectors", "load-integrations-data.ts"));

// --- the real discovery outcome must actually be read, not left captured-but-unused ---
assert.match(loadIntegrationsData, /gbMeta\.discovery_status/, "discovery_status must actually be read from stored metadata");
assert.match(loadIntegrationsData, /discoveryStatus:/, "discoveryStatus must be exposed on google_business_details for the UI to consume");

// --- each real discovery_status value gets its own distinct case, not one generic fallback for all ---
for (const status of ["NO_GBP_ACCOUNTS_FOUND", "NO_LOCATIONS_IN_ACCOUNTS", "LOCATION_SELECTION_REQUIRED"]) {
  assert.match(page, new RegExp(`case "${status}"`), `${status} must have its own distinct case, not collapse into the generic fallback`);
}

// --- the zero-accounts case must say there's no profile at all, never reuse the "location didn't match" wording ---
const zeroAccountsCaseBlock = page.slice(page.indexOf('case "NO_GBP_ACCOUNTS_FOUND"'), page.indexOf('case "NO_LOCATIONS_IN_ACCOUNTS"'));
assert.match(zeroAccountsCaseBlock, /couldn't find a Google Business Profile for this account/i, "the zero-accounts case must clearly say no profile exists, not that a location failed to match");
assert.match(zeroAccountsCaseBlock, /Create or claim/i, "the zero-accounts case's CTA must say create/claim, matching the brief's own exact requested wording");
assert.doesNotMatch(zeroAccountsCaseBlock, /didn't automatically match/i, "must not reuse the location-mismatch wording for the zero-accounts case");

// --- actually wired into the real location-setup-required render block, not just defined and orphaned ---
assert.match(page, /gbpSetupCopy\?\.message/, "the computed copy's message must actually be rendered");
assert.match(page, /gbpSetupCopy\?\.ctaLabel/, "the computed copy's CTA label must actually be rendered on the real action button");
assert.match(page, /gbpLocationSetupCopy\(gbpDetails\?\.discoveryStatus/, "the real discoveryStatus field (not a guess) must feed the copy function");

console.log("PASS: the Integrations page differentiates 'no Google Business Profile at all' from 'locations found but unmatched', using the real captured discovery_status, not one generic message for both.");
