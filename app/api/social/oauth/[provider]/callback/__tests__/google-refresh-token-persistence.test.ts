// Regression test for a P1 finding from live E2E testing on 2026-08-23:
// the "Connected Accounts" page's Search Console & GA4 card permanently
// showed "NOT CONNECTED" for a tenant that had genuinely completed Google
// OAuth -- despite search_google_connections.status = "connected" in the
// DB, and despite the canonical connector status (used everywhere else on
// the same page, and in the sidebar's "Live on Google" badge) correctly
// reporting CONNECTED.
//
// Root cause: this callback route's search_google_connections upsert set
// status: "connected" but never persisted the refresh token or granted
// scopes it already had in `result` -- used two lines above for the
// social_accounts upsert, then silently dropped for this table. Without a
// stored refresh token, /api/platform/search/google/resources can never
// mint a live access token, so it correctly (from its own narrow view)
// downgrades the customer-visible status to "disconnected" -- permanently,
// for every real customer, regardless of how many times they reconnect.
//
// Static source-inspection test (this route has many live external
// dependencies -- signed state verification, real provider token exchange,
// Supabase clients -- that make a full handler invocation impractical to
// mock here), matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types "app/api/social/oauth/[provider]/callback/__tests__/google-refresh-token-persistence.test.ts"
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const routeSource = stripComments(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "route.ts"),
    "utf8"
  )
);

function run() {
  assert.match(
    routeSource,
    /import\s*\{\s*createDevEncryptedVault\s*\}\s*from\s*["']@stratxcel\/byok["']/,
    "route must import the vault used to encrypt the Google refresh token"
  );

  const googleBlock = routeSource.split('provider === "google" || provider === "google_business"')[1]?.split(/\n\s*\}\n\s*\} catch/)[0] ?? "";
  assert.ok(googleBlock.length > 0, "could not locate the Google connection upsert block");

  assert.match(
    googleBlock,
    /vault\.store\(result\.refreshToken\)/,
    "the refresh token returned by the provider exchange must actually be encrypted and stored, not dropped"
  );
  assert.match(
    googleBlock,
    /encrypted_refresh_token_ref\s*=/,
    "the upsert payload must set encrypted_refresh_token_ref -- without it, search/google/resources can never mint a live access token"
  );
  assert.match(
    googleBlock,
    /granted_scopes:\s*result\.scopes/,
    "the upsert payload must persist the scopes actually granted by the customer"
  );
  assert.match(
    googleBlock,
    /if\s*\(result\.refreshToken\)/,
    "must only overwrite the stored token when Google issued a new one this round -- Google omits it on repeat consents, and a previously-stored valid token must not be nulled out"
  );

  console.log("PASS: Google OAuth callback persists the refresh token and granted scopes it already has, instead of dropping them");
}

run();
