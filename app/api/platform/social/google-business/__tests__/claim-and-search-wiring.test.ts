// Static-source-assertion regression for the STRATXCEL — AUTONOMOUS
// BUSINESS PROFILE brief (Section 11/12/13/57): once normal account/
// location discovery finds nothing, googleLocations:search must be tried
// before concluding there's nothing more StratXcel can do, and the actual
// claim action must never trust client-supplied "this is claimable" data --
// it must always recompute from the real, stored server-side state.
// This repo's own established pattern for API route logic that needs a
// real Supabase client to execute behaviorally (see review-bot-wiring.test.ts).
//
// Run with: node --experimental-strip-types app/api/platform/social/google-business/__tests__/claim-and-search-wiring.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const probe = stripComments(read("app", "api", "platform", "social", "google-business", "probe", "route.ts"));
const claim = stripComments(read("app", "api", "platform", "social", "google-business", "claim", "route.ts"));
const google = stripComments(read("lib", "social", "providers", "google-business.ts"));

// --- The provider layer must expose the real, live-verified endpoints. ---
assert.match(google, /googleLocations:search/, "must call the real googleLocations:search endpoint");
assert.match(google, /export async function claimGoogleLocation/, "must expose a real claim function reusing Google's own returned location");

// --- The probe route must actually try the search once normal discovery finds nothing, not just give up. ---
assert.match(probe, /searchGoogleLocations/, "the probe route must actually call searchGoogleLocations when no location was matched");
const noMatchBranch = probe.slice(probe.indexOf("} else {"));
assert.match(noMatchBranch, /searchGoogleLocations/, "the search must run inside the 'nothing matched' branch, not be dead/unreached code");
assert.match(noMatchBranch, /google_location_search/, "the real search result must be persisted, not discarded like verification once was");

// --- A search failure must never turn an otherwise-successful probe into a hard error. ---
assert.match(noMatchBranch, /catch\s*\(searchErr\)/, "a googleLocations:search failure must be caught, not left to crash the whole probe response");

// --- The claim route must recompute claimability server-side, never trust the client. ---
assert.doesNotMatch(claim, /body\.claimable/, "must never read a client-supplied 'claimable' flag -- claimability must be recomputed from real stored state");
assert.match(claim, /search\.request_admin_rights_uri/, "must re-check the real stored requestAdminRightsUri before ever attempting a claim");
assert.match(claim, /!accountName/, "must refuse to claim when no real account exists to claim under, rather than guessing one");
assert.match(claim, /requirePermission\(ctx\.role, "integration:configure"\)/, "the claim route must be gated behind the same real permission as the probe route, not left open");

// --- The claim call must reuse Google's own returned location payload verbatim, never construct a new one. ---
assert.match(claim, /claimGoogleLocation\(tokens\.accessToken, accountName, search\.raw_location, requestId\)/, "must pass through the exact, already-discovered location payload -- never a freshly-built/guessed one");

console.log("PASS: the Google Business claim/search flow tries the real Google search before giving up, persists the real result, and the claim route recomputes claimability server-side rather than trusting the client.");
