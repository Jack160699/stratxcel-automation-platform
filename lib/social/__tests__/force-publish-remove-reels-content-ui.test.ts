// Fix Main Content UI, Force Publish A Post Now, And Remove Reels mission.
//
// Real findings, confirmed live against production:
//
// (1) /app/content's own caption cards (loadTextCaptions) never joined
//     social_content_variant_media -- same class of gap already fixed on
//     Pipeline/Calendar, just on a third page that has its own separate
//     query. Fixed the same way: resolve the real linked asset and mint a
//     signed URL.
//
// (2) A real forced-publish attempt against the live, CONNECTED, token-
//     healthy Facebook Page surfaced TWO genuine, previously-undiscovered
//     gaps, neither of them AI-credential related:
//       (a) social_automation_settings.shadow_mode defaults to true and
//           had been explicitly left true for this tenant -- completely
//           independent of social_autopilot_authorizations.publishing_mode
//           (AUTO_PUBLISH). Nothing had ever actually gone live.
//       (b) runWorkerNowAction (the admin "Run worker now" button) only
//           ever called runWorkerBatch, never runPackageAutopilotBatch --
//           even though its own doc comment claimed to mirror
//           /api/social/worker, which genuinely calls both. A due Package
//           Autopilot item was therefore never claimed/settled by a real
//           click. Fixed to call both, matching the real cron route.
//
// (3) selectPackageMediaAsset (package-media.ts) fails closed with
//     media_capability_unavailable for any reel/video unit when a tenant
//     has zero video-type assets -- true for every tenant today, since no
//     real video-generation capability exists anywhere in this codebase.
//     Confirmed live: a real queue item permanently BLOCKED this way on
//     the very first cron tick. Every catalog tier's reel/video quantity
//     is now folded into that tier's image quantity (never just dropped --
//     paying customers keep their full purchased total).
//
// Run with: node --experimental-strip-types lib/social/__tests__/force-publish-remove-reels-content-ui.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLAN_PACKAGE_COMPOSITIONS, compositionUnitTotal } from "../package-composition.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

// Every tier's total purchased unit count before this mission -- must be
// unchanged, since dropping reels must never silently reduce what a paying
// customer is entitled to.
const EXPECTED_TOTALS: Record<string, number> = {
  social: 28,
  social_content: 28,
  seo_and_social: 28,
  advanced_social: 28,
  advanced_growth: 28,
  launch: 12,
  starter: 12,
  growth: 25,
  business: 50,
  custom_growth: 60,
  scale: 75,
  image_30: 30,
};

function run() {
  // --- Reels/video fully gone from the catalog, totals preserved --------
  for (const [tier, items] of Object.entries(PLAN_PACKAGE_COMPOSITIONS)) {
    assert.ok(
      !items.some((item) => item.mediaType === "reel" || item.mediaType === "video"),
      `${tier}: must not allocate any package unit to reel/video -- no real video-generation capability exists to ever fulfill it`
    );
    const expected = EXPECTED_TOTALS[tier];
    assert.equal(expected !== undefined, true, `${tier}: missing from EXPECTED_TOTALS -- update this test's table too`);
    assert.equal(compositionUnitTotal(items), expected, `${tier}: total purchased units must stay ${expected} -- folding reel into image must never reduce what a paying customer is entitled to`);
  }
  console.log("package-composition.ts: every catalog tier is reel/video-free with totals preserved — PASS");

  // --- Main Content Library page resolves the real linked image ---------
  const contentPage = read("app", "app", "content", "page.tsx");
  assert.match(contentPage, /social_content_variant_media/, "content/page.tsx must join social_content_variant_media -- the real image-attachment path for Package Autopilot content");
  assert.match(contentPage, /createSignedUrl/, "content/page.tsx must mint a real signed URL for the linked asset");
  assert.match(contentPage, /imageUrl:\s*draft\.imageUrl/, "content/page.tsx must actually thread the resolved thumbnail onto the caption card, not just query it");
  console.log("app/app/content/page.tsx: caption cards now resolve their real linked image — PASS");

  // --- Admin 'Run worker now' actually runs the SAME two batches the real
  //     cron route runs, not just half of them ---------------------------
  const adminActions = read("app", "admin", "(shell)", "social", "actions.ts");
  const runWorkerNowStart = adminActions.indexOf("export async function runWorkerNowAction");
  assert.ok(runWorkerNowStart >= 0, "runWorkerNowAction must still exist");
  const nextExportStart = adminActions.indexOf("\nexport ", runWorkerNowStart + 1);
  const runWorkerNowBody = adminActions.slice(runWorkerNowStart, nextExportStart > 0 ? nextExportStart : undefined);
  assert.match(runWorkerNowBody, /runPackageAutopilotBatch/, "runWorkerNowAction must call runPackageAutopilotBatch -- the real /api/social/worker cron route calls both runWorkerBatch AND runPackageAutopilotBatch on every tick, and a due Package Autopilot item is only ever claimed/settled by the latter");
  console.log("admin/social/actions.ts: runWorkerNowAction now runs both real batches, matching the actual cron route — PASS");

  console.log("force-publish-remove-reels-content-ui.test.ts: ALL PASS");
}

run();
