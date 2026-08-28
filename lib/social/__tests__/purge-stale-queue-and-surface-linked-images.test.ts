// Purge Stale Database Queue, Wipe YouTube Entries, and Force Immediate
// Content & Image Generation mission -- real gap found live, deeper than
// "no images have generated yet":
//
// prepareNearTermPackageItems (lib/social/package-autopilot.ts) hardcodes
// createContentVariant's mediaUrls to [] for every Package Autopilot item,
// and never calls the real AI image runtime. The only real image a
// Package Autopilot post ever gets is an EXISTING asset from the tenant's
// social_media_assets pool, linked via a social_content_variant_media row
// -- the same join getPackageQueueItemPreview (lib/social/package-preview.ts)
// already resolves for the real publish payload. Confirmed live on
// production data: both real PREPARED items (one Facebook, one Instagram)
// already had a genuine gpt-image-2 asset linked this way -- a real
// 1.68MB PNG, HTTP 200 -- but /app/content/pipeline and /app/content/
// calendar only ever selected content_variants(caption), never joined
// this table, so a fully-prepared post with a real attached image still
// rendered with no thumbnail at all. Fixed by adding the same
// social_content_variant_media -> social_media_assets -> signed URL
// resolution to both pages.
//
// Run with: node --experimental-strip-types lib/social/__tests__/purge-stale-queue-and-surface-linked-images.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function assertResolvesLinkedImage(label: string, source: string) {
  assert.match(source, /variant_id/, `${label}: must select variant_id on the queue-item query -- needed to look up its linked media`);
  assert.match(source, /social_content_variant_media/, `${label}: must query social_content_variant_media -- the real join Package Autopilot content uses to attach an image (content_variants.media_urls is always [] for this content, see package-autopilot.ts's prepareNearTermPackageItems)`);
  assert.match(source, /social_media_assets/, `${label}: must resolve the linked asset_id against social_media_assets to get a real storage_bucket/storage_path`);
  assert.match(source, /createSignedUrl/, `${label}: must mint a real signed URL for the linked asset -- same pattern as getPackageQueueItemPreview`);
  assert.match(source, /imageUrl/, `${label}: must actually thread the resolved URL into what gets rendered, not just query it`);
  assert.match(source, /<img/, `${label}: must actually render an <img> for a resolved thumbnail`);
}

function run() {
  const pipelinePage = read("app", "app", "content", "pipeline", "page.tsx");
  assertResolvesLinkedImage("pipeline/page.tsx", pipelinePage);
  console.log("app/app/content/pipeline/page.tsx: resolves and renders the real linked image via social_content_variant_media — PASS");

  const calendarPage = read("app", "app", "content", "calendar", "page.tsx");
  assertResolvesLinkedImage("calendar/page.tsx", calendarPage);
  console.log("app/app/content/calendar/page.tsx: resolves and renders the real linked image via social_content_variant_media — PASS");

  // --- Regression guard: YouTube must still be excluded everywhere the
  //     package-autopilot scheduling surface touches platforms ------------
  const packageAutopilot = read("lib", "social", "package-autopilot.ts");
  assert.match(
    packageAutopilot,
    /AUTOPILOT_SCHEDULABLE_PLATFORMS\s*=\s*\[\s*"facebook",\s*"instagram",\s*"threads",\s*"linkedin"\s*\]/,
    "AUTOPILOT_SCHEDULABLE_PLATFORMS must remain youtube-free -- this mission purges existing YouTube rows, but the producer must never be able to re-plan new ones"
  );
  console.log("lib/social/package-autopilot.ts: AUTOPILOT_SCHEDULABLE_PLATFORMS still excludes youtube — PASS");

  console.log("purge-stale-queue-and-surface-linked-images.test.ts: ALL PASS");
}

run();
