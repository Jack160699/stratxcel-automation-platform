// Run with: node --experimental-strip-types lib/owner-brain/__tests__/oauth-state.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { generateOwnerBrainOAuthState, verifyOwnerBrainOAuthState } from "../connectors/oauth-state.ts";

function run() {
  process.env.OWNER_BRAIN_OAUTH_STATE_SECRET = "test-state-secret";

  const state = generateOwnerBrainOAuthState({ ownerId: "owner-1", sourceKey: "gmail" });
  const verified = verifyOwnerBrainOAuthState(state);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.ownerId, "owner-1");
    assert.equal(verified.sourceKey, "gmail");
  }

  // Tampering the ownerId (e.g. an attacker trying to bind their own callback to someone else's owner) must invalidate the signature.
  const [encoded, signature] = state.split(".");
  const tamperedPayload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  tamperedPayload.ownerId = "attacker-owner";
  const tamperedEncoded = Buffer.from(JSON.stringify(tamperedPayload)).toString("base64url");
  const tampered = verifyOwnerBrainOAuthState(`${tamperedEncoded}.${signature}`);
  assert.equal(tampered.ok, false);
  if (!tampered.ok) assert.equal(tampered.reason, "invalid_signature");

  assert.equal(verifyOwnerBrainOAuthState("not-a-real-state").ok, false);
  assert.equal(verifyOwnerBrainOAuthState("only.one.part.too.many").ok, false);

  // Expiry: a state issued 11 minutes ago (beyond the 10-minute TTL) must be rejected.
  const staleEncoded = Buffer.from(JSON.stringify({ ownerId: "owner-1", sourceKey: "gmail", issuedAtMs: Date.now() - 11 * 60 * 1000 })).toString("base64url");
  const staleSig = crypto.createHmac("sha256", "test-state-secret").update(staleEncoded).digest("base64url");
  const stale = verifyOwnerBrainOAuthState(`${staleEncoded}.${staleSig}`);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, "expired");

  delete process.env.OWNER_BRAIN_OAUTH_STATE_SECRET;
  console.log("oauth-state.test.ts (owner-brain): ALL PASS (round-trip, tamper detection, malformed input, expiry)");
}

run();
