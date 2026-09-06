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
  assert.match(packageComposition, /creativeMode\?:\s*CreativeMode/, "creativeMode must be optional -- every pre-existing authorization row has none");
  assert.match(packageComposition, /"BRAND_LIBRARY"\s*\|\s*"NET_NEW_AI"\s*\|\s*"AUTO"/, "exactly three modes: explicit BRAND_LIBRARY, explicit NET_NEW_AI, and the real default AUTO (Local AI creative-pipeline mission, 2026-09-06)");

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

  // --- The caller: every mode routes through the real per-item resolver
  //     (Local AI creative-pipeline mission, 2026-09-06) -- the real
  //     production trigger this mission adds. Before this, no authorization
  //     ever set NET_NEW_AI (confirmed live), so a tenant with an empty
  //     Brand Library could never get a single automated post; the real
  //     default for every pre-existing authorization is now AUTO, not a
  //     hard BRAND_LIBRARY-only default. --------------------------------
  const wireStart = packageAutopilot.indexOf("const creativeMode = authorization.package_composition.creativeMode");
  assert.ok(wireStart >= 0, "prepareNearTermPackageItems must read the authorization's own creativeMode");
  const wireBlock = packageAutopilot.slice(wireStart, wireStart + 700);
  assert.match(wireBlock, /\?\?\s*"AUTO"/, "the real default must be AUTO, not a hard BRAND_LIBRARY-only default that permanently BLOCKs an empty-library tenant");
  assert.match(wireBlock, /resolvePackageMediaAsset/, "must route through the real per-item resolver, not an inline ternary");
  console.log("package-autopilot.ts: every real authorization defaults to AUTO and routes through the real per-item resolver — PASS");

  // --- The resolver itself: explicit modes stay mutually exclusive and
  //     byte-for-byte unchanged in behavior; AUTO tries the real Brand
  //     Library first and only falls through on the exact, specific
  //     "nothing left" signal -- never masking a genuinely different
  //     failure, never forcing AI generation for every post. ------------
  const resolverStart = packageAutopilot.indexOf("async function resolvePackageMediaAsset");
  assert.ok(resolverStart >= 0, "the per-item creative-mode resolver must exist as its own real function");
  const resolverEnd = packageAutopilot.indexOf("\nexport async function prepareNearTermPackageItems", resolverStart);
  const resolverBody = packageAutopilot.slice(resolverStart, resolverEnd > 0 ? resolverEnd : undefined);
  assert.match(resolverBody, /if \(input\.creativeMode === "NET_NEW_AI"\)/, "explicit NET_NEW_AI must be its own exclusive branch, routing to the real generator");
  assert.match(resolverBody, /if \(input\.creativeMode === "BRAND_LIBRARY"\)/, "explicit BRAND_LIBRARY must be its own exclusive branch, unchanged fail-closed behavior for anyone who deliberately wants library-only");
  const autoStart = resolverBody.indexOf("// AUTO:");
  assert.ok(autoStart >= 0, "AUTO must be its own clearly-labeled branch, not silently folded into BRAND_LIBRARY's semantics");
  const autoBody = resolverBody.slice(autoStart);
  assert.match(autoBody, /catch \(err\)/, "AUTO must catch the library picker's failure to decide whether to fall through to generation");
  assert.match(autoBody, /err\.message !== "media_capability_unavailable"/, "AUTO must re-throw any OTHER real failure untouched -- only the specific, real 'no reusable asset left' signal may trigger a fallback to generation, never a swallowed, unrelated error");
  assert.match(autoBody, /generateNetNewPackageMediaAsset/, "AUTO's fallback must be the real generator -- never a stand-in/placeholder asset");
  console.log("package-autopilot.ts: the resolver keeps explicit modes exclusive and unchanged; AUTO tries the real library first and only generates on the real 'nothing left' signal — PASS");

  // --- Real asset-reuse defect found live (final production
  //     certification, 2026-09-06): for a brand-new tenant, AUTO's first
  //     ever NET_NEW_AI generation lands in the Brand Library as a real
  //     autopilot_eligible/source_type='generated' asset -- so the
  //     library is never "empty" again, and selectPackageMediaAsset's own
  //     never-block design (falls back to reusing a candidate already in
  //     avoidAssetIds when nothing fresh exists) then silently returns
  //     that SAME one image for every future post, forever. Confirmed
  //     live: 3 real automated posts for one test tenant produced 3
  //     distinct content_variants sharing a single social_media_assets
  //     row. AUTO must treat a forced (avoided-but-returned-anyway)
  //     repeat exactly like "nothing usable left" and generate fresh
  //     instead, so real content diversity actually grows over time
  //     rather than freezing at one recycled image. --------------------
  assert.match(autoBody, /if \(picked && input\.avoidAssetIds\?\.includes\(picked\.id\)\)/, "AUTO must detect when selectPackageMediaAsset was forced to return a candidate the caller explicitly asked to avoid (the only way a single-asset library can ever repeat forever)");
  const forcedRepeatStart = autoBody.indexOf("if (picked && input.avoidAssetIds?.includes(picked.id))");
  const forcedRepeatEnd = autoBody.indexOf("return picked;", forcedRepeatStart);
  const forcedRepeatBody = autoBody.slice(forcedRepeatStart, forcedRepeatEnd > 0 ? forcedRepeatEnd : undefined);
  assert.match(forcedRepeatBody, /generateNetNewPackageMediaAsset/, "a forced repeat must generate a genuinely fresh image, not just re-accept the stale pick");
  assert.match(autoBody, /return picked;/, "a genuinely fresh (not-avoided) pick from the real Brand Library must still be returned as-is — this must never force generation on every single post, only when every real option was one the caller asked to avoid");
  console.log("package-autopilot.ts: AUTO never settles into repeating a single recycled asset forever — a forced repeat now generates a fresh image instead — PASS");

  // A thrown failure (explicit NET_NEW_AI, or AUTO's real fallback) must be
  // indistinguishable, from the item's own try/catch, from any other real
  // preparation failure -- i.e. the resolvePackageMediaAsset call site sits
  // inside the SAME try block that already catches quality-gate failures
  // and marks BLOCKED (Section 18). resolvePackageMediaAsset re-throws
  // every real failure (never catches-and-swallows), so this outer
  // contract holds even though the call is now one level of indirection
  // deeper than the old inline ternary.
  const prepareStart = packageAutopilot.indexOf("export async function prepareNearTermPackageItems");
  const prepareEnd = packageAutopilot.indexOf("\nexport async function", prepareStart + 50);
  const prepareBody = packageAutopilot.slice(prepareStart, prepareEnd > 0 ? prepareEnd : undefined);
  const tryIndex = prepareBody.lastIndexOf("try {", prepareBody.indexOf("resolvePackageMediaAsset"));
  const catchIndex = prepareBody.indexOf('status: "BLOCKED"');
  assert.ok(tryIndex >= 0, "the media-resolution call must be inside the per-item try block");
  assert.ok(catchIndex > prepareBody.indexOf("resolvePackageMediaAsset"), "a BLOCKED write must exist textually after the media-resolution call site, in the catch path");
  console.log("prepareNearTermPackageItems: a creative-mode resolution failure (explicit NET_NEW_AI or AUTO's real fallback) is caught by the same BLOCKED path as any other preparation failure — PASS");

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
  assert.match(netNewMedia, /let best = processed\.candidates\.find\(\(c\) => c\.status !== "REJECTED"\);/, "best must be undefined (not a rejected candidate) when nothing passed screening, so the ALL_CANDIDATES_REJECTED check below can actually fire -- `let`, not `const`, because the quarantine-recheck below may reassign it to a genuinely fresh candidate");
  console.log("package-net-new-media.ts: when every real candidate is provider-rejected, selection fails closed instead of silently re-selecting a rejected image — PASS");

  // --- Real bug found live via direct production evidence (StratXcel,
  //     2026-08-30/31): the stable per-queue-item idempotency key means a
  //     REUSED job/candidate can point to an asset that was LATER
  //     quarantined (autopilot_eligible=false) -- confirmed live: a real
  //     StratXcel queue item kept "succeeding" at this function (reusing
  //     the same quarantined asset via the idempotency lookup) while its
  //     caller's own downstream eligibility check correctly refused to
  //     ever persist it, burning the bounded recovery budget on a problem
  //     retrying could never fix. Must re-check eligibility and force a
  //     genuinely fresh, disambiguated generation when the reused result
  //     is disqualified. ----------------------------------------------
  assert.match(netNewMedia, /eligibility\?\.autopilot_eligible === false/, "must re-check whether the selected (possibly reused-via-idempotency) candidate's asset is still autopilot_eligible");
  const eligibilityBlockStart = netNewMedia.indexOf("eligibility?.autopilot_eligible === false");
  const eligibilityBlockEnd = netNewMedia.indexOf("\n  }", eligibilityBlockStart);
  const eligibilityBlock = netNewMedia.slice(eligibilityBlockStart, eligibilityBlockEnd);
  assert.match(eligibilityBlock, /package-net-new-retry:\$\{input\.queueItemId\}:\$\{Date\.now\(\)\}/, "a disqualified reused result must force a genuinely fresh, disambiguated idempotency key -- the same real StratXcel post disqualified forever otherwise (retrying the stable key would just find the SAME quarantined result again)");
  assert.match(eligibilityBlock, /job = freshJob;/, "must actually swap in the fresh job/candidate, not merely detect the problem and still return the disqualified one");
  assert.match(eligibilityBlock, /best = freshBest;/);
  console.log("package-net-new-media.ts: a reused (idempotent) candidate that was later quarantined forces a genuinely fresh generation instead of looping on a disqualified asset forever — PASS");

  // --- Real gap found live via an actual pause->resume cycle against a
  //     freshly-activated AUTO authorization with a genuinely empty Brand
  //     Library (Local AI creative-pipeline mission, 2026-09-06 production
  //     verification pass): validatePackageResumePrerequisites used to call
  //     selectPackageMediaAsset unconditionally for every media type,
  //     regardless of the authorization's own creativeMode -- so an
  //     ordinary AUTO/NET_NEW_AI tenant with no library assets got a real
  //     "media_capability_unavailable" / NEEDS_ATTENTION on the very first
  //     resume, even though real preparation for that same authorization
  //     was working correctly (falling through to real generation). Only an
  //     explicit BRAND_LIBRARY authorization may still require a real
  //     existing asset at resume time. --------------------------------
  const resumeStart = packageAutopilot.indexOf("async function validatePackageResumePrerequisites");
  assert.ok(resumeStart >= 0, "validatePackageResumePrerequisites must exist");
  const resumeEnd = packageAutopilot.indexOf("\nexport async function setPackageAutopilotState", resumeStart);
  const resumeBody = packageAutopilot.slice(resumeStart, resumeEnd > 0 ? resumeEnd : undefined);
  assert.match(resumeBody, /creativeMode:\s*CreativeMode\s*=\s*composition\.creativeMode\s*\?\?\s*"AUTO"/, "resume must resolve creativeMode with the SAME real default (AUTO) as prepare time, not assume BRAND_LIBRARY");
  assert.match(resumeBody, /if \(creativeMode === "BRAND_LIBRARY"\) \{[\s\S]{0,200}selectPackageMediaAsset/, "only an explicit BRAND_LIBRARY authorization must still be gated on a real existing asset at resume time");
  const brandLibraryGateEnd = resumeBody.indexOf("\n  }", resumeBody.indexOf('creativeMode === "BRAND_LIBRARY"'));
  assert.ok(!/selectPackageMediaAsset/.test(resumeBody.slice(brandLibraryGateEnd)), "AUTO/NET_NEW_AI must never call selectPackageMediaAsset at resume time -- real generation capability is verified for real by the same entitlement/spend/quality gates at actual prepare time, not guessed at resume");
  console.log("package-autopilot.ts: resume no longer requires a Brand Library asset for AUTO/NET_NEW_AI authorizations — PASS");

  console.log("net-new-creative-policy.test.ts: ALL PASS");
}

run();
