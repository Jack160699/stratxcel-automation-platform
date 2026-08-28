// Hermes-Orchestrated Content Engine Hardening mission — the real gaps
// found and fixed: (1) REVIEW_BEFORE_PUBLISH content permanently stuck at
// REVIEW_REQUIRED with no approval path anywhere, (2) up to ~59 minutes of
// dead air after activation/resume before any content began preparing,
// (3) zero deterministic festival/season awareness for the automated
// pipeline, (4) rate-limit errors reading identically to real
// configuration problems on the dashboard.
//
// package-autopilot.ts / the API route / the dashboard component are all
// too deeply Supabase/Next-coupled to live-import in this test harness
// (see package-acceptance-final.test.ts's own header comment) -- those are
// verified as static source-inclusion checks, matching this codebase's
// established pattern. creative-brief.ts and package-errors.ts are pure,
// dependency-free modules and are live-tested directly.
// Run with: node --experimental-strip-types lib/social/__tests__/content-engine-hardening.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCreativeBrief, formatCreativeBriefForPrompt } from "../creative-brief.ts";
import { packageErrorForClient } from "../package-errors.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function run() {
  // --- Live: seasonalContext flows through buildCreativeBrief -----------
  {
    const brief = buildCreativeBrief({
      businessName: "Test Cafe",
      industryText: "cafe",
      platform: "instagram",
      mediaType: "image",
      availablePillars: ["General"],
      objective: "ENGAGEMENT",
      verifiedFacts: [],
      seasonalContext: "Upcoming occasion(s) worth considering if genuinely relevant to this business: Diwali (in 3 days, 2026-11-08).",
    });
    assert.equal(brief.seasonalContext, "Upcoming occasion(s) worth considering if genuinely relevant to this business: Diwali (in 3 days, 2026-11-08).");
    const prompt = formatCreativeBriefForPrompt(brief);
    assert.match(prompt, /Diwali/, "the seasonal context must actually reach the copy-generation prompt text");
    assert.match(prompt, /ONLY if it genuinely fits/, "must instruct the model this is optional flavor, never a forced tie-in");
  }
  console.log("buildCreativeBrief/formatCreativeBriefForPrompt: seasonalContext flows through live — PASS");

  // --- Live: no seasonal context -> no stray/fabricated line, no blank line
  {
    const brief = buildCreativeBrief({
      businessName: "Test Cafe",
      industryText: "cafe",
      platform: "instagram",
      mediaType: "image",
      availablePillars: ["General"],
      objective: "ENGAGEMENT",
      verifiedFacts: [],
    });
    assert.equal(brief.seasonalContext, null, "no input seasonalContext must resolve to null, never a fabricated default");
    const prompt = formatCreativeBriefForPrompt(brief);
    assert.doesNotMatch(prompt, /\n\n\n/, "omitting seasonalContext must not leave a stray blank line in the prompt");
  }
  console.log("buildCreativeBrief: absent seasonalContext resolves to null, no stray blank line — PASS");

  // --- Live: rate-limit errors get real, distinct, accurate copy --------
  {
    const rateLimited = packageErrorForClient(new Error("Meta rate limited (429)"));
    assert.match(rateLimited, /rate-limit/i);
    assert.match(rateLimited, /automatically/i, "must tell the customer this resolves itself, not read like a config problem");
    const genericConfig = packageErrorForClient(new Error("package_configuration_required"));
    assert.notEqual(rateLimited, genericConfig, "a transient rate limit must never read identically to a real configuration problem");
  }
  console.log("packageErrorForClient: rate-limit errors get distinct, accurate copy — PASS");

  // --- Section: REVIEW_REQUIRED items were permanently unreachable ------
  const autopilot = read("lib", "social", "package-autopilot.ts");
  assert.match(
    autopilot,
    /\.in\("status",\s*\["PREPARED",\s*"SCHEDULED"\]\)/,
    "runPackageAutopilotBatch's real due-item poll must still be exactly PREPARED/SCHEDULED (confirms REVIEW_REQUIRED was never included -- the actual bug this mission fixes)"
  );
  assert.ok(autopilot.includes("export async function approvePackageQueueItem"), "a real approval function must exist to move REVIEW_REQUIRED items into the reachable PREPARED/SCHEDULED set");
  assert.match(autopilot, /status:\s*"SCHEDULED"/, "approving must transition the item to SCHEDULED so the existing batch executor picks it up");
  assert.match(autopilot, /\.eq\("status",\s*"REVIEW_REQUIRED"\)/, "approve must only ever transition a genuinely REVIEW_REQUIRED row, never any other status");
  console.log("package-autopilot.ts: approvePackageQueueItem exists and correctly unblocks REVIEW_REQUIRED — PASS");

  // --- Section: the route actually wires approve, tenant-scoped, audited -
  const route = read("app", "api", "platform", "social", "autopilot", "route.ts");
  assert.match(route, /case\s+"approve":/);
  assert.ok(route.includes("approvePackageQueueItem"), "the route must actually call the real approval function");
  assert.ok(route.includes("verifyQueueItemTenant"), "approve must be tenant-scoped exactly like skip/reschedule/edit -- a client must never approve another client's item by guessing its id");
  assert.ok(route.includes('action: "social.package.approve"'), "an approval must be audited exactly like every other package action in this route");
  assert.ok(route.includes("runPackageAutopilotBatch"), "publishNow must actually trigger the real package batch executor, not just flip a status and hope the next cron tick notices");
  console.log("api route: approve action is tenant-scoped, audited, and wired to the real batch executor — PASS");

  // --- Section: the dashboard actually renders a real action, not just a
  //     status label ------------------------------------------------------
  const dashboard = read("app", "app", "content", "autopilot", "AutopilotDashboard.tsx");
  assert.ok(dashboard.includes('action: "approve"'), "the dashboard must actually call the real approve action");
  assert.match(dashboard, /REVIEW_REQUIRED/, "the dashboard must specifically gate the approve buttons on REVIEW_REQUIRED status");
  assert.ok(/Approve/.test(dashboard) && /Publish Now/.test(dashboard), "both Approve and Approve & Publish Now must be real, visible actions -- not just a 'Ready for review' label with nothing to do about it");
  console.log("AutopilotDashboard.tsx: real Approve / Approve & Publish Now buttons render for REVIEW_REQUIRED — PASS");

  // --- Section 1: instant day-one/day-two preparation on activate/resume -
  assert.ok(route.includes("triggerImmediatePackagePreparation"), "activation must trigger immediate background preparation, not wait for the next hourly cron tick");
  assert.ok(route.includes("planPackagePeriod") && route.includes("prepareNearTermPackageItems"), "the immediate trigger must call the real planning + preparation functions, not a stub");
  const activateCaseIndex = route.indexOf('case "activate"');
  const activateCaseBody = route.slice(activateCaseIndex, route.indexOf("case \"pause\""));
  assert.ok(activateCaseBody.includes("triggerImmediatePackagePreparation"), "the activate case specifically must call the immediate trigger");
  assert.match(route, /if\s*\(body\.action === "resume"\)\s*triggerImmediatePackagePreparation/, "resume must trigger immediate preparation too -- a paused-then-resumed tenant needs its queue refilled just as urgently as a fresh activation");
  console.log("api route: activate AND resume both trigger instant background preparation — PASS");

  // --- Section 2: festival/season context reaches both the copy AND the
  //     image-treatment prompt, from the REAL calendar module ------------
  assert.ok(autopilot.includes("seasonalContextLine") && autopilot.includes("festival-calendar"), "package-autopilot.ts must consume the real festival-calendar module, not a fabricated inline guess");
  assert.ok(autopilot.includes("seasonalContext: seasonalContextLine(new Date(item.scheduled_at)"), "the festival lookup must be keyed to the POST's own scheduled date, not the preparation moment");
  const treatment = read("lib", "social", "creative-treatment.ts");
  assert.ok(treatment.includes("input.brief.seasonalContext"), "the image-treatment prompt must also see the seasonal context, not just the copy-generation prompt");
  console.log("package-autopilot.ts + creative-treatment.ts: real festival/season context reaches both copy and image generation — PASS");

  console.log("content-engine-hardening.test.ts: ALL PASS");
}

run();
