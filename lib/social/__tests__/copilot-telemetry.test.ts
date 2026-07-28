// Tests for the Copilot execution-telemetry building blocks: semantic tool
// labels (never raw tool names in the normal UI) and safe, real-data-only
// output summarization (never fabricated counts).
//
// Run with: node --experimental-strip-types lib/social/__tests__/copilot-telemetry.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { labelForTool, labelForApproval, PHASE_LABELS, TOOL_LABELS } from "../agent/activity-labels.ts";
import { summarizeForEvent } from "../agent/tool-output-summary.ts";

function run() {
  // 1. Every real tool has a human label, and it is never just the raw tool name.
  const knownTools = [
    "inspect_health",
    "inspect_jobs",
    "inspect_dead_letters",
    "inspect_accounts",
    "get_performance",
    "list_campaigns",
    "inspect_brand",
    "list_content",
    "create_campaign",
    "create_content_item",
    "create_content_variant",
    "schedule_post",
    "cancel_scheduled_post",
    "set_operating_mode",
  ];
  for (const name of knownTools) {
    assert.ok(TOOL_LABELS[name], `expected a semantic label for tool "${name}"`);
    assert.notEqual(labelForTool(name), name, `label for "${name}" must not be the raw tool name`);
  }
  assert.equal(labelForTool("inspect_brand"), "Reading Brand Brain");
  assert.equal(labelForTool("create_content_variant"), "Preparing platform variant");

  // 2. Unknown tools still get an honest (not blank, not misleading) fallback label.
  assert.equal(labelForTool("some_future_tool"), "Running some_future_tool");

  // 3. Approval labels never say "Generating image" or fabricate specifics — they
  // name the real tool being gated.
  assert.equal(labelForApproval("schedule_post"), "Waiting for your approval — Scheduling post");

  // 4. Canonical phase labels exist for every non-tool lifecycle event type.
  assert.ok(PHASE_LABELS.RUN_STARTED);
  assert.ok(PHASE_LABELS.UNDERSTANDING_REQUEST);
  assert.ok(PHASE_LABELS.PROVIDER_REQUEST_STARTED);
  assert.ok(PHASE_LABELS.RUN_COMPLETED);
  assert.ok(PHASE_LABELS.RUN_FAILED);

  // 5. summarizeForEvent only ever reports counts that are actually present.
  assert.deepEqual(summarizeForEvent([1, 2, 3]), { count: 3 });
  assert.deepEqual(summarizeForEvent({ counts: { products: 18, audiences: 9 } }), { products: 18, audiences: 9 });
  assert.deepEqual(summarizeForEvent({ accounts: [1, 2, 3, 4, 5] }), { accounts: 5 });
  assert.equal(summarizeForEvent({ ok: true }), undefined, "no fabricated counts for a plain scalar object");
  assert.equal(summarizeForEvent("just a string"), undefined);
  assert.equal(summarizeForEvent(null), undefined);

  // 6. orchestrator.ts actually instruments the real event lifecycle — checked
  // via source text since its module graph (repositories/system, etc.) uses
  // extension-less relative imports that `node --experimental-strip-types`
  // can't resolve standalone (same constraint as brand-grounding.test.ts).
  const orchestratorPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "agent", "orchestrator.ts");
  const source = fs.readFileSync(orchestratorPath, "utf8");
  for (const eventType of [
    "RUN_STARTED",
    "UNDERSTANDING_REQUEST",
    "PROVIDER_REQUEST_STARTED",
    "PROVIDER_RESPONSE_RECEIVED",
    "TOOL_STARTED",
    "TOOL_COMPLETED",
    "TOOL_FAILED",
    "APPROVAL_REQUIRED",
    "RUN_COMPLETED",
    "RUN_FAILED",
  ]) {
    assert.ok(source.includes(`"${eventType}"`), `orchestrator.ts must record a "${eventType}" event`);
  }
  // The whole turn must be wrapped so a thrown error still produces a FAILED
  // run + a graceful (non-throwing) result, never a hard server-action crash.
  assert.ok(source.includes("try {") && source.includes("} catch (err) {"), "runAgentTurn must catch failures and report them, not crash the request");
  assert.ok(source.includes("failed: true as const"), "a failed run must return an honest failed:true result");

  console.log("copilot-telemetry.test.ts: ALL PASS (semantic tool labels, safe output summaries, real orchestrator instrumentation)");
}

run();
