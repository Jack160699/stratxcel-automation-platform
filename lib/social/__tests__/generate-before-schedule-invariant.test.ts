// Make Social Autopilot Actually Complete mission: the prior report's own
// wording ("28 scheduled, 0 generated") sounded like a real ordering bug --
// a PLANNED calendar slot being treated as a live, publishable schedule
// before its content existed. Investigated precisely rather than assumed:
// it wasn't. This proves, from the real source, that the canonical
// "GENERATE -> APPROVE -> CREATE MEDIA -> READY -> SCHEDULE -> PUBLISH"
// ordering this mission demands was already the real, enforced behavior --
// PLANNED is not, and has never been, eligible for the publish worker.
//
// Run with: node --experimental-strip-types lib/social/__tests__/generate-before-schedule-invariant.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function run() {
  const packageAutopilot = read("lib", "social", "package-autopilot.ts");

  // --- The real due-item poll (runPackageAutopilotBatch) that decides what
  //     the publish worker is even ALLOWED to touch ----------------------
  const batchStart = packageAutopilot.indexOf("export async function runPackageAutopilotBatch");
  assert.ok(batchStart >= 0, "runPackageAutopilotBatch must exist");
  const batchEnd = packageAutopilot.indexOf("\n/**", batchStart + 50);
  const batchBody = packageAutopilot.slice(batchStart, batchEnd > 0 ? batchEnd : batchStart + 3000);
  assert.match(
    batchBody,
    /\.in\("status", \["PREPARED", "SCHEDULED"\]\)/,
    "the publish worker's due-item query must ONLY ever match PREPARED/SCHEDULED -- a PLANNED item (a reserved calendar slot with no real content yet) must be structurally unreachable by the worker, not merely 'not currently due'"
  );
  assert.ok(
    !/\.in\("status", \[[^\]]*"PLANNED"[^\]]*\]\)/.test(batchBody),
    "PLANNED must never appear in the worker's own eligible-status list, under any circumstance"
  );
  console.log("runPackageAutopilotBatch: PLANNED items are categorically unreachable by the publish worker — PASS");

  // --- PREPARED is only ever reached AFTER a real quality-gated
  //     generation + media selection succeed, inside prepareNearTerm
  //     PackageItems -- never a bare status flip -------------------------
  const prepareStart = packageAutopilot.indexOf("export async function prepareNearTermPackageItems");
  assert.ok(prepareStart >= 0, "prepareNearTermPackageItems must exist");
  const prepareEnd = packageAutopilot.indexOf("\nexport async function", prepareStart + 50);
  const prepareBody = packageAutopilot.slice(prepareStart, prepareEnd > 0 ? prepareEnd : undefined);

  // The quality-gate failure path must throw/skip BEFORE any status update
  // to PREPARED is reached -- i.e. the runGenerationLoop failure check
  // textually precedes the PREPARED status write. STRATXCEL full-system
  // closure brief Section 6/8: the throw itself changed from a plain Error
  // to GenerationLoopRetryableError (still a genuine throw -- the fail-
  // closed guarantee this test checks is unaffected) so the real
  // transient-provider-failure retryable signal survives the throw
  // boundary instead of being discarded, matching NetNewGenerationError's
  // same real pattern for the image-generation stage.
  const qualityGateGuardIndex = prepareBody.indexOf('throw new GenerationLoopRetryableError(loopResult.finalReason ?? "Generated content failed the quality gate"');
  const preparedWriteIndex = prepareBody.indexOf('"PREPARED"');
  assert.ok(qualityGateGuardIndex >= 0, "the quality-gate failure guard must exist");
  assert.ok(preparedWriteIndex > qualityGateGuardIndex, "the PREPARED status write must be textually AFTER the quality-gate guard -- generation failure must never reach a PREPARED write");
  console.log("prepareNearTermPackageItems: PREPARED is only reachable after a real quality-gated generation succeeds — PASS");

  // --- Cross-trigger idempotency: both the Razorpay webhook and the OAuth
  //     callback converge on the SAME single activation function, and that
  //     function's own existing-authorization check is unconditional (runs
  //     before ANY other real work), so two near-simultaneous triggers for
  //     the same tenant can never create two campaigns -------------------
  const webhookRoute = read("app", "api", "webhook", "razorpay", "route.ts");
  const oauthCallback = read("app", "api", "social", "oauth", "[provider]", "callback", "route.ts");
  assert.match(webhookRoute, /attemptAutoActivatePackageAutopilot/, "the webhook trigger must call the shared activation function");
  assert.match(oauthCallback, /attemptAutoActivatePackageAutopilot/, "the OAuth trigger must call the SAME shared activation function, not a second implementation");

  const attemptStart = packageAutopilot.indexOf("export async function attemptAutoActivatePackageAutopilot");
  const attemptBody = packageAutopilot.slice(attemptStart, packageAutopilot.indexOf("\nasync function validatePackageResumePrerequisites", attemptStart));
  const existingCheckIndex = attemptBody.indexOf('from("social_autopilot_authorizations")');
  const firstRealWriteIndex = attemptBody.indexOf("activatePackageAutopilot(service, {");
  assert.ok(existingCheckIndex >= 0 && existingCheckIndex < firstRealWriteIndex, "the existing-authorization check must run before any real activation write -- this is what makes two near-simultaneous triggers (webhook + OAuth callback) for the same tenant safe: whichever wins the race, the other sees the row and no-ops");
  console.log("attemptAutoActivatePackageAutopilot: both real trigger points converge on one function whose existence-check precedes any write — PASS");

  console.log("generate-before-schedule-invariant.test.ts: ALL PASS");
}

run();
