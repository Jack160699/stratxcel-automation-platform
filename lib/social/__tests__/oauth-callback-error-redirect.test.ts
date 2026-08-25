import assert from "node:assert/strict";
import { resolveOAuthFailureRedirect } from "../oauth-state.ts";

console.log("Running StratXcel OAuth Callback Error Redirect Tests...\n");

// TEST 1: A real customer-facing reconnect page (e.g. /app/integrations)
// must get the customer back to THAT page on failure, not the dashboard
// home -- found live during E2E testing: a customer who clicked "Reconnect
// account" on /app/integrations, completed Google's consent screen, and hit
// a genuine backend failure (expired state, token exchange error,
// persistence error) was silently bounced to /app instead, which never
// reads the oauth/connect_error query params -- indistinguishable from the
// click never having happened, and the connector stayed disconnected with
// no visible reason.
{
  console.log("Test 1: Preserves a real /app/integrations redirectTo on failure...");
  const result = resolveOAuthFailureRedirect("/app/integrations", "/admin/social");
  assert.equal(result, "/app/integrations", "Must redirect back to the exact page the customer reconnected from");
  console.log("✓ /app/integrations redirectTo preserved.");
}

// TEST 2: Pre-workspace onboarding's plain "/app" redirectTo still works
// (this is the one case where "/app" really is the origin page).
{
  console.log("Test 2: Preserves a plain /app redirectTo (onboarding)...");
  const result = resolveOAuthFailureRedirect("/app", "/admin/social");
  assert.equal(result, "/app");
  console.log("✓ /app redirectTo preserved.");
}

// TEST 3: A non-/app redirectTo (or none at all) falls back to the admin
// default, never silently rewritten to a customer page it didn't come from.
{
  console.log("Test 3: Falls back to the admin default outside the /app surface...");
  assert.equal(resolveOAuthFailureRedirect(undefined, "/admin/social"), "/admin/social");
  assert.equal(resolveOAuthFailureRedirect("/admin/social", "/admin/social"), "/admin/social");
  console.log("✓ Non-/app redirectTo falls back correctly.");
}

console.log("\n=======================================================");
console.log("ALL OAUTH CALLBACK ERROR REDIRECT TESTS PASSED!");
console.log("=======================================================\n");
