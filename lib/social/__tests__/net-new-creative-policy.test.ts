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
  // (NetNewGenerationError, not a plain Error, since Mission "Final
  // Remaining Blockers" Section 11 -- extends Error, so this is still a
  // real throw, just one that also carries the real error_retryable
  // signal across the boundary instead of collapsing it to a string).
  assert.match(netNewMedia, /if \(processed\.job\.status !== "READY" \|\| !processed\.candidates\.length\) \{[\s\S]{0,600}throw new NetNewGenerationError/, "a failed/empty job must throw, not return a placeholder or null asset");
  assert.match(netNewMedia, /class NetNewGenerationError extends Error/, "the thrown error must still be a real Error subclass (fail-closed via a genuine throw, never swallowed)");
  console.log("package-net-new-media.ts: generation failure is fail-closed (throws) — PASS");

  // --- Transient provider failures don't burn a genuine recovery attempt
  //     (Section 11/17): real bug found live -- a sustained OpenAI rate
  //     limit was silently exhausting real content days that were never
  //     actually rejected on quality. error_retryable is the real signal
  //     computed by image-generation/service.ts's own safeProviderReason,
  //     never re-derived by guessing at message text here. -------------
  assert.match(netNewMedia, /processed\.job\.error_retryable/, "the real, already-computed retryability signal must be threaded through, not discarded");
  const prepareStartForTransient = packageAutopilot.indexOf("export async function prepareNearTermPackageItems");
  const prepareEndForTransient = packageAutopilot.indexOf("\nexport async function", prepareStartForTransient + 50);
  const prepareBodyForTransient = packageAutopilot.slice(prepareStartForTransient, prepareEndForTransient > 0 ? prepareEndForTransient : undefined);
  assert.match(prepareBodyForTransient, /err instanceof NetNewGenerationError && err\.retryable/, "a transient provider failure must be detected via the real typed error, not string-matching the message");
  const transientBranchIndex = prepareBodyForTransient.indexOf("err instanceof NetNewGenerationError && err.retryable");
  const transientBranchEnd = prepareBodyForTransient.indexOf("continue;", transientBranchIndex);
  assert.ok(transientBranchEnd > transientBranchIndex, "the transient-failure branch must end with continue -- skipping straight to the next due item, never falling through into the genuine-failure recovery-budget logic below it");
  const transientBranchBody = prepareBodyForTransient.slice(transientBranchIndex, transientBranchEnd);
  assert.ok(!/retry_count:\s*nextRetryCount/.test(transientBranchBody), "a transient provider failure must NOT increment retry_count -- it never counts toward the bounded recovery-attempt budget");
  assert.ok(!/recovery_state:/.test(transientBranchBody), "a transient provider failure must NOT append a recovery_state entry -- no real content strategy was actually evaluated/rejected");
  assert.match(transientBranchBody, /status:\s*"BLOCKED"/, "the item must stay a real, visible BLOCKED row -- still immediately eligible for the next automatic pass");
  console.log("prepareNearTermPackageItems: a transient/retryable provider failure never consumes the bounded recovery-attempt budget — PASS");

  // --- Idempotency: stable key per queue item, not re-derived per attempt
  assert.match(netNewMedia, /idempotencyKey:\s*`package-net-new:\$\{input\.queueItemId\}`/, "the idempotency key must be stable per queue item so a retry within the same preparation pass reuses the existing job instead of spending a second real generation call");

  // --- Stale-in-flight self-healing (found live: a real backfill run got
  //     killed by its own maxDuration mid-image-generation, leaving that
  //     job's row permanently stuck at PROCESSING -- and both the
  //     idempotency lookup AND processImageGenerationJob's own PROCESSING
  //     branch return a stuck row as-is forever, never re-driving it) -----
  assert.match(netNewMedia, /STALE_PROCESSING_MS/, "must define a real staleness threshold");
  assert.match(netNewMedia, /isStaleInFlight/, "must detect a stuck PROCESSING/REVIEWING/REVISING job, not trust the idempotency lookup unconditionally");
  assert.match(netNewMedia, /package-net-new-retry:\$\{input\.queueItemId\}:\$\{Date\.now\(\)\}/, "a stale job must be abandoned in favor of a genuinely fresh, disambiguated idempotency key -- not the same dead key forever");
  console.log("package-net-new-media.ts: a stuck PROCESSING job (killed mid-flight by maxDuration) self-heals via a fresh idempotency key, never wedged forever — PASS");

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

  // --- Real cost defect found live (StratXcel image-spend forensics,
  //     2026-08-30): candidateCount was 2, but the real selection logic
  //     just takes the first non-rejected candidate -- not a quality
  //     comparison -- so the second real, fully-billed candidate was
  //     discarded unused on nearly every automated generation, confirmed
  //     in the real usage ledger (media_units=2 on all 26 real successful
  //     calls this period, doubling real OpenAI-fallback cost for no
  //     benefit). Same fix, same reasoning, already applied and tested for
  //     manual generation (app/api/platform/social/autopilot/manual-generate/
  //     route.ts, candidateCount: 1). ------------------------------------
  assert.match(netNewMedia, /candidateCount:\s*1,/, "the automated NET_NEW_AI path must request exactly 1 candidate -- its own selection logic never compares multiple candidates, so requesting more only wastes real provider cost with no second candidate ever getting selected");
  console.log("package-net-new-media.ts: requests exactly 1 real candidate per attempt, not 2 -- no discarded-but-billed second candidate — PASS");

  // --- Real bug found live alongside the cost fix above: when EVERY real
  //     candidate is provider-rejected (safety/quality screening), the
  //     selection logic must fail closed, never silently select a
  //     rejected image. The old `?? processed.candidates[0]` fallback
  //     defeated this -- `best` was always truthy even when every
  //     candidate had status REJECTED, so the ALL_CANDIDATES_REJECTED
  //     safety throw immediately below it could never actually fire. -----
  assert.ok(!/processed\.candidates\.find\(\(c\) => c\.status !== "REJECTED"\) \?\? processed\.candidates\[0\]/.test(netNewMedia), "must not silently fall back to candidates[0] when every real candidate was rejected -- that re-selects a provider-flagged image instead of failing closed");
  assert.match(netNewMedia, /const best = processed\.candidates\.find\(\(c\) => c\.status !== "REJECTED"\);/, "best must be undefined (not a rejected candidate) when nothing passed screening, so the ALL_CANDIDATES_REJECTED check below can actually fire");
  console.log("package-net-new-media.ts: when every real candidate is provider-rejected, selection fails closed instead of silently re-selecting a rejected image — PASS");

  console.log("net-new-creative-policy.test.ts: ALL PASS");
}

run();
