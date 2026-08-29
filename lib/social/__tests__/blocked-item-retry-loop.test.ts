// Run with: node --experimental-strip-types lib/social/__tests__/blocked-item-retry-loop.test.ts
//
// Mission D+ Section 21: before this, prepareNearTermPackageItems's
// due-item query only ever matched status = 'PLANNED' -- once an item
// exhausted its in-pass corrective-instruction attempts and was marked
// BLOCKED, it was excluded from EVERY future preparation pass, forever
// (confirmed live: 20 real BLOCKED items sat permanently unreachable while
// the campaign kept minting brand-new PLANNED items around them). This
// proves, from source:
//  - a BLOCKED item is now re-selectable, but only up to a bounded retry
//    count (never unbounded execution),
//  - a retry actually changes the angle rather than deterministically
//    re-deriving the identical failed pillar from unchanged history,
//  - a successful retry can still advance a BLOCKED row (not just PLANNED),
//  - retry_count is incremented on repeated failure so the bound is real.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function run() {
  const src = read("lib", "social", "package-autopilot.ts");

  const prepareStart = src.indexOf("export async function prepareNearTermPackageItems");
  const prepareEnd = src.indexOf("\nexport async function", prepareStart + 50);
  const body = src.slice(prepareStart, prepareEnd > 0 ? prepareEnd : undefined);

  // --- BLOCKED is now selectable, but bounded -----------------------------
  assert.match(body, /\.in\("status",\s*\["PLANNED",\s*"BLOCKED"\]\)/, "the due-item query must include BLOCKED, not just PLANNED -- a BLOCKED item must not be permanently unreachable");
  assert.match(body, /\.eq\("recovery_exhausted",\s*false\)/, "the due-item query must exclude items that have genuinely exhausted recovery (Mission F) -- distinct from an ordinary still-retrying BLOCKED row");
  assert.match(body, /\.lt\("retry_count",\s*MAX_RECOVERY_ATTEMPTS\)/, "the retry must be bounded by a real cap -- never unbounded re-execution of a permanently-failing item");
  assert.match(src, /export const MAX_RECOVERY_ATTEMPTS\s*=\s*\d+;/, "the retry cap must be a real, finite, exported constant (exported so the admin diagnostics surface can display it without hardcoding a second copy)");
  console.log("prepareNearTermPackageItems: BLOCKED items are re-selectable, bounded by a real recovery-attempt cap — PASS");

  // --- A retry actually changes the angle: the failed pillar is recorded
  //     even on failure, so the next attempt's deterministic
  //     selectLeastRecentlyUsed is structurally steered away from it ------
  assert.match(body, /attemptedPillar\s*=\s*brief\.contentPillar/, "a pillar chosen during a failed attempt must be captured before any throw can lose it");
  const catchIndex = body.indexOf("} catch (err) {");
  const catchBody = body.slice(catchIndex);
  assert.match(catchBody, /attemptedPillar\s*\?\s*\{\s*content_pillar:\s*attemptedPillar\s*\}/, "the BLOCKED write must persist the attempted pillar so recentPillarNames (which scans every status) reflects it for the next real attempt");
  console.log("prepareNearTermPackageItems: a retry's failed pillar is recorded, structurally steering the next attempt toward a different angle — PASS");

  // --- retry_count is actually incremented on repeated failure -----------
  assert.match(catchBody, /const nextRetryCount = item\.retry_count \+ 1;/, "retry_count must increment on each real failure -- otherwise the bound above is meaningless (every BLOCKED row would read as retry_count 0 forever)");
  assert.match(catchBody, /retry_count:\s*nextRetryCount/, "the incremented value must actually be persisted");
  console.log("prepareNearTermPackageItems: retry_count increments on real failure, making the recovery-attempt cap actually enforceable — PASS");

  // --- A successful retry can advance a BLOCKED row, not just PLANNED ----
  const successGuardIndex = body.indexOf('status: authorization.publishing_mode === "AUTO_PUBLISH"');
  const successBlock = body.slice(Math.max(0, successGuardIndex - 50), successGuardIndex + 400);
  assert.match(successBlock, /\.in\("status",\s*\["PLANNED",\s*"BLOCKED"\]\)/, "the success-path optimistic-concurrency guard must accept a currently-BLOCKED row too, or a genuinely successful retry could never actually advance it to PREPARED");
  console.log("prepareNearTermPackageItems: a successful cross-pass retry can advance a BLOCKED row to PREPARED — PASS");

  console.log("blocked-item-retry-loop.test.ts: ALL PASS");
}

run();
