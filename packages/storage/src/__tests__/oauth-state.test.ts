// Run with: node --experimental-strip-types packages/storage/src/__tests__/oauth-state.test.ts
import assert from "node:assert/strict";
import { generateOAuthState, verifyOAuthState } from "../drive/oauth.ts";

function run() {
  process.env.DRIVE_OAUTH_STATE_SECRET = "test-state-secret";

  const state = generateOAuthState({ tenantId: "tenant-1", userId: "user-1" });
  const verified = verifyOAuthState(state);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.tenantId, "tenant-1");
    assert.equal(verified.userId, "user-1");
  }

  // Tampering must invalidate
  const [encoded, signature] = state.split(".");
  const tamperedPayload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  tamperedPayload.tenantId = "attacker-tenant";
  const tamperedEncoded = Buffer.from(JSON.stringify(tamperedPayload)).toString("base64url");
  const tampered = verifyOAuthState(`${tamperedEncoded}.${signature}`);
  assert.equal(tampered.ok, false);
  if (!tampered.ok) assert.equal(tampered.reason, "invalid_signature");

  assert.equal(verifyOAuthState("not-a-real-state").ok, false);

  delete process.env.DRIVE_OAUTH_STATE_SECRET;
  console.log("oauth-state.test.ts (@stratxcel/storage): ALL PASS");
}

run();
