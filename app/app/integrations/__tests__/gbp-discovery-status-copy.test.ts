// Regression for the STRATXCEL — MASTER AUTONOMOUS GROWTH PLATFORM brief
// (Section 29) AND the later STRATXCEL — GOOGLE BUSINESS DISCOVERY
// CONTRADICTION brief, which corrected Section 29's own original wording:
// a real, screenshot-proven case showed accounts.list returning zero
// accounts for a Google identity that genuinely manages a real Business
// Profile (a real, documented API-access-tier limitation, not proof of
// non-existence -- see discoverGoogleBusinessAccounts's own doc comment).
// The zero-accounts copy must therefore never claim the profile doesn't
// exist or tell the customer to create one; it must say the connection
// couldn't yet confirm it and point them to their real, existing profile.
// Static-source-assertion pattern: this repo has zero .test.tsx execution
// capability for React component/page files (see website-connector-card.
// test.ts's own header comment) and gbpLocationSetupCopy() is a
// page-local, non-exported function.
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

// --- the zero-accounts case must NEVER claim the profile doesn't exist ---
// --- or tell the customer to create a new one -- a real, screenshot- ------
// --- proven case disproved that claim (STRATXCEL — GOOGLE BUSINESS --------
// --- DISCOVERY CONTRADICTION brief). ---------------------------------------
const zeroAccountsCaseBlock = page.slice(page.indexOf('case "NO_GBP_ACCOUNTS_FOUND"'), page.indexOf('case "NO_LOCATIONS_IN_ACCOUNTS"'));
assert.doesNotMatch(zeroAccountsCaseBlock, /couldn't find a google business profile/i, "must never assert the profile doesn't exist -- a genuinely zero-accounts API response can also mean the API access tier isn't approved yet, not that no profile exists");
assert.doesNotMatch(zeroAccountsCaseBlock, /create or claim/i, "must never tell the customer to create a NEW profile when one may already exist and just isn't confirmable through this connection yet");
assert.match(zeroAccountsCaseBlock, /couldn't yet confirm/i, "must phrase this as 'not yet confirmed', not a definitive absence");
assert.match(zeroAccountsCaseBlock, /open (it directly|google business profile)/i, "must direct the customer to their own, real, possibly-already-existing profile, not a fresh-creation flow");
assert.doesNotMatch(zeroAccountsCaseBlock, /didn't automatically match/i, "must not reuse the location-mismatch wording for the zero-accounts case");

// --- actually wired into the real location-setup-required render block, not just defined and orphaned ---
assert.match(page, /gbpSetupCopy\?\.message/, "the computed copy's message must actually be rendered");
assert.match(page, /gbpSetupCopy\?\.ctaLabel/, "the computed copy's CTA label must actually be rendered on the real action button");
assert.match(page, /gbpLocationSetupCopy\(gbpDetails\?\.discoveryStatus/, "the real discoveryStatus field (not a guess) must feed the copy function");

console.log("PASS: the Integrations page differentiates 'no Google Business Profile at all' from 'locations found but unmatched', using the real captured discovery_status, not one generic message for both.");
