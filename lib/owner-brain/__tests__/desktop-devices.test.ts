// Run with: node --experimental-strip-types lib/owner-brain/__tests__/desktop-devices.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { hashPairingCode } from "../repositories/pairing-hash.ts";

function run() {
  const code = "correct-pairing-code";
  const hash1 = hashPairingCode(code);
  const hash2 = hashPairingCode(code);
  assert.equal(hash1, hash2, "hashing the same code twice must be deterministic");
  assert.notEqual(hashPairingCode("wrong-code"), hash1, "a different code must hash differently");
  assert.equal(hash1.length, 64, "sha256 hex digest must be 64 chars");
  assert.notEqual(hash1, code, "the stored value must never be the plaintext code itself");

  // Simulates the timing-safe comparison authenticateDevice() does — same
  // length requirement crypto.timingSafeEqual enforces, exercised here so
  // a future refactor that breaks that invariant fails a test, not just
  // a runtime exception on a real pairing attempt.
  const a = Buffer.from(hash1);
  const b = Buffer.from(hashPairingCode("wrong-code"));
  assert.equal(a.length, b.length, "equal-length hashes are required for constant-time compare to even run");
  assert.equal(crypto.timingSafeEqual(a, b), false);
  assert.equal(crypto.timingSafeEqual(a, Buffer.from(hash1)), true);

  console.log("desktop-devices.test.ts (owner-brain): ALL PASS (pairing-code hash determinism, no-plaintext-storage, timing-safe compare shape)");
}

run();
