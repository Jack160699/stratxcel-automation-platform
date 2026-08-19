// Run with: node --experimental-strip-types app/api/platform/search/google/__tests__/api-security.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
/** Source with comments stripped, so prose *describing* a rule (e.g. "never reuse Drive's client") never itself satisfies a check for the literal it's explaining. */
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const connect = read("app", "api", "platform", "search", "google", "connect", "route.ts");
const callback = read("app", "api", "platform", "search", "google", "callback", "route.ts");
const resources = read("app", "api", "platform", "search", "google", "resources", "route.ts");
const config = read("app", "api", "platform", "search", "google", "config", "route.ts");
const disconnect = read("app", "api", "platform", "search", "google", "disconnect", "route.ts");
const oauth = read("packages", "search-discovery", "src", "google", "oauth.ts");

// --- every route re-derives tenant membership from the authenticated session, never trusts a client-supplied tenantId alone ---
for (const [name, source] of [["connect", connect], ["callback", callback], ["resources", resources], ["config", config], ["disconnect", disconnect]] as const) {
  assert.match(source, /requireTenantContext/, `${name} route must authenticate tenant membership`);
}

// --- connect/callback/config/disconnect all require the same, existing RBAC integration-management permission (never invented) ---
for (const [name, source] of [["connect", connect], ["callback", callback], ["config", config], ["disconnect", disconnect]] as const) {
  assert.match(source, /requirePermission\(ctx\.role, "integration:configure"\)/, `${name} route must gate on integration:configure`);
}
assert.match(resources, /requirePermission\(ctx\.role, "integration:configure"\)/, "resources route must gate on integration:configure — it can reveal a customer's Google property list");

// --- callback: signed state verification, tenant-bound, and a hardcoded same-origin return path (never an open redirect) ---
assert.match(callback, /verifyOAuthState/);
assert.match(callback, /requireTenantContext\(verified\.tenantId\)/, "callback must re-verify the CURRENT session against the state's tenantId, not just trust the state");
assert.match(callback, /ctx\.userId !== verified\.userId/, "callback must bind the CURRENT session user to the user who initiated the signed state");
assert.match(callback, /const RETURN_PATH = "\/app\/search"/, "the post-OAuth redirect target must be a hardcoded relative path");
assert.match(connect, /CANONICAL_ORIGIN/, "the authorization redirect_uri must use the configured canonical production origin");
assert.match(callback, /CANONICAL_ORIGIN/, "the callback redirect and token exchange redirect_uri must use the canonical production origin");
assert.equal(/new URL\(RETURN_PATH,\s*(origin|request\.url|url\.origin)\)/.test(callback), false, "post-OAuth redirects must not trust a request-derived origin");
assert.equal(/new URL\("\/api\/platform\/search\/google\/callback",\s*(request\.url|origin|url\.origin)\)/.test(`${connect}\n${callback}`), false, "OAuth redirect_uri must not trust a request-derived origin");
assert.equal(/searchParams\.get\(["'`](redirectTo|return_to|next|url)["'`]\)/.test(callback), false, "callback must never read a redirect target from request input — that is an open-redirect vector");
assert.match(callback, /if \(oauthError\) return safeRedirect/, "an explicit Google-reported error must be handled, not swallowed");
assert.match(callback, /if \(!code\) return safeRedirect/, "a missing authorization code must be handled explicitly");

// --- callback: refresh-token preservation — an absent refresh_token on re-consent must not destroy an existing valid one ---
assert.match(callback, /No new refresh token this time/i);
assert.match(callback, /refreshTokenRef = undefined/, "when Google omits refresh_token and a prior one exists, the stored ref must be left untouched, not nulled");

// --- no route ever returns the vault reference, a decrypted token, or Google client credentials to the browser ---
for (const [name, source] of [["connect", connect], ["callback", callback], ["resources", resources], ["config", config], ["disconnect", disconnect]] as const) {
  assert.equal(/Response\.json\(\s*\{[^}]*encrypted_refresh_token_ref/.test(source), false, `${name} route must never place encrypted_refresh_token_ref inside a Response.json body`);
  // The client secret is only ever read inside packages/search-discovery/src/google/oauth.ts
  // (getClientCredentials) — no route handler should reference the raw env var name directly.
  assert.equal(/GOOGLE_SEARCH_OAUTH_CLIENT_SECRET/.test(source), false, `${name} route must not reference the client secret env var directly — it stays encapsulated in the oauth module`);
}
// resources/config must expose only status + selected-property fields, never a token/secret-shaped field.
for (const [name, source] of [["resources", resources], ["config", config]] as const) {
  assert.equal(/accessToken/.test(source) === true, true, `${name} route resolves an access token server-side`);
  assert.equal(new RegExp(`Response\\.json\\([^)]*accessToken`).test(source), false, `${name} route must never put the resolved access token in a response body`);
}
assert.equal(/lastError:\s*connection\?\.last_error/.test(resources), false, "raw provider errors must not be returned to the browser");
assert.match(resources, /SEARCH_GOOGLE_CONNECTION_ERROR/, "resources should return only a stable, non-sensitive connection error code");

// --- disconnect: local credential removal + best-effort Google-side revocation ---
assert.match(disconnect, /disconnectGoogleConnection/);
assert.match(disconnect, /vault\.revoke/, "disconnect must delete the vaulted ciphertext, not just unlink it");
assert.match(disconnect, /revokeToken/, "disconnect must attempt Google-side revocation");
assert.match(disconnect, /\.catch\(\(\) => \(\{ revoked: false \}\)\)|\.catch\(\(\) => undefined\)/, "revocation must be best-effort and never block local disconnect on failure");

// --- audit events are recorded for connect/config/disconnect, and the shared audit module redacts secret-shaped metadata keys ---
for (const [name, source] of [["callback", callback], ["config", config], ["disconnect", disconnect]] as const) {
  assert.match(source, /recordAuditEvent/, `${name} route must audit its outcome`);
}
const auditLog = read("packages", "audit", "src", "log.ts");
assert.match(auditLog, /token|secret|password|key|credential|authorization/i, "the shared audit module's redaction pattern must still exist");

// --- OAuth module: minimum read-only scopes, offline access, dedicated (non-Drive, non-login) client credentials ---
const oauthCode = stripComments(oauth);
assert.match(oauthCode, /webmasters\.readonly/);
assert.match(oauthCode, /analytics\.readonly/);
assert.equal(/googleapis\.com\/auth\/(?!.*readonly)[a-z.]+["'`]/.test(oauthCode), false, "every scope string in the oauth module's actual code must be read-only");
assert.match(oauthCode, /GOOGLE_SEARCH_OAUTH_CLIENT_ID/);
assert.equal(/GOOGLE_DRIVE_CLIENT_ID|NEXT_PUBLIC_GOOGLE_CLIENT_ID/.test(oauthCode), false, "the actual code (not doc comments explaining the design choice) must never read Drive's or the login client's env vars");
assert.match(oauthCode, /access_type: "offline"/);
assert.match(oauthCode, /prompt: "consent"/);
assert.equal(/response\.text\(\)/.test(oauthCode), false, "OAuth token response bodies must never be copied into thrown errors");

// --- config route must never conjure a fake "connected" search_google_connections
// row into existence when one is missing — that produced a permanently false
// CONNECTED state (no token, no granted scopes) for any tenant whose OAuth
// callback never actually completed. It may only select a property on a
// connection that a real OAuth callback already created. (Scoped to the
// tenant-scoped branch specifically — the pre-tenant-onboarding branch above
// it legitimately stages status in the user's own metadata, never the
// search_google_connections table, and is out of scope here.)
const configCode = stripComments(config);
const tenantScopedConfig = configCode.slice(configCode.indexOf("getTenantServiceContext()"));
assert.equal(
  /\.from\(["'`]search_google_connections["'`]\)[\s\S]{0,400}status:\s*["'`]connected["'`]/.test(tenantScopedConfig),
  false,
  "config route must never insert/upsert status:\"connected\" into search_google_connections — only the real OAuth callback may mark a connection connected",
);
assert.match(configCode, /SEARCH_GOOGLE_NOT_CONNECTED/, "config route must fail closed with SEARCH_GOOGLE_NOT_CONNECTED when no real connection exists");

console.log("api-security.test.ts (search/google): ALL PASS (tenant auth, RBAC, state/open-redirect safety, refresh-token preservation, no secret leakage, revocation, audit, scopes, no fake-connected config writes)");
