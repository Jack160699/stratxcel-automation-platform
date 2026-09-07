// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/memory-confidence-classification.test.ts
//
// Verifies the master brief Section 19 provenance/confidence classification
// added to agent_memories: the safe default is always UNKNOWN (never
// silently upgraded to FACT/VERIFIED), a caller can explicitly set a
// stronger classification, and both WhatsApp/Admin Copilot's own
// remember_fact tool and its underlying rememberAgentFact/listAgentMemories
// carry it through correctly.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), "packages", "agent-core", "src", relativePath), "utf8").replace(/\r\n/g, "\n");
}

async function testMemoryConfidenceValuesMatchTheRealDbConstraintExactly() {
  const { MEMORY_CONFIDENCE_VALUES } = await import("@stratxcel/agent-core");
  assert.deepEqual(
    [...MEMORY_CONFIDENCE_VALUES],
    ["FACT", "VERIFIED", "OBSERVATION", "INFERENCE", "PREFERENCE", "EXPERIMENT", "UNKNOWN"],
    "must match agent_memories.confidence's own CHECK constraint (supabase/migrations/20260907210000_agent_memories_confidence_classification.sql) exactly, in the same order the brief names them"
  );
  console.log("memory-confidence-classification.test.ts: MEMORY_CONFIDENCE_VALUES matches the real DB constraint exactly — PASS");
}

async function testRememberAgentFactDefaultsToUnknownAndNeverToAStrongerClassification() {
  const source = readSource("brain/memory/repository.ts");
  assert.match(source, /const confidence = input\.confidence \?\? "UNKNOWN";/, "rememberAgentFact must default an omitted confidence to UNKNOWN, matching the DB column's own default -- never FACT/VERIFIED by omission");
  assert.match(source, /\.update\(\{ memory_value: input\.value, confidence, updated_at:/, "an update to an existing memory must also persist the (possibly re-classified) confidence, not silently keep the old one stale");
  assert.match(source, /memory_key: input\.key, memory_value: input\.value, confidence, source_channel:/, "a new memory insert must persist the real confidence value");
  console.log("memory-confidence-classification.test.ts: rememberAgentFact defaults to UNKNOWN and never silently upgrades — PASS");
}

async function testListAgentMemoriesSelectsAndReturnsConfidence() {
  const source = readSource("brain/memory/repository.ts");
  assert.match(source, /\.select\("id, scope, memory_key, memory_value, confidence, updated_at"\)/, "listAgentMemories must select the real confidence column, not silently drop it");
  assert.match(source, /confidence: row\.confidence/, "listAgentMemories must map the real confidence value into its output, not fabricate or omit it");
  console.log("memory-confidence-classification.test.ts: listAgentMemories selects and returns the real confidence column — PASS");
}

async function testRememberFactToolExposesConfidenceAsOptionalAndValidatesIt() {
  // MEMORY_TOOLS itself is not re-exported from @stratxcel/agent-core's own
  // index (it's consumed via all-tools.ts's aggregation, which pulls in a
  // wide transitive chain of sibling files not all extension-safe under
  // plain node -- same class of issue this session's own memory already
  // documents). Verified via source inspection instead, matching that
  // established precedent (e.g. agent-factory-status.test.ts).
  const source = readSource("brain/memory/tools.ts");
  assert.match(source, /const confidenceSchema = \{/, "remember_fact must define a real confidence schema, not an inline ad-hoc one");
  assert.match(source, /enum: MEMORY_CONFIDENCE_VALUES,/, "the confidence schema's enum must be the real, shared MEMORY_CONFIDENCE_VALUES, not a hand-duplicated list that could drift");
  const rememberFactBlock = source.match(/schema: \{ name: "remember_fact"[\s\S]*?\},\n  \},/)?.[0];
  assert.ok(rememberFactBlock, "remember_fact tool definition must exist");
  assert.match(rememberFactBlock!, /confidence: confidenceSchema/, "remember_fact's parameters must include the confidence schema");
  assert.match(rememberFactBlock!, /required: \["scope", "key", "value"\]/, "confidence must be optional -- a caller that genuinely doesn't know yet must still be able to save the fact, defaulting to UNKNOWN");
  console.log("memory-confidence-classification.test.ts: remember_fact exposes confidence as an optional, correctly-enumerated parameter — PASS");
}

async function testRememberFactHandlerRejectsAnInvalidConfidenceRatherThanPassingItThrough() {
  const source = readSource("brain/memory/tools.ts");
  assert.match(source, /function isMemoryConfidence\(value: unknown\): value is MemoryConfidence \{/, "must validate confidence against the real enum before use");
  assert.match(source, /const confidence = isMemoryConfidence\(args\.confidence\) \? args\.confidence : undefined;/, "an invalid/absent confidence must become undefined (letting rememberAgentFact's own UNKNOWN default apply), never passed through raw");
  console.log("memory-confidence-classification.test.ts: remember_fact's handler validates confidence rather than trusting raw model input — PASS");
}

async function run() {
  await testMemoryConfidenceValuesMatchTheRealDbConstraintExactly();
  await testRememberAgentFactDefaultsToUnknownAndNeverToAStrongerClassification();
  await testListAgentMemoriesSelectsAndReturnsConfidence();
  await testRememberFactToolExposesConfidenceAsOptionalAndValidatesIt();
  await testRememberFactHandlerRejectsAnInvalidConfidenceRatherThanPassingItThrough();
  console.log("memory-confidence-classification.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
