// Run with: node --experimental-strip-types lib/rbac/__tests__/unified-shell-tenant-ux.test.ts
//
// Regression guard for the Phase 1 unified Command Center / client-switcher
// work. Every Server Component here (layout, Command Center, inbox,
// platform pages) reads next/headers cookies() through requireOwnerContext,
// which only resolves inside a real Next.js request scope — as with the
// existing platform-admin-layout-gate test, this asserts against source
// rather than rendering, and is intentionally strict enough to fail if any
// of these guards or behaviors regress.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

function run() {
  // --- 1. Tenant selection rejects tenants outside membership -----------
  const currentTenant = read("lib", "tenants", "current-tenant.ts");
  assert.ok(
    /export async function isMemberOfTenant/.test(currentTenant),
    "current-tenant.ts must export a real membership-check function"
  );
  assert.ok(
    /listMyTenants\(userId, tenantId\)|memberships\.some\(\(m\) => m\.tenantId === tenantId\)/.test(currentTenant),
    "isMemberOfTenant must actually check the real membership list, not just accept any ID"
  );

  const tenantActions = read("app", "admin", "(shell)", "tenant-actions.ts");
  const setActionIndex = tenantActions.indexOf("export async function setActiveTenantAction");
  assert.ok(setActionIndex !== -1, "setActiveTenantAction must exist");
  const requireOwnerIndex = tenantActions.indexOf("await requireOwnerContext()");
  const isMemberIndex = tenantActions.indexOf("await isMemberOfTenant(");
  const cookieSetIndex = tenantActions.indexOf("cookieStore.set(");
  assert.ok(
    requireOwnerIndex !== -1 && isMemberIndex !== -1 && cookieSetIndex !== -1,
    "setActiveTenantAction must re-authenticate and re-verify membership before setting the cookie"
  );
  assert.ok(
    setActionIndex < requireOwnerIndex && requireOwnerIndex < isMemberIndex && isMemberIndex < cookieSetIndex,
    "auth check, then membership check, must both run before the cookie is ever written"
  );
  assert.ok(
    /if \(!isMember\) return \{ ok: false/.test(tenantActions),
    "a failed membership check must abort before the cookie write, not just log/continue"
  );

  // --- 2. A stale tenant cookie/selection is ignored safely --------------
  assert.ok(
    /const matched = selectedId \? tenants\.find/.test(currentTenant),
    "resolveCurrentTenant must look up the cookie's tenant against the real membership list"
  );
  assert.ok(
    /return \{ tenants, active: matched \?\? tenants\[0\] \}/.test(currentTenant),
    "an unmatched (stale/forged/removed) cookie value must fall back to the first real membership, never be trusted directly"
  );

  // --- 3. The unified shell renders nothing authenticated without owner auth
  const shellLayout = read("app", "admin", "(shell)", "layout.tsx");
  const shellGuardIndex = shellLayout.indexOf("requireOwnerContext()");
  const shellLoginIndex = shellLayout.indexOf("return <AdminLogin");
  const shellAppShellIndex = shellLayout.indexOf("<AppShell");
  assert.ok(
    shellGuardIndex !== -1 && shellLoginIndex !== -1 && shellAppShellIndex !== -1,
    "the shell layout must gate on requireOwnerContext(), fall back to AdminLogin, and only then render AppShell"
  );
  assert.ok(
    shellGuardIndex < shellLoginIndex && shellLoginIndex < shellAppShellIndex,
    "AppShell (and therefore the tenant switcher/nav/data) must never be reachable before the auth check resolves"
  );

  // --- 4. Platform pages no longer require manually entered tenant IDs ---
  assert.equal(exists("app", "admin", "platform", "TenantIdBar.tsx"), false, "TenantIdBar.tsx must be deleted");
  assert.equal(exists("app", "admin", "platform", "useTenantId.ts"), false, "useTenantId.ts must be deleted");
  for (const page of ["missions", "approvals", "wallet", "queue", "whatsapp", "tenants"]) {
    const src = read("app", "admin", "(shell)", "platform", page, "page.tsx");
    assert.equal(src.includes("useTenantId"), false, `${page}/page.tsx must not import useTenantId`);
    assert.equal(src.includes("TenantIdBar"), false, `${page}/page.tsx must not render TenantIdBar`);
    assert.ok(src.includes("useCurrentTenant"), `${page}/page.tsx must read the tenant from the shared context instead`);
  }

  // --- 5. Existing /admin/platform RSC information-disclosure guard remains
  const platformOverview = read("app", "admin", "(shell)", "platform", "page.tsx");
  assert.ok(
    /const ctx = await requireOwnerContext\(\);\s*\n\s*if \(!ctx\.ok\) return null;/.test(platformOverview),
    "the platform overview page must still guard itself before constructing integration rows (RSC-payload leak fix must survive the move into (shell)/platform)"
  );
  const platformLayout = read("app", "admin", "(shell)", "platform", "layout.tsx");
  assert.ok(/requireOwnerContext\(\)/.test(platformLayout), "the platform subtree must keep its own defense-in-depth layout guard");

  const commandCenter = read("app", "admin", "(shell)", "page.tsx");
  assert.ok(
    /const ctx = await requireOwnerContext\(\);\s*\n\s*if \(!ctx\.ok\) return null;/.test(commandCenter),
    "the new Command Center (now the default /admin landing page) must independently re-guard itself, same as every other nested page in this build"
  );

  const inboxPage = read("app", "admin", "(shell)", "inbox", "page.tsx");
  assert.ok(
    /const ctx = await requireOwnerContext\(\);\s*\n\s*if \(!ctx\.ok\) return null;/.test(inboxPage),
    "the migrated contact-inbox page must independently re-guard itself"
  );

  // --- 6. Existing API authorization remains unchanged --------------------
  for (const route of [
    path.join("app", "api", "platform", "missions", "route.ts"),
    path.join("app", "api", "platform", "approvals", "route.ts"),
    path.join("app", "api", "platform", "wallet", "route.ts"),
    path.join("app", "api", "platform", "queue", "route.ts"),
    path.join("app", "api", "platform", "whatsapp", "bindings", "route.ts"),
    path.join("app", "api", "platform", "tenants", "route.ts"),
  ]) {
    const src = read(...route.split(path.sep));
    assert.ok(
      /requireTenantContext\(|requireOwnerContext\(|getUser\(\)/.test(src),
      `${route} must still perform server-side authorization — the shared client switcher is UX only, never a replacement for it`
    );
  }

  // --- Active tenant resolution / membership verification (functional) ---
  assert.ok(
    /export async function resolveCurrentTenant/.test(currentTenant),
    "resolveCurrentTenant must exist as the single tenant-resolution entry point"
  );
  assert.ok(
    /if \(tenants\.length === 0\) return \{ tenants, active: null \}/.test(currentTenant),
    "zero memberships must resolve to active: null (the first-run/onboarding signal), not throw or default to a fake tenant"
  );
  assert.ok(
    /listMembershipsForUser/.test(currentTenant) && !/from ["']\.\.\/repository-v2["']/.test(currentTenant),
    "must reuse the existing lib/tenants/repository.ts, not a second parallel tenant data-access system"
  );

  // --- Tenant creation onboarding -----------------------------------------
  const onboarding = read("app", "admin", "(shell)", "OnboardingPanel.tsx");
  assert.ok(onboarding.includes("CreateClientForm"), "onboarding must reuse the shared CreateClientForm, not a duplicate form");
  const createForm = read("app", "admin", "(shell)", "CreateClientForm.tsx");
  assert.ok(createForm.includes('fetch("/api/platform/tenants"'), "client creation must go through the existing authorized tenants API");
  assert.ok(/res\.status === 409/.test(createForm), "must handle duplicate slug (409) distinctly");
  assert.ok(/if \(submitting\) return;/.test(createForm), "must guard against double-submit / repeated submission");
  assert.equal(/\buuid\b/i.test(read("app", "admin", "(shell)", "page.tsx")) , false, "the Command Center must never require a raw UUID as user-facing text");

  // --- Tenant switch persistence ------------------------------------------
  assert.ok(
    /httpOnly: true/.test(tenantActions),
    "the active-tenant selection must be persisted via an httpOnly server-readable cookie, not client-readable localStorage"
  );
  assert.ok(
    /cookies\(\)\.get\(ACTIVE_TENANT_COOKIE\)|cookieStore\.get\(ACTIVE_TENANT_COOKIE\)/.test(currentTenant),
    "resolution must read the same cookie the switcher writes"
  );

  // --- Mobile shell structural behavior ------------------------------------
  const appShell = read("app", "admin", "(shell)", "AppShell.tsx");
  assert.ok(/lg:hidden/.test(appShell) && /hidden .*lg:flex|lg:block/.test(appShell), "the shell must have distinct mobile and desktop nav presentations");
  assert.ok(/min-h-11|min-h-\[44px\]/.test(appShell), "interactive shell controls must meet a ~44px touch-target minimum");
  const clientSwitcher = read("app", "admin", "(shell)", "ClientSwitcher.tsx");
  assert.ok(/min-h-11|h-11/.test(clientSwitcher), "the client switcher's touch targets must meet the same minimum");
  assert.ok(!/<input[^>]*tenant.?[iI]d/i.test(clientSwitcher), "the switcher must never expose a raw tenant-ID text input");

  // --- Legacy route compatibility ------------------------------------------
  // Route groups (the "(shell)" directory) are elided from the URL, so each
  // of these file locations must still serve the exact same public path it
  // always did: /admin, /admin/platform, /admin/platform/tenants, etc.
  assert.ok(exists("app", "admin", "(shell)", "page.tsx"), "/admin must still resolve");
  assert.ok(exists("app", "admin", "(shell)", "platform", "page.tsx"), "/admin/platform must still resolve");
  for (const page of ["tenants", "missions", "approvals", "wallet", "queue", "whatsapp"]) {
    assert.ok(
      exists("app", "admin", "(shell)", "platform", page, "page.tsx"),
      `/admin/platform/${page} must still resolve`
    );
  }
  assert.ok(exists("app", "admin", "(shell)", "inbox", "page.tsx"), "/admin/inbox must resolve (new route, preserves inbox functionality)");
  // /admin/social is untouched — must remain a sibling, not nested inside the new (shell) group.
  assert.equal(exists("app", "admin", "(shell)", "social"), false, "/admin/social must not have been moved into the shell group");
  assert.ok(exists("app", "admin", "social", "layout.tsx"), "/admin/social must keep its own independent layout/guard");

  console.log(
    "unified-shell-tenant-ux.test.ts: ALL PASS (membership-verified selection, stale-cookie fallback, shell auth gate, no raw tenant IDs, RSC guards preserved, API auth unchanged, cookie-based persistence, mobile structure, legacy routes intact)"
  );
}

run();
