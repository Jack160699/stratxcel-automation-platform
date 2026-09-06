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

run();
