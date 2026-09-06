// Real, severe defect found live -- StratXcel Marketing Creative Engine
// production repair (2026-09-06): POST /api/platform/brand/logo-analyze
// inserted every logo variant (transparent/monoLight/monoDark/badge) into
// social_media_assets with no autopilot_eligible override, so each row
// inherited the table default (true) -- and being source_type:"generated"
// too, WON selectPackageMediaAsset's own top-priority "preferred generated
// asset" pass outright (lib/social/package-media.ts).
//
// Confirmed live: a fresh test tenant's first 4 real automated Social
// Autopilot posts (through the actual product UI, real activation, no
// database shortcuts) each used a raw logo-variant file as the ENTIRE post
// creative -- not a business photo at all. package-media.test.ts already
// assumed "the business's own logo is never selected, even as the newest
// candidate" as a real, tested guarantee of selectPackageMediaAsset -- but
// nothing had ever actually quarantined a logo variant row at its real
// source (autopilot_eligible), so that guarantee only held once a
// caller/upload path other than this one had already set it correctly.
//
// Static source-inspection test (matches this repo's established
// convention). Run with:
// node --experimental-strip-types app/api/platform/brand/__tests__/logo-analyze-autopilot-quarantine.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "logo-analyze", "route.ts"), "utf8");

function run() {
  const insertStart = source.indexOf('.from("social_media_assets")');
  assert.ok(insertStart >= 0, "the logo-variant insert into social_media_assets must exist");
  const insertEnd = source.indexOf(".select(\"id\")", insertStart);
  const insertBody = source.slice(insertStart, insertEnd > 0 ? insertEnd : undefined);

  assert.match(
    insertBody,
    /autopilot_eligible:\s*false/,
    "every logo variant row must be quarantined (autopilot_eligible: false) at creation -- it must never be eligible for selectPackageMediaAsset's real Brand-Library selection, which has no other way to distinguish a logo file from a real business photo"
  );
  assert.match(
    insertBody,
    /eligibility_reason:\s*"logo_variant_never_a_post_creative"/,
    "the quarantine must carry a real, specific reason -- diagnosable in the database, not a silent boolean"
  );

  console.log("logo-analyze-autopilot-quarantine.test.ts: every logo variant is quarantined from automated post selection at creation — PASS");
}

// Real, RECURRING defect found live -- Image Quality + Marketing Creative
// Certification mission (2026-09-06): this exact bug was found and "fixed"
// once before, but only via a one-off SQL quarantine of one specific test
// tenant's asset row -- never a real code fix -- so it resurfaced verbatim
// on the very next fresh tenant. The 4 rendered VARIANTS were already
// quarantined at creation (tested above), but the RAW source upload this
// route receives (staged via the shared app/api/platform/brand/photos
// prepare/finalize protocol, which correctly defaults new uploads to
// autopilot_eligible:true for the general Shop Profile Photos gallery) was
// never touched. Confirmed live: that raw upload landed in
// social_media_assets as provenance.purpose:"shop_profile_photo",
// autopilot_eligible:true -- and was selected as an automated post's
// entire creative on the very first real generation attempt.
function testRawSourceUploadIsQuarantinedAfterAnalysis() {
  const updateStart = source.indexOf('.update({ autopilot_eligible: false');
  assert.ok(
    updateStart >= 0,
    "after successfully generating variants, the route must retroactively quarantine the RAW source upload it analyzed -- otherwise that raw file (staged under the general Photos gallery's own eligible-by-default purpose) remains permanently selectable as a real post's entire creative"
  );
  const updateBlockEnd = source.indexOf(";", updateStart);
  const updateBlock = source.slice(updateStart, updateBlockEnd > 0 ? updateBlockEnd : undefined);
  assert.match(updateBlock, /eq\("id", source\.id\)/, "must quarantine the specific source asset this call analyzed, not every asset in the tenant's library");
  assert.match(updateBlock, /eq\("tenant_id", ctx\.tenantId\)/, "must stay tenant-scoped even when quarantining a raw source row");
  console.log("logo-analyze-autopilot-quarantine.test.ts: the raw source upload is also quarantined after analysis, not just the rendered variants — PASS");
}

run();
testRawSourceUploadIsQuarantinedAfterAnalysis();
