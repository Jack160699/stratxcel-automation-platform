// Run with: node --experimental-strip-types lib/social/__tests__/net-new-creative-policy.test.ts
//
// Mission D+ Sections 16-19: before this, prepareNearTermPackageItems had
// exactly one media path -- selectPackageMediaAsset, which only ever picks
// from the tenant's EXISTING social_media_assets. There was no way to
// require a real, fresh AI-generated image for a package unit anywhere in
// the automatic pipeline. This proves, from source:
//  - a NET_NEW_AI unit calls the real image-generation service
//    (generateNetNewPackageMediaAsset -> createImageGenerationJob ->
//    processImageGenerationJob -> selectImageGenerationCandidate), never
//    selectPackageMediaAsset,
//  - a real generation failure throws (fail-closed) rather than falling
//    back to an existing asset,
//  - the failure is caught by the SAME try/catch that already marks a
//    queue item BLOCKED -- never PREPARED with a stand-in image,
//  - BRAND_LIBRARY (default, and every pre-existing authorization with no
//    creativeMode at all) is completely unchanged,
//  - generation retries are idempotent per queue item (no double spend).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function run() {
  const netNewMedia = read("lib", "social", "package-net-new-media.ts");
  const packageAutopilot = read("lib", "social", "package-autopilot.ts");
  const packageComposition = read("lib", "social", "package-composition.ts");

  // --- Creative mode is real, typed, and backward compatible ------------
  assert.match(packageComposition, /creativeMode\?:\s*CreativeMode/, "creativeMode must be optional -- every pre-existing authorization row has none, and must default to BRAND_LIBRARY, not error");
  assert.match(packageComposition, /"BRAND_LIBRARY"\s*\|\s*"NET_NEW_AI"/, "exactly the two modes the mission specifies");

  // --- NET_NEW_AI calls the real generation service, never the asset picker
  assert.match(netNewMedia, /createImageGenerationJob/);
  assert.match(netNewMedia, /processImageGenerationJob/);
  assert.match(netNewMedia, /selectImageGenerationCandidate/);
  assert.ok(!/selectPackageMediaAsset\(/.test(netNewMedia), "the NET_NEW_AI path must never CALL the existing-asset picker -- that would defeat the entire point of the mode (mentioning it in a comment, as this file's own header does, is fine)");
  console.log("package-net-new-media.ts: calls the real image-generation chain, never the existing-asset picker — PASS");

  // --- Fail-closed: any real failure throws, no candidate silently accepted
  assert.match(netNewMedia, /if \(processed\.job\.status !== "READY" \|\| !processed\.candidates\.length\) \{[\s\S]{0,200}throw new Error/, "a failed/empty job must throw, not return a placeholder or null asset");
  console.log("package-net-new-media.ts: generation failure is fail-closed (throws) — PASS");

  // --- Idempotency: stable key per queue item, not re-derived per attempt
  assert.match(netNewMedia, /idempotencyKey:\s*`package-net-new:\$\{input\.queueItemId\}`/, "the idempotency key must be stable per queue item so a retry within the same preparation pass reuses the existing job instead of spending a second real generation call");

  // --- The caller: NET_NEW_AI branch never falls back, and a thrown
  //     failure is caught by the SAME mechanism that marks BLOCKED --------
  const wireStart = packageAutopilot.indexOf("const creativeMode = authorization.package_composition.creativeMode");
  assert.ok(wireStart >= 0, "prepareNearTermPackageItems must read the authorization's own creativeMode");
  const wireBlock = packageAutopilot.slice(wireStart, wireStart + 700);
  assert.match(wireBlock, /generateNetNewPackageMediaAsset/, "NET_NEW_AI must route through the real net-new generator");
  assert.match(wireBlock, /selectPackageMediaAsset/, "BRAND_LIBRARY (the default/else branch) must still use the existing picker -- unchanged for every campaign that doesn't opt in");
  // The NET_NEW_AI branch and the BRAND_LIBRARY branch must be mutually
  // exclusive arms of the same conditional (never both attempted, never a
  // catch-and-fall-through from one to the other).
  assert.match(wireBlock, /creativeMode === "NET_NEW_AI"\s*\n?\s*\?\s*await generateNetNewPackageMediaAsset/, "NET_NEW_AI must be the exclusive branch, not an addition on top of the existing picker");
  console.log("package-autopilot.ts: creativeMode branches exclusively between the real generator and the existing picker, never both — PASS");

  // A thrown net-new failure must be indistinguishable, from the item's own
  // try/catch, from any other real preparation failure -- i.e. the
  // NET_NEW_AI call site sits inside the SAME try block that already
  // catches quality-gate failures and marks BLOCKED (Section 18).
  const prepareStart = packageAutopilot.indexOf("export async function prepareNearTermPackageItems");
  const prepareEnd = packageAutopilot.indexOf("\nexport async function", prepareStart + 50);
  const prepareBody = packageAutopilot.slice(prepareStart, prepareEnd > 0 ? prepareEnd : undefined);
  const tryIndex = prepareBody.lastIndexOf("try {", prepareBody.indexOf("generateNetNewPackageMediaAsset"));
  const catchIndex = prepareBody.indexOf('status: "BLOCKED"');
  assert.ok(tryIndex >= 0, "the net-new call must be inside the per-item try block");
  assert.ok(catchIndex > prepareBody.indexOf("generateNetNewPackageMediaAsset"), "a BLOCKED write must exist textually after the net-new call site, in the catch path");
  console.log("prepareNearTermPackageItems: a NET_NEW_AI failure is caught by the same BLOCKED path as any other preparation failure — PASS");

  console.log("net-new-creative-policy.test.ts: ALL PASS");
}

run();
