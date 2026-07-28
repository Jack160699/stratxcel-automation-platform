// Test Meta API error classification (rate limit / invalid token / permission
// / malformed / unknown) and the retryable flag the worker relies on to
// decide bounded-retry vs immediate dead-letter.
// Run with: node --experimental-strip-types lib/social/__tests__/errors.test.ts

import assert from "node:assert/strict";
import { toMetaApiError, toYouTubeApiError, MetaApiError } from "../errors.ts";

function fakeResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

async function run() {
  // 429 -> rate_limit, retryable
  const rl = await toMetaApiError(fakeResponse(429, {}), "test");
  assert.equal(rl.category, "rate_limit");
  assert.equal(rl.retryable, true);

  // Graph error code 190 -> invalid_token, NOT retryable
  const invalidToken = await toMetaApiError(
    fakeResponse(400, { error: { message: "Token expired", code: 190 } }),
    "test"
  );
  assert.equal(invalidToken.category, "invalid_token");
  assert.equal(invalidToken.retryable, false);

  // Graph error code 10 (permission) -> permission, NOT retryable
  const perm = await toMetaApiError(
    fakeResponse(403, { error: { message: "Missing permission", code: 10 } }),
    "test"
  );
  assert.equal(perm.category, "permission");
  assert.equal(perm.retryable, false);

  // Graph error code 4 (throughput) -> rate_limit, retryable
  const throughput = await toMetaApiError(
    fakeResponse(400, { error: { message: "Too many calls", code: 4 } }),
    "test"
  );
  assert.equal(throughput.category, "rate_limit");
  assert.equal(throughput.retryable, true);

  // Non-JSON / malformed body -> malformed_response, retryable (worth a retry,
  // could be a transient upstream glitch)
  const malformed = await toMetaApiError(fakeResponse(500, "<html>Internal Server Error</html>"), "test");
  assert.equal(malformed.category, "malformed_response");
  assert.equal(malformed.retryable, true);

  // Unknown Graph error code -> unknown, retryable by default (fail open
  // toward retrying rather than silently giving up on an unrecognized error)
  const unknown = await toMetaApiError(
    fakeResponse(400, { error: { message: "Something else", code: 999 } }),
    "test"
  );
  assert.equal(unknown.category, "unknown");
  assert.equal(unknown.retryable, true);

  const invalidGoogleRefreshGrant = await toYouTubeApiError(
    fakeResponse(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." }),
    "YouTube token refresh"
  );
  assert.equal(invalidGoogleRefreshGrant.category, "invalid_token");
  assert.equal(invalidGoogleRefreshGrant.retryable, false);

  assert.ok(rl instanceof MetaApiError);

  console.log(
    "errors.test.ts: ALL PASS (rate limit, invalid token, permission, throughput, malformed, unknown, Google refresh grant)"
  );
}

run();
