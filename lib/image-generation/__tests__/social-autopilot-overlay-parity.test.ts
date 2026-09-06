// Real root cause found live -- StratXcel Marketing Creative Engine
// production repair (2026-09-06): the automated Social Autopilot image
// path silently suppressed ALL headline/CTA/supporting-copy text overlay
// on every single post, regardless of what the real AI creative treatment
// actually planned. processImageGenerationJob required
// treatment.intentionallyTextLed === true before it would even attempt
// resolveOverlayElements(treatment) for a job with
// source_context === "social_autopilot" -- but every real automated
// treatment inspected in production had intentionallyTextLed: false (a
// legitimate, common choice for a photo-led post), so resolvedOverlayElements
// was unconditionally forced to [] for every automated creative, turning
// an offer/announcement/promotion post that genuinely needed a headline
// and CTA into the exact same text-free output as a deliberately
// photo-only mood post. Manual/Studio generations never had this extra
// gate: resolveOverlayElements' own real body (creative-treatment.ts)
// already returns [] whenever the treatment planned no on-image text, so
// the additional automated-only gate was pure, undesired duplication of a
// decision the treatment already made correctly.
//
// This is the exact defect behind "the pipeline produces a nice AI photo,
// not a finished marketing creative" for every automated post.
//
// Static source-inspection test (matches this repo's established
// convention for lib/image-generation/service.ts).
// Run with: node --experimental-strip-types lib/image-generation/__tests__/social-autopilot-overlay-parity.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "service.ts"), "utf8");

function run() {
  // --- 1. The automated-only suppression gate is gone. ---------------
  assert.ok(
    !/isSocialAutopilot/.test(source),
    "the isSocialAutopilot gate must be fully removed -- automated posts must trust the same real treatment decision manual/Studio posts already trust, not a second, more restrictive one"
  );

  // --- 2. resolvedOverlayElements now depends only on overlayContext
  //        (i.e. a real treatment exists) and defers entirely to
  //        resolveOverlayElements' own real decision. ------------------
  assert.match(
    source,
    /const resolvedOverlayElements = overlayContext \? resolveOverlayElements\(overlayContext\.treatment\) : \[\];/,
    "resolvedOverlayElements must be derived the same way for every job source_context -- manual and automated alike"
  );

  // --- 3. This must not force text onto every automated post: a
  //        treatment that genuinely planned no on-image text (empty
  //        textHierarchy, cta.needed false) must still legitimately
  //        render nothing extra -- proven by resolveOverlayElements'
  //        own real, already-tested body (creative-treatment.test.ts),
  //        which this fix reuses unchanged rather than reimplementing. --
  assert.match(source, /resolveOverlayElements/, "must reference the real, shared resolveOverlayElements");
  assert.match(source, /from "\.\.\/social\/creative-treatment\.ts"/, "resolveOverlayElements must come from the real, shared, already-tested creative-treatment.ts module, never a re-derived local copy");

  console.log("social-autopilot-overlay-parity.test.ts: automated posts now trust the real treatment's own on-image text decision, same as manual/Studio — PASS");
}

run();
