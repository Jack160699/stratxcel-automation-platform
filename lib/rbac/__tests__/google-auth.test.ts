// Run with: node --experimental-strip-types lib/rbac/__tests__/google-auth.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeRedirectUrl } from "../../auth/redirect.ts";
import { generateRandomNonce, hashNonce } from "../../auth/google-nonce.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

const GOOGLE_AUTH_FILES: string[][] = [
  ["app", "auth", "callback", "route.ts"],
  ["app", "components", "auth", "GoogleOAuthButton.tsx"],
  ["app", "components", "auth", "GoogleOneTap.tsx"],
  ["lib", "auth", "redirect.ts"],
];

async function run() {
  console.log("Starting Google Auth & One Tap test suite...");

  // --- 1. Safe Redirect URL Sanitization tests -------------------------------
  assert.equal(sanitizeRedirectUrl("/app"), "/app");
  assert.equal(sanitizeRedirectUrl("/admin"), "/admin");
  assert.equal(sanitizeRedirectUrl("/settings?foo=bar#section"), "/settings?foo=bar#section");

  // Rejections / Open-redirect attacks
  assert.equal(sanitizeRedirectUrl("https://evil.example"), "/app");
  assert.equal(sanitizeRedirectUrl("http://evil.example"), "/app");
  assert.equal(sanitizeRedirectUrl("//evil.example"), "/app");
  assert.equal(sanitizeRedirectUrl("/\\evil.example"), "/app");
  assert.equal(sanitizeRedirectUrl("javascript:alert(1)"), "/app");
  assert.equal(sanitizeRedirectUrl("data:text/html,hack"), "/app");
  assert.equal(sanitizeRedirectUrl(""), "/app");
  assert.equal(sanitizeRedirectUrl(null), "/app");
  assert.equal(sanitizeRedirectUrl(undefined), "/app");
  assert.equal(sanitizeRedirectUrl("   "), "/app");
  assert.equal(sanitizeRedirectUrl("https://evil.example", "/custom"), "/custom");

  // --- 2. Google One Tap Nonce Generation & Hashing tests --------------------
  const nonce = generateRandomNonce();
  assert.equal(typeof nonce, "string");
  assert.equal(nonce.length, 32); // 16 bytes = 32 hex chars
  assert.ok(/^[0-9a-f]{32}$/.test(nonce), "Nonce must be 32 hex characters");

  const hashed = await hashNonce("test-nonce-123");
  assert.equal(typeof hashed, "string");
  assert.equal(hashed.length, 64); // SHA-256 = 256 bits = 64 hex chars
  assert.equal(
    hashed,
    "7a9c2b4a6171f03ed9f403889969421080fe4cc08f1b774eed9ee58e6a5b572b",
    "SHA-256 hash of 'test-nonce-123' must match exact expected digest"
  );

  // --- 3. Files Existence & Service-Role Isolation ---------------------------
  for (const parts of GOOGLE_AUTH_FILES) {
    assert.ok(exists(...parts), `File ${parts.join("/")} must exist`);
    const source = read(...parts);
    assert.equal(
      /createSupabaseServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(source),
      false,
      `${parts.join("/")} must have no service-role dependency`
    );
  }

  // --- 4. Google OAuth Button inspection -------------------------------------
  const buttonSource = read("app", "components", "auth", "GoogleOAuthButton.tsx");
  assert.ok(/createSupabaseBrowserClient\(\)/.test(buttonSource), "GoogleOAuthButton must use browser client");
  assert.ok(/signInWithOAuth/.test(buttonSource), "GoogleOAuthButton must invoke signInWithOAuth");
  assert.ok(/provider:\s*["']google["']/.test(buttonSource), "GoogleOAuthButton must target google provider");
  assert.ok(/redirectTo/.test(buttonSource), "GoogleOAuthButton must configure redirectTo callback");

  // --- 5. Google One Tap inspection ------------------------------------------
  const oneTapSource = read("app", "components", "auth", "GoogleOneTap.tsx");
  assert.ok(/signInWithIdToken/.test(oneTapSource), "GoogleOneTap must call signInWithIdToken");
  assert.ok(/process\.env\.NEXT_PUBLIC_GOOGLE_CLIENT_ID/.test(oneTapSource), "GoogleOneTap must check NEXT_PUBLIC_GOOGLE_CLIENT_ID");
  assert.ok(/nonce:/.test(oneTapSource), "GoogleOneTap must generate and pass secure nonces");

  // --- 6. Auth Callback Handler inspection -----------------------------------
  const callbackSource = read("app", "auth", "callback", "route.ts");
  assert.ok(/exchangeCodeForSession/.test(callbackSource), "Callback handler must exchange code for session");
  assert.ok(/sanitizeRedirectUrl/.test(callbackSource), "Callback handler must sanitize redirect URLs");
  assert.ok(/resolvePostLoginRedirect/.test(callbackSource), "Callback handler must fall back to resolvePostLoginRedirect");

  // --- 7. Login & Signup Forms integration ----------------------------------
  const loginForm = read("app", "login", "LoginForm.tsx");
  const signupForm = read("app", "signup", "SignupForm.tsx");
  assert.ok(/<GoogleOAuthButton/.test(loginForm), "LoginForm must include GoogleOAuthButton");
  assert.ok(/<GoogleOneTap/.test(loginForm), "LoginForm must include GoogleOneTap");
  assert.ok(/or continue with email/i.test(loginForm), "LoginForm must feature visual divider");

  assert.ok(/<GoogleOAuthButton/.test(signupForm), "SignupForm must include GoogleOAuthButton");
  assert.ok(/<GoogleOneTap/.test(signupForm), "SignupForm must include GoogleOneTap");
  assert.ok(/or continue with email/i.test(signupForm), "SignupForm must feature visual divider");

  console.log("google-auth.test.ts: ALL PASS (safe redirect sanitization, PKCE callback, One Tap SHA-256 nonces, zero service-role isolation, component integration)");
}

run();
