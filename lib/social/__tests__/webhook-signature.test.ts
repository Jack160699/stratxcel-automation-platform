// Tests Meta webhook X-Hub-Signature-256 verification.
// Run with: node --experimental-strip-types lib/social/__tests__/webhook-signature.test.ts

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyMetaSignature } from "../webhook-signature.ts";

function sign(body: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function run() {
  const secret = "test-app-secret";
  const body = JSON.stringify({ object: "instagram", entry: [{ id: "1", time: 123, changes: [] }] });

  // Valid signature -> accepted
  assert.equal(verifyMetaSignature(body, sign(body, secret), secret), true);

  // Wrong secret -> rejected
  assert.equal(verifyMetaSignature(body, sign(body, "wrong-secret"), secret), false);

  // Tampered body (signature computed for different body) -> rejected
  const tamperedBody = JSON.stringify({ object: "instagram", entry: [{ id: "2", time: 123, changes: [] }] });
  assert.equal(verifyMetaSignature(tamperedBody, sign(body, secret), secret), false);

  // Missing header -> rejected
  assert.equal(verifyMetaSignature(body, null, secret), false);

  // Wrong scheme -> rejected
  assert.equal(verifyMetaSignature(body, "sha1=deadbeef", secret), false);

  // Malformed header -> rejected, not thrown
  assert.equal(verifyMetaSignature(body, "not-a-real-header", secret), false);

  // Empty app secret -> rejected (fail closed, never treat "no secret configured" as valid)
  assert.equal(verifyMetaSignature(body, sign(body, secret), ""), false);

  console.log("webhook-signature.test.ts: ALL PASS (valid, wrong secret, tampered body, missing/malformed header, empty secret)");
}

run();
