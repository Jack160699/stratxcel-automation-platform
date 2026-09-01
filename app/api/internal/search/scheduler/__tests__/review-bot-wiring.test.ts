// Run with: node --experimental-strip-types app/api/internal/search/scheduler/__tests__/review-bot-wiring.test.ts
//
// Static-source-assertion regression for the Review Bot integration
// (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 12): the whole
// point of hosting Review Bot on this existing cron instead of a new one is
// that it adds zero new Vercel cron slots and never bypasses the resolved-
// location guard. Locked in here by inspection so a future edit can't
// silently reintroduce either.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const routeRaw = read("app", "api", "internal", "search", "scheduler", "route.ts");
const route = stripComments(routeRaw);

// --- Review Bot must never reach a live reply without checking the resolved-location guard first. ---
assert.match(route, /isResolvedGbpLocationResourceName/, "the scheduler route must check the real resolved-location guard, not assume every CONNECTED row is usable");
const guardIndex = route.indexOf("isResolvedGbpLocationResourceName");
const replyIndex = route.indexOf("runReviewBotCycle(");
assert.ok(guardIndex >= 0 && replyIndex >= 0 && guardIndex < replyIndex, "the resolved-location guard must appear before the review-bot cycle is ever invoked");

// --- Must never call the reply/list functions for a non-CONNECTED account. ---
assert.match(route, /gbpAccount\.status !== "CONNECTED"/, "must gate on a real CONNECTED status before touching the review pipeline for this tenant");

// --- The bearer-secret auth check must still be present (pre-existing; regression guard). ---
assert.match(route, /SEARCH_DISCOVERY_SCHEDULER_SECRET/, "the scheduler must remain bearer-secret authenticated");
assert.match(route, /SEARCH_SCHEDULER_UNAUTHORIZED/, "an invalid/missing secret must still be rejected");

// --- No new Vercel cron slot was added to host Review Bot (Section 2's explicit requirement). ---
const vercelJson = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
assert.equal(vercelJson.crons.length, 9, "Review Bot must be hosted on the existing scheduler cron, not add a 10th cron entry");
const schedulerCron = vercelJson.crons.find((c) => c.path === "/api/internal/search/scheduler");
assert.ok(schedulerCron, "the existing search scheduler cron entry must still exist");
assert.doesNotMatch(JSON.stringify(vercelJson.crons), /review.?bot/i, "no separate review-bot cron path should exist in vercel.json");

console.log("PASS: Review Bot is hosted on the existing scheduler cron with the resolved-location guard enforced before any live call, and no new cron slot was added.");

// --- Automatic Google verification recheck (STRATXCEL — GOOGLE BUSINESS ---
// --- AUTONOMOUS SETUP brief, Sections 11/20) must be hosted on this same ---
// --- existing cron too -- not a new one, and it must never run for an ------
// --- unresolved location or an already-VERIFIED connection. ----------------
assert.match(route, /recheckGoogleVerificationForTenant/, "the verification recheck must actually be wired into this scheduler's tenant loop");
const rechecksAfterGuard = route.indexOf("isResolvedGbpLocationResourceName(gbpAccount.provider_account_id)", route.indexOf("recheckGoogleVerificationForTenant"));
assert.ok(rechecksAfterGuard >= 0, "the recheck function must apply the same resolved-location guard before ever calling Google");
assert.match(route, /currentState === "VERIFIED"/, "an already-VERIFIED connection must be skipped, never re-checked forever");
assert.equal(vercelJson.crons.length, 9, "the verification recheck must not add an 11th cron entry either");

console.log("PASS: the automatic Google verification recheck is hosted on the existing scheduler cron, guarded identically to Review Bot, with no new cron slot.");

// --- GEO's hasGbp signal (STRATXCEL — MASTER AUTONOMOUS GROWTH PLATFORM ---
// --- brief, Section 26/36/50: "if GBP is unavailable/unverified, GEO -------
// --- must show the real limitation... do not manufacture a GEO score") -----
// --- must require a genuinely resolved location, not merely a CONNECTED ----
// --- row -- a bare "does a row exist" check was found live to fabricate ----
// --- NAP consistency/gbpClaimed for the real StratXcel tenant, whose row ---
// --- is CONNECTED with zero accessible GBP accounts (Update 26). -----------
const hasGbpAssignment = route.slice(route.indexOf("const hasUsableGbp ="), route.indexOf("const hasUsableGbp =") + 400);
assert.match(hasGbpAssignment, /isResolvedGbpLocationResourceName\(gbpAccount\.provider_account_id\)/, "hasGbp must require a genuinely resolved location, not just a CONNECTED row");
assert.match(hasGbpAssignment, /gbpAccount\.status === "CONNECTED"/, "hasGbp must also require the real CONNECTED status, not assume it from row existence alone");
assert.match(route, /hasGbp:\s*hasUsableGbp/, "the computed, location-gated signal must actually be the one passed into the growth loop, not a raw row-existence check");
assert.doesNotMatch(route, /hasGbp:\s*Boolean\(gbpAccount\)/, "must never regress back to the bare row-existence check this was found to fabricate consistency from");

console.log("PASS: GEO's hasGbp signal requires a genuinely resolved GBP location, never fabricating NAP consistency from a bare CONNECTED row.");
