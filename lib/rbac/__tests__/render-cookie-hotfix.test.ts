// Regression guard: Server Component render must never mutate cookies.
// Next.js throws "Cookies can only be modified in a Server Action or Route Handler"
// when workspace-intent helpers write cookies during page/layout render.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

const COOKIE_MUTATION_HELPERS = [
  "setPendingWorkspaceMode",
  "setWorkspaceModeCookie",
  "commitWorkspaceIntent",
  "establishPendingWorkspaceIntent",
  "ensureCustomerWorkspaceForAppEntry",
  "ensureAdminWorkspaceForAdminEntry",
  "finalizeAuthWorkspaceIntent",
];

function assertNoRenderTimeCookieMutations(filePath: string, source: string) {
  for (const helper of COOKIE_MUTATION_HELPERS) {
    assert.equal(
      source.includes(helper),
      false,
      `${filePath} must not call ${helper} during Server Component render`
    );
  }
}

function run() {
  const loginPage = read("app", "login", "page.tsx");
  const signupPage = read("app", "signup", "page.tsx");
  const adminLayout = read("app", "admin", "(shell)", "layout.tsx");
  const appLayout = read("app", "app", "layout.tsx");
  const resolver = read("lib", "identity", "resolve-identity.ts");

  assertNoRenderTimeCookieMutations("app/login/page.tsx", loginPage);
  assertNoRenderTimeCookieMutations("app/signup/page.tsx", signupPage);
  assertNoRenderTimeCookieMutations("app/admin/(shell)/layout.tsx", adminLayout);
  assertNoRenderTimeCookieMutations("app/app/layout.tsx", appLayout);

  assert.ok(
    /resolveCanonicalIdentity\(\s*\{\s*routeSurface:\s*"admin"\s*\}\s*\)/.test(adminLayout),
    "admin layout must resolve identity with read-only admin route surface"
  );
  assert.ok(
    /resolveCanonicalIdentity\(\s*\{\s*routeSurface:\s*"app"\s*\}\s*\)/.test(appLayout),
    "app layout must resolve identity with read-only app route surface"
  );
  assert.ok(
    /routeSurface/.test(resolver) && /workspaceModeForRoute/.test(resolver),
    "canonical identity resolver must support read-only route surface hints"
  );

  console.log("render-cookie-hotfix.test.ts: ALL PASS (no render-time cookie mutations in auth surfaces)");
}

run();
