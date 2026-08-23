// Regression test for the real root cause of a live production timeout:
// a fresh audit against a real, live, crawlable website still returned
// INSUFFICIENT_EVIDENCE, and runtime logs showed the grounded AI call
// hitting TIMEOUT / "All provider attempts exhausted" — even after
// widening the generic AI_PROVIDER_TIMEOUT_MS default. Traced across
// three files: grounded-runtime.ts (in @stratxcel/search-discovery)
// correctly asks for a widened timeoutMs on any requireWebEvidence
// request, and lib/workforce/bind-capability-hosts.ts's
// getResearchAIExecutor correctly forwards it — but LiveAuditResearchProvider
// (this package) is the one the real audit pipeline actually uses, and it
// constructs its own `new AIRuntime(...)` with a completely separate
// inline `ai.execute` closure that silently dropped input.timeoutMs on
// the floor. The widened budget the caller asked for never reached the
// provider call that actually runs during a real audit.
//
// Static source-inspection test — LiveAuditResearchProvider's `research()`
// constructs a real Supabase-backed AIRuntime and can't be exercised
// standalone under `node --experimental-strip-types` without a live
// project, same constraint as this package's other __tests__ files that
// use this pattern (see automatic-audit-engine.test.ts).
// Run with: node --experimental-strip-types packages/audit-engine/src/__tests__/research-timeout-wiring.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const liveSource = fs.readFileSync(path.join(root, "live.ts"), "utf8");

function run() {
  // --- The audit engine's own inline research executor must forward the
  // caller's requested timeoutMs to the real runtime.execute() call. ------
  const aiExecutorStart = liveSource.indexOf("ai: {");
  const aiExecutorEnd = liveSource.indexOf("const { data: snapshot }", aiExecutorStart);
  assert.ok(aiExecutorStart > -1 && aiExecutorEnd > aiExecutorStart, "could not locate LiveAuditResearchProvider's inline `ai:` executor in live.ts — check it hasn't moved/been restructured");
  const aiExecutorBlock = liveSource.slice(aiExecutorStart, aiExecutorEnd);

  assert.match(
    aiExecutorBlock,
    /execution = await runtime\.execute\(\{[\s\S]*?timeoutMs:\s*input\.timeoutMs/,
    "LiveAuditResearchProvider's inline ai.execute() must forward input.timeoutMs to runtime.execute() — omitting it silently discards the widened research timeout grounded-runtime.ts asks for, exactly the bug found live in production"
  );

  console.log("PASS: LiveAuditResearchProvider forwards the widened research timeoutMs through to the real AIRuntime call");
}

run();
