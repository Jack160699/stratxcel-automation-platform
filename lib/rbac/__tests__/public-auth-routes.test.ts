// Run with: node --experimental-strip-types lib/rbac/__tests__/public-auth-routes.test.ts
//
// Regression guard for the public authentication routes added on branch
// feat/stratxcel-core-product-experience: /login, /signup,
// /forgot-password, /reset-password. Asserts against source rather than
// rendering, for the same reason every other Server/Client-Component test
// in this build does — these either read next/headers cookies() (only
// resolves inside a real Next.js request scope) or are "use client"
// components driven by browser APIs (useSearchParams, window.location).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

const NO_SERVICE_ROLE_FILES: string[][] = [
  ["app", "login", "page.tsx"],
  ["app", "login", "LoginForm.tsx"],
  ["app", "signup", "page.tsx"],
  ["app", "signup", "SignupForm.tsx"],
  ["app", "forgot-password", "page.tsx"],
  ["app", "forgot-password", "ForgotPasswordForm.tsx"],
  ["app", "reset-password", "page.tsx"],
  ["app", "reset-password", "ResetPasswordForm.tsx"],
  ["app", "actions", "auth.ts"],
  ["app", "auth", "callback", "route.ts"],
  ["app", "components", "auth", "GoogleOAuthButton.tsx"],
  ["app", "components", "auth", "GoogleOneTap.tsx"],
];

function run() {
  // --- 1. All four public auth routes exist ---------------------------------
  assert.ok(exists("app", "login", "page.tsx"), "app/login/page.tsx must exist");
  assert.ok(exists("app", "signup", "page.tsx"), "app/signup/page.tsx must exist");
  assert.ok(exists("app", "forgot-password", "page.tsx"), "app/forgot-password/page.tsx must exist");
  assert.ok(exists("app", "reset-password", "page.tsx"), "app/reset-password/page.tsx must exist");

  // --- 2. None of the new public auth code has any service-role dependency,
  // and none constructs a second auth architecture (all route through the
  // existing browser Supabase client) -----------------------------------------
  for (const parts of NO_SERVICE_ROLE_FILES) {
    const source = read(...parts);
    assert.equal(
      /createSupabaseServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(source),
      false,
      `${parts.join("/")} must have no service-role dependency`
    );
  }
  const loginForm = read("app", "login", "LoginForm.tsx");
  const signupForm = read("app", "signup", "SignupForm.tsx");
  const forgotForm = read("app", "forgot-password", "ForgotPasswordForm.tsx");
  const resetForm = read("app", "reset-password", "ResetPasswordForm.tsx");
  for (const [name, source] of [
    ["LoginForm", loginForm],
    ["SignupForm", signupForm],
    ["ForgotPasswordForm", forgotForm],
    ["ResetPasswordForm", resetForm],
  ] as const) {
    assert.ok(
      /from ["']@\/lib\/supabase\/client["']/.test(source),
      `${name} must use the existing createSupabaseBrowserClient() from lib/supabase/client, not a second auth client`
    );
  }

  // --- 3. Login: signInWithPassword, then routes via the shared
  // post-login redirect resolver ----------------------------------------------
  assert.ok(/supabase\.auth\.signInWithPassword\(/.test(loginForm), "LoginForm must call supabase.auth.signInWithPassword()");
  assert.ok(
    /resolvePostLoginRedirect\(\)/.test(loginForm),
    "LoginForm must route through resolvePostLoginRedirect() after a successful sign-in"
  );

  // --- 4. Signup: real supabase.auth.signUp(), never a direct auth.users
  // insert or service-role write; password-confirmation validated; terms
  // required; name stored only via Supabase Auth user metadata ----------------
  assert.ok(/supabase\.auth\.signUp\(/.test(signupForm), "SignupForm must call supabase.auth.signUp()");
  assert.equal(/\.from\(["']auth\.users["']\)|\.from\(["']users["']\)/.test(signupForm), false, "SignupForm must never insert directly into an auth/users table");
  assert.ok(
    /password\s*!==\s*confirm/.test(signupForm),
    "SignupForm must validate that password and confirm-password match before calling signUp()"
  );
  assert.ok(/name="terms"/.test(signupForm) && /required/.test(signupForm), "SignupForm must require terms acknowledgement");
  assert.ok(
    /acceptedTerms/.test(signupForm) && /!acceptedTerms/.test(signupForm),
    "SignupForm must block submission when terms are not accepted"
  );
  assert.ok(
    /data:\s*\{\s*full_name:\s*name\s*\}/.test(signupForm),
    "SignupForm must store the name only via Supabase Auth user metadata (options.data), not a new profile table"
  );
  assert.ok(
    /data\.session/.test(signupForm) && /setStage\(["']verify["']\)/.test(signupForm),
    "SignupForm must handle both outcomes: an immediate session (no email confirmation required) and the verify-email screen"
  );
  const signupPage = read("app", "signup", "page.tsx");
  assert.equal(/AI-powered business growth operating system|AI Copilot content/.test(signupPage), false, "signup must describe the closed-beta Audit workspace, not unverified autonomous capabilities");
  assert.ok(/Business Growth Audit/.test(signupPage), "signup must explain the canonical closed-beta starting point");

  // --- 5. Forgot-password: real recovery method, correct redirect target,
  // and a generic response that never reveals whether the account exists ------
  assert.ok(
    /supabase\.auth\.resetPasswordForEmail\(/.test(forgotForm),
    "ForgotPasswordForm must call supabase.auth.resetPasswordForEmail()"
  );
  assert.ok(
    /redirectTo:\s*`\$\{window\.location\.origin\}\/reset-password`/.test(forgotForm),
    "ForgotPasswordForm must redirect the recovery link to /reset-password"
  );
  assert.ok(
    /If an account exists for that email/.test(forgotForm),
    "ForgotPasswordForm must show a generic success message that does not confirm account existence"
  );
  assert.equal(
    /email doesn't exist|no account found|account not found/i.test(forgotForm),
    false,
    "ForgotPasswordForm must never surface an account-enumeration-revealing message"
  );

  // --- 6. Reset-password: detects/validates the recovery session, handles
  // missing/expired/invalid state, updates via the authenticated recovery
  // session, and never logs the token -----------------------------------------
  assert.ok(
    /supabase\.auth\.exchangeCodeForSession\(code\)/.test(resetForm),
    "ResetPasswordForm must exchange the one-time recovery code for a session"
  );
  assert.ok(/["']invalid["']/.test(resetForm), "ResetPasswordForm must have an explicit invalid/expired stage");
  assert.ok(
    /This reset link is invalid or has expired/.test(resetForm),
    "ResetPasswordForm must show a clear message for missing/expired/invalid recovery state"
  );
  assert.ok(/supabase\.auth\.updateUser\(\{\s*password\s*\}\)/.test(resetForm), "ResetPasswordForm must update the password via the authenticated recovery session's updateUser()");
  assert.ok(/["']success["']/.test(resetForm), "ResetPasswordForm must have a clear success stage");
  assert.equal(/console\.(log|error|warn)\([^)]*code\b/.test(resetForm), false, "ResetPasswordForm must never log the recovery code/token");
  assert.equal(/console\.(log|error|warn)\([^)]*password\b/.test(resetForm), false, "ResetPasswordForm must never log the password");

  // --- 7. Post-login role routing: owner/admin -> /admin; everyone else,
  // including zero-membership accounts, -> /app (whose own layout already
  // resolves tenant membership and shows onboarding). Tenant membership must
  // never grant internal admin access — this resolver only ever checks
  // requireOwnerContext(), never tenant_members/resolveCurrentTenant. ---------
  const authAction = read("app", "actions", "auth.ts");
  assert.ok(/requireOwnerContext\(\)/.test(authAction), "resolvePostLoginRedirect must check requireOwnerContext()");
  assert.ok(
    /return ctx\.ok \? ["']\/admin["'] : ["']\/app["']/.test(authAction),
    "resolvePostLoginRedirect must return /admin only for a verified owner context, /app otherwise"
  );
  assert.equal(
    /tenant_members|resolveCurrentTenant|requireTenantContext/.test(authAction),
    false,
    "resolvePostLoginRedirect must never consult tenant membership — tenant membership must never grant /admin access"
  );

  // --- 8. Public Header CTA destinations: real /login and /signup routes,
  // in both the desktop nav and the mobile drawer -----------------------------
  const publicHeader = read("app", "components", "PublicHeader.tsx");
  const signInMatches = publicHeader.match(/href="\/login"/g) ?? [];
  const startMatches = publicHeader.match(/href="\/signup"/g) ?? [];
  assert.ok(signInMatches.length >= 2, "PublicHeader's \"Sign in\" link must point at /login in both desktop and mobile nav");
  assert.ok(startMatches.length >= 2, "PublicHeader's \"Start with Stratxcel\" link must point at /signup in both desktop and mobile nav");
  assert.equal(/href="\/app"/.test(publicHeader), false, "PublicHeader must no longer link \"Sign in\" at /app now that /login exists");

  // --- 9. Homepage CTA destinations: the certified paid Audit is the hero,
  // while "Book a demo" stays on the sales/demo contact path ------------------
  const homepage = read("app", "page.tsx");
  const homepageAuditMatches = homepage.match(/href="\/audit"/g) ?? [];
  assert.ok(homepageAuditMatches.length >= 2, "Homepage's hero and final CTAs must point at the canonical paid Audit entry");
  assert.ok(
    /href="\/contact\?intent=demo"/.test(homepage),
    "Homepage's \"Book a demo\" CTA must stay on /contact?intent=demo — sales/demo intent must not route to signup"
  );

  console.log(
    "public-auth-routes.test.ts: ALL PASS (4 auth routes exist, no service-role dependency, signup uses Supabase Auth with metadata-only name storage + terms gate, forgot-password gives a generic non-enumerating response, reset-password validates recovery state and never logs secrets, post-login routing checks owner status only, Header and Audit-first homepage CTAs point at the real routes)"
  );
}

run();
