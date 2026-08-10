// Run with: node --experimental-strip-types lib/rbac/__tests__/client-app-shell.test.ts
//
// Regression guard for the new /app client workspace (branch
// feat/stratxcel-core-product-experience). Asserts against source for the
// same reason every other Server-Component test in this build does:
// requireClientContext()/requireOwnerContext() read next/headers cookies()
// and only resolve inside a real Next.js request scope.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

function run() {
  // --- 1. /app is gated by requireClientContext(), never requireOwnerContext() ---
  const clientContext = read("lib", "tenants", "client-context.ts");
  assert.equal(
    /\.from\(["']stratxcel_admins["']\)/.test(clientContext),
    false,
    "requireClientContext() must never query stratxcel_admins — that's the staff-only table; a client account must never need an admin row"
  );

  const appLayout = read("app", "app", "layout.tsx");
  assert.ok(/requireClientContext/.test(appLayout), "/app's layout must gate on requireClientContext(), not requireOwnerContext()");
  assert.equal(
    /requireOwnerContext\(/.test(appLayout),
    false,
    "/app's layout must never call requireOwnerContext() — that would require staff status to use the client workspace"
  );
  assert.ok(/resolveCurrentTenant\(ctx\.supabase, ctx\.userId\)/.test(appLayout), "/app must resolve tenant membership via the same session-client-based resolveCurrentTenant() /admin already uses");

  // --- 2. No service-role dependency anywhere under app/app/* ---------------
  const appDir = path.join(root, "app", "app");
  const appFiles: string[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // WhatsApp Social handoff under /app/social is an intentional service-role
      // bridge (maps handoff token → session). It is not part of the V1 client
      // shell surface this suite guards — skip that subtree only.
      if (entry.isDirectory() && (entry.name === "__tests__" || entry.name === "social")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) appFiles.push(full);
    }
  })(appDir);
  assert.ok(appFiles.length >= 15, "expected at least 15 files under app/app/ (layout, shell, Command Center, and page stubs)");
  for (const file of appFiles) {
    const source = fs.readFileSync(file, "utf8");
    assert.equal(
      /getTenantServiceContext|createSupabaseServiceClient/.test(source),
      false,
      `${path.relative(root, file)} must have no service-role dependency — /app is 100% authenticated-session reads`
    );
  }

  // --- 3. Command Center independently re-guards, same discipline as /admin's ---
  const commandCenter = read("app", "app", "page.tsx");
  assert.ok(
    /const ctx = await requireClientContext\(\);\s*\n\s*if \(!ctx\.ok\) return null;/.test(commandCenter),
    "the client Command Center must independently re-guard with requireClientContext(), matching the RSC-disclosure discipline used everywhere else in this build"
  );
  assert.ok(/listMissionsForTenant\(ctx\.supabase, active\.tenantId, \d+\)/.test(commandCenter), "must reuse the exact same listMissionsForTenant call /admin's Command Center uses");
  assert.ok(/listPendingApprovals\(ctx\.supabase, active\.tenantId\)/.test(commandCenter), "must reuse the exact same listPendingApprovals call /admin's Command Center uses");
  assert.equal(/Unread inbox|AI actions/.test(commandCenter), false, "Command Center must not show fabricated disconnected metric cards");

  // --- 4. /app and /admin share one shell component, not two ----------------
  const adminShell = read("app", "admin", "(shell)", "AppShell.tsx");
  const clientShell = read("app", "app", "ClientAppShell.tsx");
  assert.ok(/CoreAppShell/.test(adminShell), "/admin's shell must compose the shared components/shell/CoreAppShell.tsx");
  assert.ok(/CoreAppShell/.test(clientShell), "/app's shell must compose the same shared components/shell/CoreAppShell.tsx — not a second bespoke shell");

  // --- 5. Missions/Approvals reuse the exact same tenant-scoped API routes --
  // /admin's missions page lives at (shell)/missions now, renamed from
  // (shell)/platform/missions by ADMIN_INFORMATION_ARCHITECTURE.md §1 — the
  // old path is a redirect() wrapper, covered by unified-shell-tenant-ux.test.ts.
  const clientMissions = read("app", "app", "missions", "page.tsx");
  const adminMissions = read("app", "admin", "(shell)", "missions", "page.tsx");
  assert.ok(clientMissions.includes('fetch(`/api/platform/missions'), "/app/missions must call the same /api/platform/missions route");
  assert.ok(adminMissions.includes('fetch(`/api/platform/missions'), "/admin's missions page must still call the same route (unchanged)");

  // --- 6. CreateClientForm is shared, not duplicated (still true for /admin;
  // /app now has the full structured onboarding wizard, superseding the
  // placeholder that used to just reuse CreateClientForm directly) --------
  assert.ok(exists("components", "forms", "CreateClientForm.tsx"), "CreateClientForm must live in the shared components/forms/ location");
  assert.equal(exists("app", "admin", "(shell)", "CreateClientForm.tsx"), false, "the old app/admin/(shell)/CreateClientForm.tsx location must no longer exist (moved, not duplicated)");
  const appOnboarding = read("app", "app", "OnboardingPanel.tsx");
  const adminOnboarding = read("app", "admin", "(shell)", "OnboardingPanel.tsx");
  assert.ok(appOnboarding.includes('from "./onboarding/OnboardingWizard"'), "/app onboarding must render the structured OnboardingWizard, not the CreateClientForm placeholder");
  assert.ok(adminOnboarding.includes('from "@/components/forms/CreateClientForm"'), "/admin onboarding must still import the shared CreateClientForm (internal admin flow, out of scope for the client wizard)");
  // The wizard's own workspace-creation write still goes through the same
  // tenant-creation guarantees CreateClientForm always used: a
  // service-role-only server route, never a client-side service key.
  const onboardingRoute = read("app", "api", "platform", "onboarding", "route.ts");
  assert.ok(onboardingRoute.includes("createTenant("), "the onboarding API route must reuse the real createTenant() repository function, not a second implementation");
  assert.ok(onboardingRoute.includes("getTenantServiceContext"), "the onboarding API route must use the service-role client for the tenant/brand-brain writes (RLS has no client insert policy for these tables)");

  // --- 7. Design tokens: no raw slate-* in the new shared shell/primitives --
  const primitivesDir = path.join(root, "components");
  const primitiveFiles: string[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) primitiveFiles.push(full);
    }
  })(primitivesDir);
  assert.ok(primitiveFiles.length >= 15, "expected at least 15 component files under components/");
  for (const file of primitiveFiles) {
    const source = fs.readFileSync(file, "utf8");
    assert.equal(
      /\b(bg|text|border)-slate-\d/.test(source),
      false,
      `${path.relative(root, file)} must use --sx-* Core tokens, not raw slate-* Tailwind utilities`
    );
  }

  console.log(
    "client-app-shell.test.ts: ALL PASS (requireClientContext gate, no service-role in /app, RSC guard on Command Center, shared CoreAppShell, shared CreateClientForm, no raw slate-* in Core primitives)"
  );
}

run();
