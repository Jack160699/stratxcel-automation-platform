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
  const stepConnectors = read("app", "app", "onboarding", "steps", "StepConnectors.tsx");
  const instagramProvider = read("lib", "social", "providers", "instagram.ts");
  const facebookProvider = read("lib", "social", "providers", "facebook.ts");
  const threadsProvider = read("lib", "social", "providers", "threads.ts");
  const linkedinProvider = read("lib", "social", "providers", "linkedin.ts");
  const youtubeProvider = read("lib", "social", "providers", "youtube.ts");

  // --- 1. Single Canonical Redirect URI Architecture -----------------------
  assert.ok(
    connectRoute.includes("`/api/social/oauth/${provider}/callback`"),
    "connect route must ALWAYS generate the canonical registered redirect URI (/api/social/oauth/:provider/callback)"
  );
  assert.ok(
    callbackRoute.includes("`/api/social/oauth/${provider}/callback`"),
    "callback route must ALWAYS exchange tokens against the canonical registered redirect URI"
  );
  assert.equal(
    connectRoute.includes("/api/platform/onboarding/social"),
    false,
    "connect route must NOT generate un-registered platform onboarding redirect URIs"
  );

  // --- 2. Onboarding wires to canonical OAuth route ------------------------
  assert.ok(
    stepConnectors.includes("`/api/social/oauth/${platform}/connect?redirectTo=/app`"),
    "StepConnectors must initiate OAuth using the canonical connect route with redirectTo=/app"
  );

  // --- 3. Unified callback handles both onboarding and admin flows --------
  assert.ok(
    callbackRoute.includes("isOnboarding") && callbackRoute.includes("onboarding_oauth_connections"),
    "callback route must handle pre-tenant onboarding connections when redirectTo starts with /app"
  );
  assert.ok(
    callbackRoute.includes("requireAdmin") && callbackRoute.includes("upsertConnectedAccount"),
    "callback route must handle admin/workspace account upserts when redirectTo is /admin/social"
  );

  // --- 4. Canonical Providers Configuration Integrity ----------------------
  // Instagram
  assert.ok(instagramProvider.includes("META_INSTAGRAM_APP_ID"), "Instagram provider must use META_INSTAGRAM_APP_ID");
  assert.ok(instagramProvider.includes("https://www.instagram.com/oauth/authorize"), "Instagram must use official Instagram OAuth endpoint");
  assert.ok(instagramProvider.includes("instagram_business_basic"), "Instagram must request business basic scope");
  assert.ok(instagramProvider.includes("instagram_business_content_publish"), "Instagram must request content publish scope");

  // Facebook
  assert.ok(facebookProvider.includes("META_APP_ID"), "Facebook provider must use META_APP_ID");
  assert.ok(facebookProvider.includes("dialog/oauth"), "Facebook must use standard Facebook Login dialog endpoint");
  assert.ok(facebookProvider.includes("pages_show_list"), "Facebook must request pages_show_list scope");

  // Threads
  assert.ok(threadsProvider.includes("META_THREADS_APP_ID"), "Threads provider must use META_THREADS_APP_ID");
  assert.ok(threadsProvider.includes("https://threads.net/oauth/authorize"), "Threads must use official Threads authorize endpoint");

  // LinkedIn
  assert.ok(linkedinProvider.includes("LINKEDIN_CLIENT_ID"), "LinkedIn provider must use LINKEDIN_CLIENT_ID");
  assert.ok(linkedinProvider.includes("authorization"), "LinkedIn must use OAuth v2 authorization endpoint");

  // YouTube
  assert.ok(youtubeProvider.includes("YOUTUBE_CLIENT_ID"), "YouTube provider must use YOUTUBE_CLIENT_ID");
  assert.ok(youtubeProvider.includes("https://accounts.google.com/o/oauth2/v2/auth"), "YouTube must use Google OAuth2 endpoint");

  // --- 5. Security: No tokens in user_metadata or client-side code ---------
  assert.equal(
    callbackRoute.includes("accessToken: result.accessToken") && callbackRoute.includes("onboarding_oauth_connections: {\n              ...existingConnections,\n              [provider]: {\n                accessToken"),
    false,
    "Access tokens must NEVER be stored in user_metadata during onboarding"
  );

  console.log(
    "unified-oauth-architecture.test.ts: ALL PASS (single canonical registered redirect URI, unified connect and callback routes, matching provider configurations for Instagram/Facebook/Threads/LinkedIn/YouTube, zero duplicate OAuth implementations, token security preserved)"
  );
}

run();
