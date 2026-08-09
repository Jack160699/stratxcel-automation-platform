// Run with: node --experimental-strip-types lib/owner-brain/__tests__/hermes-context-boundary.test.ts
import assert from "node:assert/strict";
import { filterUsableMemories, capContextSize } from "../hermes/context-pure.ts";

function run() {
  // --- filterUsableMemories: an UNCONFIRMED inference must never reach Hermes ---
  const memories = [
    { id: "1", memory_type: "INFERRED_WORK_PATTERN" as const, confirmation_state: "UNCONFIRMED" as const },
    { id: "2", memory_type: "INFERRED_WORK_PATTERN" as const, confirmation_state: "CONFIRMED" as const },
    { id: "3", memory_type: "EXPLICIT_PREFERENCE" as const, confirmation_state: "UNCONFIRMED" as const },
    { id: "4", memory_type: "FACT" as const, confirmation_state: "REJECTED" as const },
  ];
  const usable = filterUsableMemories(memories);
  const usableIds = usable.map((m) => m.id).sort();
  assert.deepEqual(usableIds, ["2", "3", "4"], "only the UNCONFIRMED INFERRED_WORK_PATTERN memory (id 1) must be excluded — every other type/state passes through unfiltered, including UNCONFIRMED preferences and REJECTED facts (retrieval filtering is narrow and specific, not a blanket confirmation gate)");

  // --- capContextSize: hard size cap, memories-first trimming, never leaves the array negative/broken ---
  const bigContext = { memories: Array.from({ length: 100 }, (_, i) => ({ statement: `memory number ${i} `.repeat(5) })), other: "kept" };
  const capped = capContextSize(bigContext, 500);
  assert.ok(JSON.stringify(capped).length <= 500, "serialized context must never exceed the cap");
  assert.ok(capped.memories.length < 100, "oversized context must actually be trimmed");
  assert.equal(capped.other, "kept", "non-memory fields must never be dropped by the size cap");

  // A context already under the cap must be returned untouched.
  const smallContext = { memories: [{ statement: "one short memory" }], other: "kept" };
  const uncapped = capContextSize(smallContext, 4000);
  assert.equal(uncapped.memories.length, 1);

  // Even an absurdly small cap must terminate (never trims below zero / infinite-loops).
  const extreme = capContextSize({ memories: [{ statement: "x" }, { statement: "y" }], other: "z" }, 1);
  assert.equal(extreme.memories.length, 0, "an unreachable cap must drain memories to empty, not loop or throw");

  console.log("hermes-context-boundary.test.ts (owner-brain): ALL PASS (unconfirmed-inference exclusion, hard size cap, non-memory fields preserved, termination on extreme cap)");
}

run();
