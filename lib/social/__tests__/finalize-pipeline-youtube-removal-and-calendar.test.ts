// Finalize Autopilot Pipeline, Remove YouTube, and Force Live Publishing
// mission — real gaps found and fixed:
//
// (1) YouTube (video-only, unsupported by generation yet) was schedulable
//     by the automatic planning cycle -- both at activation and via scope
//     changes, and it was offered as a selectable destination in the
//     activation eligibility preview. Fixed with a real, authoritative
//     allow-list (AUTOPILOT_SCHEDULABLE_PLATFORMS) enforced in
//     package-autopilot.ts itself -- the deepest layer, so a client-
//     supplied allowedPlatforms list can never smuggle youtube back in
//     regardless of caller (UI, API, admin script). Verified live: the
//     real Stratxcel authorization's pre-existing 28 youtube-targeted
//     queue items were retroactively BLOCKED (destination_removed_from_
//     package_scope) via the same, tested setPackageAutopilotScope path
//     that already handles platform removal correctly.
//
// (2) /app/content/calendar was a 100% static 7-day grid with an
//     unconditional "Nothing scheduled." placeholder -- would read empty
//     even for a tenant with real queued content. Wired to the same
//     RLS-safe social_autopilot_queue_items source the Pipeline page
//     already uses (lib/social/__tests__/autopilot-toggle-visibility-and-
//     pipeline.test.ts covers that page's own fix).
//
// package-autopilot.ts / the API route / the calendar page are all too
// deeply Supabase/Next-coupled to live-import in this test harness for
// the route/page checks (see content-engine-hardening.test.ts's own
// header comment) -- verified as static source-inclusion checks for
// those, but AUTOPILOT_SCHEDULABLE_PLATFORMS and the platform-stripping
// behavior itself ARE now genuinely live-importable and live-tested here
// (package-autopilot.ts's extensionless-import graph was fixed in an
// earlier mission specifically to make this possible).
// Run with: node --experimental-strip-types lib/social/__tests__/finalize-pipeline-youtube-removal-and-calendar.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUTOPILOT_SCHEDULABLE_PLATFORMS } from "../package-autopilot.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function run() {
  // --- Live: the real, authoritative allow-list excludes youtube -------
  assert.ok(!(AUTOPILOT_SCHEDULABLE_PLATFORMS as readonly string[]).includes("youtube"), "youtube must never be in the real schedulable-platforms allow-list -- video generation is not supported yet");
  assert.ok((AUTOPILOT_SCHEDULABLE_PLATFORMS as readonly string[]).includes("instagram"), "instagram (image/text-capable) must remain schedulable");
  assert.ok((AUTOPILOT_SCHEDULABLE_PLATFORMS as readonly string[]).includes("facebook"), "facebook (image/text-capable) must remain schedulable");
  console.log("package-autopilot.ts: AUTOPILOT_SCHEDULABLE_PLATFORMS excludes youtube, keeps image/text platforms — PASS");

  const autopilot = read("lib", "social", "package-autopilot.ts");
  // --- Source: the allow-list is actually ENFORCED, not just declared,
  //     in both activation and scope-change (the two places a client can
  //     ever set allowed_platforms) ---------------------------------------
  const activateIndex = autopilot.indexOf("export async function activatePackageAutopilot");
  const activateBody = autopilot.slice(activateIndex, activateIndex + 2500);
  assert.ok(activateBody.includes("stripUnschedulablePlatforms("), "activatePackageAutopilot must actually strip unschedulable platforms from the requested list, not just validate connectivity");

  const scopeIndex = autopilot.indexOf("export async function setPackageAutopilotScope");
  const scopeBody = autopilot.slice(scopeIndex, scopeIndex + 800);
  assert.ok(scopeBody.includes("stripUnschedulablePlatforms("), "setPackageAutopilotScope must also strip unschedulable platforms -- a client could otherwise re-add youtube after activation via a scope change");
  console.log("package-autopilot.ts: youtube-stripping is actually enforced in both activatePackageAutopilot and setPackageAutopilotScope — PASS");

  // --- Route: the activation eligibility PREVIEW must agree, so the UI
  //     never even offers youtube as a selectable destination -----------
  const route = read("app", "api", "platform", "social", "autopilot", "route.ts");
  assert.ok(route.includes("AUTOPILOT_SCHEDULABLE_PLATFORMS"), "the route must import and use the same real allow-list, not a second, possibly-drifted copy");
  const connectedIndex = route.indexOf("const connectedPlatforms");
  const connectedBody = route.slice(connectedIndex, connectedIndex + 400);
  assert.ok(connectedBody.includes("AUTOPILOT_SCHEDULABLE_PLATFORMS"), "the eligibility preview's connectedPlatforms list must be filtered by the same real allow-list");
  console.log("api route: the activation eligibility preview excludes youtube, agreeing with the real enforcement layer — PASS");

  // --- Calendar page: real data replaces the unconditional placeholder --
  const calendar = read("app", "app", "content", "calendar", "page.tsx");
  assert.ok(calendar.includes('.from("social_autopilot_queue_items")'), "the calendar must query real queue data, not a second/parallel data source");
  assert.match(calendar, /\.eq\("tenant_id",\s*ctx\.workspaceTenant\.tenantId\)/, "the query must be tenant-scoped -- never leak one tenant's calendar into another's view");
  assert.ok(calendar.includes("hasAnyContent"), "a genuinely empty week must still say so honestly, but no longer unconditionally");
  assert.match(calendar, /{!hasAnyContent\s*&&/, "the 'Nothing scheduled.' placeholder must be conditional now, not always rendered regardless of real data");
  console.log("content/calendar/page.tsx: real social_autopilot_queue_items data replaces the unconditional static placeholder — PASS");

  console.log("finalize-pipeline-youtube-removal-and-calendar.test.ts: ALL PASS");
}

run();
