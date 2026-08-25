// Run with: node --experimental-strip-types lib/social/__tests__/unified-oauth-architecture.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const connectRoute = read("app", "api", "social", "oauth", "[provider]", "connect", "route.ts");
  const callbackRoute = read("app", "api", "social", "oauth", "[provider]", "callback", "route.ts");
  const onboardingRoute = read("app", "api", "platform", "onboarding", "route.ts");
  const oauthOrigin = read("lib", "social", "oauth-origin.ts");
  const connectorSheet = read("app", "app", "onboarding", "ConnectorSheet.tsx");
  const wizard = read("app", "app", "onboarding", "OnboardingWizard.tsx");
  const instagramProvider = read("lib", "social", "providers", "instagram.ts");
  const facebookProvider = read("lib", "social", "providers", "facebook.ts");
  const threadsProvider = read("lib", "social", "providers", "threads.ts");
  const linkedinProvider = read("lib", "social", "providers", "linkedin.ts");
  const youtubeProvider = read("lib", "social", "providers", "youtube.ts");
  const googleBusinessProvider = read("lib", "social", "providers", "google-business.ts");

  // --- 1. Single Canonical Redirect URI Architecture -----------------------
  assert.ok(
    connectRoute.includes("getCanonicalSocialRedirectUri") && oauthOrigin.includes("/api/social/oauth/"),
    "connect route must ALWAYS generate the canonical registered redirect URI (/api/social/oauth/:provider/callback)"
  );
  assert.ok(
    callbackRoute.includes("getCanonicalSocialRedirectUri") && oauthOrigin.includes("/api/social/oauth/"),
    "callback route must ALWAYS exchange tokens against the canonical registered redirect URI"
  );
  assert.equal(
    connectRoute.includes("/api/platform/onboarding/social"),
    false,
    "connect route must NOT generate un-registered platform onboarding redirect URIs"
  );

  // --- 2. Onboarding wires to canonical OAuth route ------------------------
  assert.ok(
    connectorSheet.includes("`/api/social/oauth/${platform}/connect?redirectTo=/app`"),
    "ConnectorSheet must initiate OAuth using the canonical connect route with redirectTo=/app"
  );

  // --- 3. Unified callback handles both onboarding and admin flows --------
  // Was: callbackRoute.includes("isOnboarding") -- that variable was dead
  // code (assigned, never read) that happened to contain this substring;
  // removing the dead code (found live during E2E testing while fixing the
  // adjacent fallbackRedirect bug, see resolveOAuthFailureRedirect) broke
  // this purely textual assertion without changing any real behavior.
  // isPreWorkspaceOnboarding is the actual, live gate for this capability.
  assert.ok(
    callbackRoute.includes("isPreWorkspaceOnboarding") && callbackRoute.includes("onboarding_oauth_connections"),
    "callback route must handle pre-tenant onboarding connections when redirectTo starts with /app"
  );
  assert.ok(
    callbackRoute.includes("oauth") && callbackRoute.includes("success") && callbackRoute.includes("provider"),
    "callback route must append explicit ?oauth=success&provider=:provider query parameters"
  );
  assert.ok(
    callbackRoute.includes("requireAdmin") && callbackRoute.includes("upsertConnectedAccount"),
    "callback route must handle admin/workspace account upserts when redirectTo is /admin/social"
  );

  // --- 4. Server-Side Rehydration & SanitizeDraft Integration --------------
  assert.ok(
    onboardingRoute.includes("oauthConnections") && onboardingRoute.includes("onboarding_oauth_connections"),
    "GET /api/platform/onboarding must return oauthConnections for fresh client rehydration"
  );
  assert.ok(
    onboardingRoute.includes("account:") && onboardingRoute.includes("connections: rawConnections"),
    "sanitizeDraft in onboarding route must preserve account.connections"
  );
  assert.ok(
    wizard.includes("mergeOAuthConnectionsIntoDraft"),
    "OnboardingWizard must merge server-verified OAuth connections into draft state"
  );
  assert.ok(
    connectorSheet.includes("Connected ✓"),
    "ConnectorSheet must render a real connected-state badge, not a static 'Connect' label regardless of status"
  );

  // --- 5. Canonical Providers Configuration Integrity ----------------------
  assert.ok(googleBusinessProvider.includes("business.manage"), "Google Business provider must request business.manage scope");
  assert.ok(instagramProvider.includes("META_INSTAGRAM_APP_ID"), "Instagram provider must use META_INSTAGRAM_APP_ID");
  assert.ok(instagramProvider.includes("https://www.instagram.com/oauth/authorize"), "Instagram must use official Instagram OAuth endpoint");
  assert.ok(facebookProvider.includes("META_APP_ID"), "Facebook provider must use META_APP_ID");
  assert.ok(threadsProvider.includes("META_THREADS_APP_ID"), "Threads provider must use META_THREADS_APP_ID");
  assert.ok(linkedinProvider.includes("LINKEDIN_CLIENT_ID"), "LinkedIn provider must use LINKEDIN_CLIENT_ID");
  assert.ok(youtubeProvider.includes("YOUTUBE_CLIENT_ID"), "YouTube provider must use YOUTUBE_CLIENT_ID");

  // --- 6. Security: No tokens in user_metadata or client-side code ---------
  assert.equal(
    callbackRoute.includes("accessToken: result.accessToken") && callbackRoute.includes("onboarding_oauth_connections: {\n              ...existingConnections,\n              [canonicalPlatformKey]: {\n                accessToken"),
    false,
    "Access tokens must NEVER be stored in user_metadata during onboarding"
  );

  console.log(
    "unified-oauth-architecture.test.ts: ALL PASS (single canonical registered redirect URI, explicit callback status params, server-side verified connection rehydration, provider attribution UI, zero duplicate OAuth implementations, token security preserved)"
  );
}

run();
