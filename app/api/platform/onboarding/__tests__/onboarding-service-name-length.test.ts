// Real bug found live during the Local AI/Social Autopilot final production
// certification mission (2026-09-06): POST /api/platform/onboarding mapped
// the free-text "What do you sell or offer?" answer straight into
// services[i].name with no length handling at all. validateBrandBrainContent
// (packages/brand-brain/src/canonical.ts) caps a service name at
// SERVICE_NAME_MAX_LENGTH (80 characters) -- any onboarding answer longer
// than that (a completely normal, full-sentence answer, not an edge case)
// produced a Brand Brain document that failed its own real validator from
// the moment onboarding finished.
//
// Confirmed live: a fresh test tenant ("The Blue Teapot Cafe") onboarded
// successfully, but /app/brand's Save Changes button stayed permanently
// disabled with only a bare "Unsaved changes" status -- canSave requires
// validationIssues.length === 0, and validationIssues.length > 0 also
// disables the button, so save()'s own validationIssues check (the only
// code that would have surfaced *which* field was wrong) could never run.
// The customer had no way to discover why they could never save an edit.
//
// This test proves, from source, that the onboarding mapping now keeps
// every service name within the real validator's limit while preserving
// the full original text in longDescription (2000-char budget) rather than
// silently truncating/discarding it, and that /app/brand now surfaces the
// specific blocking validation issue even when the Save button itself is
// (correctly) disabled.
//
// Static source-inspection test, matching this repo's established
// convention (e.g. onboarding-audit-order-fulfilment-source.test.ts).
// Run with: node --experimental-strip-types app/api/platform/onboarding/__tests__/onboarding-service-name-length.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const onboardingRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.join(onboardingRoot, "..", "..", "..", "..");
const routeSource = fs.readFileSync(path.join(onboardingRoot, "route.ts"), "utf8");
const brandPageSource = fs.readFileSync(path.join(repoRoot, "app", "app", "brand", "page.tsx"), "utf8");

function run() {
  // --- 1. The route imports the real, shared limits — never a re-guessed
  //        magic number that could drift from validateBrandBrainContent's
  //        own constants. -------------------------------------------------
  assert.match(
    routeSource,
    /import\s*\{[^}]*SERVICE_NAME_MAX_LENGTH[^}]*SERVICE_LONG_DESCRIPTION_MAX_LENGTH[^}]*\}\s*from\s*"@stratxcel\/brand-brain"/,
    "must import the real SERVICE_NAME_MAX_LENGTH/SERVICE_LONG_DESCRIPTION_MAX_LENGTH constants from @stratxcel/brand-brain, not hardcode 80/2000"
  );

  // --- 2. The offers -> services mapping actually caps name length and
  //        preserves the full text rather than dropping it. --------------
  const mapStart = routeSource.indexOf("content.services = body.brand.offers.map");
  assert.ok(mapStart >= 0, "the offers -> services mapping must still exist");
  const mapEnd = routeSource.indexOf("content.products = body.brand.offers.map", mapStart);
  const mapBody = routeSource.slice(mapStart, mapEnd > 0 ? mapEnd : undefined);
  assert.match(mapBody, /SERVICE_NAME_MAX_LENGTH/, "the mapping must reference the real max-length constant when deriving name");
  assert.match(mapBody, /longDescription/, "text beyond the name limit must be preserved somewhere real consumers can still read it (longDescription), never silently discarded");
  assert.match(mapBody, /trimmed\.length <= SERVICE_NAME_MAX_LENGTH\s*\n\s*\?\s*trimmed/, "a short offer (the common case) must be used as-is, unchanged from the original behavior");

  // --- 3. /app/brand no longer relies solely on a disabled button to
  //        communicate a blocking validation issue -- the specific reason
  //        is surfaced proactively, even before Save is ever clicked. -----
  assert.match(
    brandPageSource,
    /blockingValidationError\s*=\s*!saveError\s*&&\s*validationIssues\.length\s*>\s*0\s*\?\s*validationIssues\[0\]!\.issue\s*:\s*null/,
    "must proactively derive the first blocking validation issue, not only surface it after a click that a disabled button can never dispatch"
  );
  assert.match(brandPageSource, /displayedError\s*=\s*saveError\s*\?\?\s*blockingValidationError/, "the alert banner must show either a real save error or the specific blocking validation reason");
  const bannerStart = brandPageSource.indexOf("{displayedError && (");
  assert.ok(bannerStart >= 0, "the alert banner must render on displayedError, not only on saveError");
  const bannerEnd = brandPageSource.indexOf(")}", bannerStart);
  const bannerBody = brandPageSource.slice(bannerStart, bannerEnd > 0 ? bannerEnd : undefined);
  assert.match(bannerBody, /\{saveError\s*&&\s*\(/, "the misleading 'Retry' action must only appear for a real failed save attempt, never for a pure client-side validation issue (retrying would not fix it)");

  console.log("onboarding-service-name-length.test.ts: ALL PASS");
}

run();
