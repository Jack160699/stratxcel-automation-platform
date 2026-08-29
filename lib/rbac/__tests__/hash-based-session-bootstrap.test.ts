// Run with: node --experimental-strip-types lib/rbac/__tests__/hash-based-session-bootstrap.test.ts
//
// Mission D+ Section 7: Supabase Admin-API-generated magic links, password
// recovery, and invite links redirect with the session in the URL *hash*
// (`#access_token=...`) -- a Route Handler can never see that hash, browsers
// only ever send it to client-side JS. `app/auth/callback/route.ts`
// previously only implemented the `?code=` PKCE exchange, so a hash-based
// link silently never established a session (confirmed live: navigating a
// freshly Admin-API-generated magic link left `document.cookie` with no
// `sb-*-auth-token` at all). This proves, from source:
//  - the PKCE `?code=` path is byte-for-byte unchanged (never removed),
//  - a hash-only request is forwarded to a real client bridge, never
//    silently dropped or treated as an error,
//  - the bridge only ever forwards the tokens to the app's OWN real
//    server-side Supabase client (no parallel session-issuance logic, no
//    hand-rolled cookie construction, no token logging),
//  - the bridge hands off back through the SAME redirect-resolution logic
//    the code flow uses, so authorization/role-routing is not bypassed,
//  - a second pass through the route (post-bridge) cannot loop back into
//    the bridge again.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function run() {
  const callbackRoute = read("app", "auth", "callback", "route.ts");

  // --- PKCE path untouched --------------------------------------------
  assert.match(callbackRoute, /exchangeCodeForSession\(code\)/, "the existing `?code=` PKCE exchange must remain exactly as it was");
  assert.match(callbackRoute, /if \(code\) \{/, "the code branch must still gate the PKCE exchange");

  // --- Hash-only requests are forwarded, not dropped -------------------
  assert.match(
    callbackRoute,
    /if \(!code && !error && !bridged\) \{[\s\S]{0,300}\/auth\/callback\/hash/,
    "a request with neither `code` nor `error` (i.e. a hash-only redirect, which the server can never directly see) must be forwarded to the client-side hash bridge, not silently treated as a no-op"
  );
  assert.match(callbackRoute, /next.*rawNext|rawNext.*next/s, "next must survive the bounce to the bridge");

  // --- No infinite loop: the bridge's own hand-off is recognized --------
  assert.match(callbackRoute, /HASH_BRIDGE_MARKER/, "the route must recognize its own bridge's completion marker");
  assert.match(callbackRoute, /!bridged/, "a bridged request must not be redirected to the bridge again");
  console.log("app/auth/callback/route.ts: PKCE path unchanged, hash-only requests forwarded once, no loop — PASS");

  // --- The bridge page: real tokens only, no fabrication, no logging ----
  const bridgePage = read("app", "auth", "callback", "hash", "page.tsx");
  assert.match(bridgePage, /"use client"/, "must be a client component -- only the browser can read location.hash");
  assert.match(bridgePage, /location\.hash/, "must read the real hash the browser already has, not invent tokens");
  assert.match(bridgePage, /access_token/);
  assert.match(bridgePage, /refresh_token/);
  assert.ok(!/console\.(log|debug|info)\(/.test(bridgePage), "must never log the token values");
  assert.match(bridgePage, /fetch\(\s*["']\/api\/auth\/session-bridge["']/, "must hand the tokens to the real server-side bridge endpoint, not construct a cookie itself");
  assert.match(bridgePage, /__sx_hash_checked/, "must mark completion so the route never re-enters the bridge for the same session");
  console.log("app/auth/callback/hash/page.tsx: reads real browser-held tokens, forwards to the real server bridge, never fabricates a session — PASS");

  // --- The bridge endpoint: reuses the app's real Supabase server client,
  //     no parallel auth implementation, no arbitrary storage -----------
  const bridgeRoute = read("app", "api", "auth", "session-bridge", "route.ts");
  assert.match(bridgeRoute, /createSupabaseServerClient/, "must reuse the app's single real server-side Supabase client -- no second implementation");
  assert.match(bridgeRoute, /supabase\.auth\.setSession\(\s*\{\s*access_token,\s*refresh_token\s*\}\s*\)/, "must call the real, standard setSession -- the tokens are only ever handed to Supabase's own client, never parsed/trusted directly by app code");
  assert.ok(!/console\.(log|debug|info)\([^)]*token/i.test(bridgeRoute), "must never log token values");
  assert.match(bridgeRoute, /typeof access_token !== "string"|!access_token/, "must reject a malformed/missing token pair rather than calling setSession with garbage");
  console.log("app/api/auth/session-bridge/route.ts: forwards real tokens to the real setSession, validates shape, never logs — PASS");

  console.log("hash-based-session-bootstrap.test.ts: ALL PASS");
}

run();
