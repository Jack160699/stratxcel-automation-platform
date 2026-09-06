// Critical safety regression test -- Local AI + Social Autopilot final
// production certification mission (2026-09-06) explicitly calls this a
// "critical acceptance requirement": Local AI must NEVER execute a
// tools-bearing request as if it has tools.
//
// Real finding (2026-09-05, re-confirmed live again during this
// certification pass via /api/internal/ai/diagnostics action
// "chat_with_tools"): the remote Local AI server has no real function/tool
// calling. Given a `tools` schema, it returns ZERO real tool_calls and
// instead HALLUCINATES a fake "[Tool call: get_weather(...)]" narrative
// with fabricated data (e.g. a made-up temperature), which would look
// grounded/tool-verified to any caller that trusts it. runtime.ts's
// runCandidate() closes this by skipping the local candidate entirely
// whenever request.tools is non-empty, for every task class -- this test
// proves that guard is still present, still runs BEFORE the local provider
// is ever actually invoked, and still lets execution genuinely fall
// through to the next real candidate (never a hard failure) exactly the
// way primary -> fallback already works for any other NOT_CONFIGURED
// candidate.
//
// Static source-inspection test (matches this package's existing
// convention, e.g. ai-runtime-corrections.test.ts).
// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/local-tool-calling-safety-guard.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeSource = fs.readFileSync(path.join(root, "runtime.ts"), "utf8");

function run() {
  // --- 1. The guard exists, keyed on the real provider id and the real
  //        request field, not a re-guessed condition. -----------------
  assert.match(
    runtimeSource,
    /candidate\.provider === "local" && request\.tools\?\.length/,
    "runCandidate must skip the local provider whenever the request carries a tools schema"
  );

  // --- 2. The guard runs BEFORE the local provider is ever actually
  //        invoked (before providerFor/adapter.isConfigured/any real
  //        network call) -- a hallucinated tool call must never even be
  //        attempted, not merely discarded after the fact. --------------
  const runCandidateStart = runtimeSource.indexOf("const runCandidate = async");
  assert.ok(runCandidateStart >= 0, "runCandidate must exist");
  const guardIndex = runtimeSource.indexOf('candidate.provider === "local" && request.tools?.length', runCandidateStart);
  const adapterCallIndex = runtimeSource.indexOf("this.providerFor(candidate.provider)", runCandidateStart);
  assert.ok(guardIndex > runCandidateStart, "guard must be inside runCandidate");
  assert.ok(adapterCallIndex > guardIndex, "the guard must run strictly before the local provider adapter is ever invoked");

  // --- 3. Skipping local this way returns null / NOT_CONFIGURED, the
  //        same signal every other unavailable candidate uses -- so the
  //        existing primary -> fallback -> escalation chain (unchanged)
  //        genuinely tries the next real candidate, never hard-fails the
  //        whole request just because local was skipped. ----------------
  const guardBlockEnd = runtimeSource.indexOf("\n\n", guardIndex);
  const guardBlock = runtimeSource.slice(guardIndex - 60, guardBlockEnd);
  assert.match(guardBlock, /lastErrorCategory = "NOT_CONFIGURED"/, "skipping local for a tools-bearing request must use the same NOT_CONFIGURED signal as any other unavailable candidate");
  assert.match(guardBlock, /return null/, "must return null (skip), never throw -- a thrown error would abort the whole request instead of falling through to fallback");

  // --- 4. The real primary -> fallback chain that a null runCandidate
  //        result relies on is still wired exactly as before. -----------
  assert.match(runtimeSource, /const primary = normalPool\.find\(\(c\) => c\.role === "primary"\) \?\? normalPool\[0\];/, "primary candidate selection must be unchanged");
  assert.match(runtimeSource, /const fallback = normalPool\.find\(\(c\) => c\.role === "fallback"\);/, "fallback candidate selection must be unchanged -- this is what a skipped local primary actually falls through to");

  console.log("local-tool-calling-safety-guard.test.ts: ALL PASS");
}

run();
