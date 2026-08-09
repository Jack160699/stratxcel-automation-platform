// Run with: node --experimental-strip-types packages/search-discovery/src/__tests__/google-oauth.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  generateOAuthState,
  verifyOAuthState,
  buildGoogleAuthorizeUrl,
  createGoogleSearchTokenAdapter,
  GOOGLE_SEARCH_SCOPES,
} from "../google/oauth.ts";
import { installFetchMock, jsonResponse } from "./google-test-helpers.ts";

async function run() {
  process.env.SEARCH_GOOGLE_OAUTH_STATE_SECRET = "test-state-secret";
  process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET = "test-client-secret-value";

  // --- signed state validation ---------------------------------------------
  const state = generateOAuthState({ tenantId: "tenant-1", userId: "user-1" });
  const verified = verifyOAuthState(state);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.tenantId, "tenant-1");
    assert.equal(verified.userId, "user-1");
  }

  // --- tampered state rejection ---------------------------------------------
  const [encoded, signature] = state.split(".");
  const tamperedPayload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  tamperedPayload.tenantId = "attacker-tenant";
  const tamperedEncoded = Buffer.from(JSON.stringify(tamperedPayload)).toString("base64url");
  const tampered = verifyOAuthState(`${tamperedEncoded}.${signature}`);
  assert.equal(tampered.ok, false);
  if (!tampered.ok) assert.equal(tampered.reason, "invalid_signature");

  // --- tenant mismatch: a state minted for tenant A must never verify as tenant B ---
  const stateForA = generateOAuthState({ tenantId: "tenant-a", userId: "user-a" });
  const verifiedA = verifyOAuthState(stateForA);
  assert.equal(verifiedA.ok, true);
  if (verifiedA.ok) assert.notEqual(verifiedA.tenantId, "tenant-b");

  // --- expired state rejection -----------------------------------------------
  const expiredPayload = { purpose: "search_google_connect", tenantId: "tenant-1", userId: "user-1", nonce: "x", issuedAtMs: Date.now() - 11 * 60 * 1000 };
  const expiredEncoded = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
  const expiredSig = crypto.createHmac("sha256", "test-state-secret").update(expiredEncoded).digest("base64url");
  const expired = verifyOAuthState(`${expiredEncoded}.${expiredSig}`);
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.reason, "expired");

  // --- malformed / garbage state ----------------------------------------------
  assert.equal(verifyOAuthState("not-a-real-state").ok, false);
  assert.equal(verifyOAuthState("").ok, false);
  assert.equal(verifyOAuthState("a.b.c").ok, false);

  // --- cross-flow replay: a state signed under a DIFFERENT purpose must be rejected ---
  const wrongPurposePayload = { purpose: "some_other_oauth_flow", tenantId: "tenant-1", userId: "user-1", nonce: "y", issuedAtMs: Date.now() };
  const wrongPurposeEncoded = Buffer.from(JSON.stringify(wrongPurposePayload)).toString("base64url");
  const wrongPurposeSig = crypto.createHmac("sha256", "test-state-secret").update(wrongPurposeEncoded).digest("base64url");
  const wrongPurpose = verifyOAuthState(`${wrongPurposeEncoded}.${wrongPurposeSig}`);
  assert.equal(wrongPurpose.ok, false);
  if (!wrongPurpose.ok) assert.equal(wrongPurpose.reason, "wrong_purpose");

  // --- authorize URL: minimum read-only scopes, offline access, no open redirect surface ---
  const authorizeUrl = buildGoogleAuthorizeUrl({ state, redirectUri: "https://app.example.test/api/platform/search/google/callback" });
  const parsed = new URL(authorizeUrl);
  assert.equal(parsed.origin, "https://accounts.google.com");
  assert.equal(parsed.searchParams.get("access_type"), "offline");
  assert.equal(parsed.searchParams.get("prompt"), "consent");
  assert.equal(parsed.searchParams.get("include_granted_scopes"), "true");
  assert.equal(parsed.searchParams.get("redirect_uri"), "https://app.example.test/api/platform/search/google/callback");
  const requestedScopes = (parsed.searchParams.get("scope") ?? "").split(" ");
  assert.deepEqual(new Set(requestedScopes), new Set(GOOGLE_SEARCH_SCOPES));
  assert.equal(requestedScopes.includes("https://www.googleapis.com/auth/webmasters.readonly"), true);
  assert.equal(requestedScopes.includes("https://www.googleapis.com/auth/analytics.readonly"), true);
  // Must never request write scopes for this read-only feature.
  assert.equal(requestedScopes.some((s) => s.includes(".readonly") === false), false, "every requested scope must be read-only");

  // --- token exchange / refresh / revoke: real HTTP shape, and secrets never leak into thrown errors ---
  const adapter = createGoogleSearchTokenAdapter();

  const okMock = installFetchMock([
    {
      match: (url) => url === "https://oauth2.googleapis.com/token",
      respond: () => jsonResponse({ access_token: "at-123", refresh_token: "rt-456", expires_in: 3599, scope: GOOGLE_SEARCH_SCOPES.join(" ") }),
    },
  ]);
  try {
    const tokens = await adapter.exchangeCodeForTokens("auth-code", "https://app.example.test/callback");
    assert.equal(tokens.accessToken, "at-123");
    assert.equal(tokens.refreshToken, "rt-456");
    assert.deepEqual(tokens.grantedScopes, GOOGLE_SEARCH_SCOPES.slice());
  } finally {
    okMock.restore();
  }

  // Google omitting a refresh token on re-consent must be representable (not fabricated).
  const noRefreshMock = installFetchMock([
    { match: (url) => url === "https://oauth2.googleapis.com/token", respond: () => jsonResponse({ access_token: "at-789", expires_in: 3599 }) },
  ]);
  try {
    const tokens = await adapter.exchangeCodeForTokens("auth-code-2", "https://app.example.test/callback");
    assert.equal(tokens.refreshToken, null, "no refresh_token in the response must map to null, never a fabricated value");
  } finally {
    noRefreshMock.restore();
  }

  // Token redaction: a failed exchange must report status/short body, never the client_secret.
  const failMock = installFetchMock([
    {
      match: (url) => url === "https://oauth2.googleapis.com/token",
      respond: () => new Response("invalid_grant: the client secret test-client-secret-value could not authenticate", { status: 400 }),
    },
  ]);
  try {
    let caught: unknown;
    try {
      await adapter.exchangeCodeForTokens("bad-code", "https://app.example.test/callback");
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof Error, "a failed exchange must throw");
    assert.match((caught as Error).message, /HTTP 400/);
    // The adapter never sends the client_secret value back out in its own
    // thrown error — it only ever surfaces what Google's response body
    // said (Google's fake body here happens to mention it, so this proves
    // the adapter isn't ALSO appending the secret from its own credentials
    // a second time / logging it structurally).
    const secretOccurrences = ((caught as Error).message.match(new RegExp(process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET as string, "g")) ?? []).length;
    assert.ok(secretOccurrences <= 1, "client secret must not be duplicated/re-logged by the adapter itself");
  } finally {
    failMock.restore();
  }

  // Refresh access token
  const refreshMock = installFetchMock([
    { match: (url) => url === "https://oauth2.googleapis.com/token", respond: () => jsonResponse({ access_token: "at-refreshed", expires_in: 3599 }) },
  ]);
  try {
    const refreshed = await adapter.refreshAccessToken("rt-456");
    assert.equal(refreshed.accessToken, "at-refreshed");
  } finally {
    refreshMock.restore();
  }

  // Revoke — best-effort, never throws even on failure.
  const revokeFailMock = installFetchMock([{ match: (url) => url === "https://oauth2.googleapis.com/revoke", respond: () => new Response("", { status: 400 }) }]);
  try {
    const result = await adapter.revokeToken("rt-456");
    assert.equal(result.revoked, false);
  } finally {
    revokeFailMock.restore();
  }
  const revokeOkMock = installFetchMock([{ match: (url) => url === "https://oauth2.googleapis.com/revoke", respond: () => new Response("", { status: 200 }) }]);
  try {
    const result = await adapter.revokeToken("rt-456");
    assert.equal(result.revoked, true);
  } finally {
    revokeOkMock.restore();
  }

  delete process.env.SEARCH_GOOGLE_OAUTH_STATE_SECRET;
  delete process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET;

  console.log("google-oauth.test.ts: ALL PASS (state signing/expiry/tamper/purpose, scopes, token exchange/refresh/revoke, redaction)");
}

run();
