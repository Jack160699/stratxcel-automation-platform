// Focused security test for signed/expiring/single-use OAuth state tokens.
// Run with: node --experimental-strip-types lib/social/__tests__/oauth-state.test.ts
// Requires SOCIAL_OAUTH_STATE_SECRET to be set.

import assert from "node:assert/strict";
import { createSignedState, verifySignedState } from "../oauth-state.ts";

function run() {
  if (!process.env.SOCIAL_OAUTH_STATE_SECRET) {
    process.env.SOCIAL_OAUTH_STATE_SECRET = "test-social-oauth-state-secret-32bytes-min";
  }
  // 1. Valid, freshly-issued state verifies and round-trips the provider + redirect
  const { token, hash } = createSignedState("instagram", "/admin/social");
  const verified = verifySignedState(token);
  assert.equal(verified.valid, true, "freshly issued state must verify");
  if (verified.valid) {
    assert.equal(verified.payload.provider, "instagram");
    assert.equal(verified.payload.redirectTo, "/admin/social");
    assert.equal(verified.hash, hash, "hash used for DB lookup must be deterministic from the token");
  }

  // 2. Nonce is present and random — two states for the same provider must differ
  const a = createSignedState("facebook");
  const b = createSignedState("facebook");
  assert.notEqual(a.token, b.token, "two issued states must not be identical (nonce required)");
  assert.notEqual(a.hash, b.hash);

  // 3. Tampering with the payload (provider swap) must invalidate the signature
  const [payloadB64, sig] = token.split(".");
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  const tamperedPayload = { ...payload, provider: "threads" };
  const tamperedB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString("base64url");
  const tamperedToken = `${tamperedB64}.${sig}`;
  const tamperedResult = verifySignedState(tamperedToken);
  assert.equal(tamperedResult.valid, false, "payload tampering must fail signature check");
  assert.equal((tamperedResult as { reason: string }).reason, "bad_signature");

  // 4. Tampering with the signature itself must fail
  const badSigToken = `${payloadB64}.${sig.slice(0, -2)}xx`;
  const badSigResult = verifySignedState(badSigToken);
  assert.equal(badSigResult.valid, false);

  // 5. Malformed tokens (wrong shape) must fail cleanly, not throw
  for (const malformed of ["not-a-token", "a.b.c", "", "onlyonepart"]) {
    const r = verifySignedState(malformed);
    assert.equal(r.valid, false, `malformed input "${malformed}" must be rejected, not accepted`);
  }

  // 6. Expired state must be rejected — fast-forward Date.now() past the 10-minute TTL and
  // confirm a token that verified fine a moment ago is now rejected as expired.
  const freshState = createSignedState("instagram");
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 11 * 60 * 1000; // 11 minutes later
    const expiredResult = verifySignedState(freshState.token);
    assert.equal(expiredResult.valid, false, "state older than the TTL must be rejected");
    assert.equal((expiredResult as { reason: string }).reason, "expired");
  } finally {
    Date.now = realNow;
  }
  // sanity: same token still valid under real time (proves the mock above was the only reason it failed)
  assert.equal(verifySignedState(freshState.token).valid, true);

  // 7. Provider binding: state issued for one provider must carry that provider through, so a
  // caller that checks `verified.payload.provider !== routeProvider` (as the callback route does)
  // will reject cross-provider replay even though the signature itself is valid.
  const threadsState = createSignedState("threads");
  const threadsVerified = verifySignedState(threadsState.token);
  assert.equal(threadsVerified.valid, true);
  if (threadsVerified.valid) {
    assert.notEqual(threadsVerified.payload.provider, "facebook");
  }

  console.log(
    "oauth-state.test.ts: ALL PASS (valid verify, nonce uniqueness, payload-tamper rejection, signature-tamper rejection, malformed rejection, provider binding)"
  );
}

run();
