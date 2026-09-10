import assert from "node:assert/strict";
import {
  generateGoogleOAuthState,
  verifyGoogleOAuthState,
  buildGoogleAuthorizeUrl,
  evaluateGoogleServices,
  resolveGoogleOAuthCredentials,
  GOOGLE_SERVICE_DEFINITIONS,
  type CapabilityStatus,
} from "../google-oauth-service.ts";

async function run() {
  console.log("\n=== Testing Google OAuth Connector Service ===\n");

  // 1. State Token Generation and Verification
  process.env.OWNER_BRAIN_OAUTH_STATE_SECRET = "test-secret-key-32-chars-long-minimum!";
  const tenantId = "test-tenant-123";
  const userId = "test-user-456";

  const state = generateGoogleOAuthState({
    tenantId,
    userId,
    redirectTo: "/admin/connectors",
    requestedServices: ["google_drive", "search_console"],
  });

  assert.ok(typeof state === "string" && state.includes("."), "state token must be HMAC dot-separated");

  const verified = verifyGoogleOAuthState(state);
  assert.equal(verified.ok, true, "state must verify successfully");
  if (verified.ok) {
    assert.equal(verified.tenantId, tenantId);
    assert.equal(verified.userId, userId);
    assert.equal(verified.redirectTo, "/admin/connectors");
    assert.deepEqual(verified.services, ["google_drive", "search_console"]);
  }

  // 2. Tampered state rejected
  const tampered = state.slice(0, -4) + "abcd";
  const tamperedRes = verifyGoogleOAuthState(tampered);
  assert.equal(tamperedRes.ok, false, "tampered state must fail verification");
  if (!tamperedRes.ok) {
    assert.equal(tamperedRes.reason, "invalid_signature");
  }

  // 3. Capability Evaluation: Disconnected
  const disconnectedHub = evaluateGoogleServices([], null);
  assert.equal(disconnectedHub.connected, false);
  assert.equal(disconnectedHub.status, "NOT_CONNECTED");
  assert.equal(disconnectedHub.driveReady, false);
  assert.equal(disconnectedHub.searchConsoleReady, false);
  const driveWhenDisconnected = disconnectedHub.services.find((s) => s.key === "google_drive");
  assert.equal(driveWhenDisconnected?.status, "NOT_CONNECTED");

  // 4. Capability Evaluation: Connected with Search Console & GA4 (Current Production State)
  const prodScopes = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/business.manage",
  ];

  const prodHub = evaluateGoogleServices(prodScopes, {
    status: "connected",
    connectedAt: "2026-09-02T18:55:53Z",
    accountEmail: "stratxcelgame@gmail.com",
    accountName: "StratXcel Founder",
  });

  assert.equal(prodHub.connected, true);
  assert.equal(prodHub.status, "CONNECTED");
  assert.equal(prodHub.searchConsoleReady, true, "Search Console must be verified");
  assert.equal(prodHub.analyticsReady, true, "GA4 must be verified");
  assert.equal(prodHub.driveReady, false, "Drive must be false because it only has drive.readonly, not drive.file");

  const driveProd = prodHub.services.find((s) => s.key === "google_drive");
  assert.equal(driveProd?.status, "RESTRICTED", "Read-only drive scope must be RESTRICTED");

  const scProd = prodHub.services.find((s) => s.key === "search_console");
  assert.equal(scProd?.status, "VERIFIED");

  const gaProd = prodHub.services.find((s) => s.key === "google_analytics");
  assert.equal(gaProd?.status, "VERIFIED");

  const adsProd = prodHub.services.find((s) => s.key === "google_ads");
  assert.equal(adsProd?.status, "UNAVAILABLE", "Ads must be UNAVAILABLE without developer token");

  // 5. Capability Evaluation: Fully Authorized with Drive write scope
  const fullScopes = [
    ...prodScopes,
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents",
  ];

  const fullHub = evaluateGoogleServices(fullScopes, {
    status: "connected",
    connectedAt: "2026-09-11T00:00:00Z",
  });

  assert.equal(fullHub.driveReady, true, "Drive must be ready when drive.file is granted");
  const driveFull = fullHub.services.find((s) => s.key === "google_drive");
  assert.equal(driveFull?.status, "AUTHORIZED");

  const sheetsFull = fullHub.services.find((s) => s.key === "google_sheets");
  assert.equal(sheetsFull?.status, "AUTHORIZED");

  // 6. Build Authorization URL
  process.env.GOOGLE_OWNER_BRAIN_CLIENT_ID = "756598763212-mockclientid.apps.googleusercontent.com";
  process.env.GOOGLE_OWNER_BRAIN_CLIENT_SECRET = "mock-secret";

  const authUrl = buildGoogleAuthorizeUrl({
    state,
    redirectUri: "https://www.stratxcel.in/api/platform/connectors/google/callback",
    requestedServices: ["google_drive", "google_sheets"],
  });

  assert.ok(authUrl.startsWith("https://accounts.google.com/o/oauth2/v2/auth"), "must use Google auth v2 endpoint");
  assert.ok(authUrl.includes("client_id=756598763212-mockclientid.apps.googleusercontent.com"));
  assert.ok(authUrl.includes("drive.file"), "must include drive.file scope");
  assert.ok(authUrl.includes("spreadsheets"), "must include spreadsheets scope");
  assert.ok(authUrl.includes("access_type=offline"), "must request offline access");
  assert.ok(authUrl.includes("prompt=consent"), "must force consent prompt for refresh token");

  console.log("ALL TESTS PASSED for Google OAuth Connector Service!\n");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
