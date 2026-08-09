// Run with: node --experimental-strip-types lib/owner-brain/__tests__/memory-lifecycle.test.ts
import assert from "node:assert/strict";
import { isDuplicateStatement, clamp01, defaultExpiryFor } from "../memory/pure.ts";
import { MEMORY_TYPES, REQUIRES_CONFIRMATION, AUTO_EXPIRES } from "../types.ts";

function run() {
  // --- dedupe predicate ---
  assert.equal(isDuplicateStatement("Prefers one final prompt", "Prefers one final prompt instead of ten small ones"), true, "substring match (existing shorter) must dedupe");
  assert.equal(isDuplicateStatement("Prefers one final prompt instead of ten small ones", "Prefers one final prompt"), true, "substring match (candidate shorter) must dedupe");
  assert.equal(isDuplicateStatement("  Prefers ONE final prompt  ", "prefers one final prompt"), true, "case/whitespace must not defeat dedupe");
  assert.equal(isDuplicateStatement("Uses AWS for production", "Uses Railway for production"), false, "genuinely different statements must not dedupe");
  assert.equal(isDuplicateStatement("", "Uses AWS"), false, "empty existing statement must never match");
  assert.equal(isDuplicateStatement("Uses AWS", ""), false, "empty candidate statement must never match");

  // --- confidence clamping ---
  assert.equal(clamp01(1.5), 1, "confidence must never exceed 1");
  assert.equal(clamp01(-0.3), 0, "confidence must never go negative");
  assert.equal(clamp01(0.42), 0.42, "in-range confidence passes through unchanged");

  // --- expiry policy ---
  const now = Date.parse("2026-08-10T12:00:00.000Z");
  const tempExpiry = defaultExpiryFor("TEMPORARY_CONTEXT", now);
  assert.equal(tempExpiry, new Date(now + 48 * 60 * 60 * 1000).toISOString(), "TEMPORARY_CONTEXT must decay after 48h");
  const otherExpiry = defaultExpiryFor("SELF_REPORTED_STATE", now);
  assert.equal(otherExpiry, new Date(now + 24 * 60 * 60 * 1000).toISOString(), "non-TEMPORARY_CONTEXT auto-expiring types default to 24h");

  // --- lifecycle policy invariants (the actual "never silently convert an inference into a fact" rule) ---
  assert.deepEqual(REQUIRES_CONFIRMATION, ["INFERRED_WORK_PATTERN"], "only inferred work patterns require explicit confirmation before being trusted");
  assert.deepEqual(AUTO_EXPIRES, ["TEMPORARY_CONTEXT"], "only temporary context auto-expires by default");
  assert.equal(MEMORY_TYPES.length, 8, "all 8 memory types from the spec must be present");
  for (const t of ["FACT", "EXPLICIT_PREFERENCE", "SELF_REPORTED_STATE", "INFERRED_WORK_PATTERN", "TEMPORARY_CONTEXT", "DECISION", "LESSON", "OPEN_LOOP"]) {
    assert.ok(MEMORY_TYPES.includes(t as (typeof MEMORY_TYPES)[number]), `MEMORY_TYPES must include ${t}`);
  }

  console.log("memory-lifecycle.test.ts (owner-brain): ALL PASS (dedupe predicate, confidence clamp, expiry policy, type invariants)");
}

run();
