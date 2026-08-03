// Run with: node --experimental-strip-types lib/rbac/__tests__/platform-admin-layout-gate.test.ts
//
// Regression guard for the /admin/platform auth gate. requireOwnerContext()
// reads next/headers cookies() internally (via lib/supabase/server.ts, whose
// extensionless internal import only resolves under Next.js's bundler, not
// plain Node ESM) — invoking it, or even importing its module directly,
// only works inside a real Next.js request scope. This asserts against the
// actual source instead, mirroring app/admin/social/layout.tsx's
// established pattern: the gate must run, branch on both failure statuses,
// and the authenticated shell must only appear after that branch.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  // The shared owner-auth mechanism must still exist with its established
  // contract: 401 for unauthenticated, 403 for authenticated-but-unauthorized.
  const dbContext = read("lib", "social", "db-context.ts");
  assert.ok(/export async function requireOwnerContext\(/.test(dbContext), "requireOwnerContext() must still exist and be exported");
  assert.ok(/status: 401/.test(dbContext) && /status: 403/.test(dbContext), "requireOwnerContext() must still distinguish 401 (unauthenticated) from 403 (unauthorized)");

  // Phase 1 moved app/admin/platform/* into the app/admin/(shell)/platform/*
  // route group so it could share the unified AppShell/nav (route groups
  // are elided from the URL, so /admin/platform/* still resolves the same
  // — see the Phase 1 unified-shell-tenant-ux test for that coverage). The
  // shared nav/heading this test originally checked for now lives once in
  // app/admin/(shell)/AppShell.tsx rather than duplicated in this layout,
  // so this layout is deliberately just a defense-in-depth re-guard now.
  const layout = read("app", "admin", "(shell)", "platform", "layout.tsx");

  assert.ok(
    /import\s*\{\s*requireOwnerContext\s*\}\s*from\s*["']@\/lib\/social\/db-context["']/.test(layout),
    "layout must import the shared requireOwnerContext(), not a duplicate auth mechanism"
  );

  const gateCallIndex = layout.indexOf("requireOwnerContext()");
  assert.ok(gateCallIndex !== -1, "layout must call requireOwnerContext()");

  assert.ok(/if\s*\(\s*!ctx\.ok\s*\)/.test(layout), "layout must branch on an unauthorized ctx.ok result");

  assert.ok(
    /ctx\.status === 401[\s\S]{0,40}return <AdminLogin/.test(layout),
    "the 401 (unauthenticated) branch must render the existing AdminLogin component"
  );
  assert.ok(
    /import AdminLogin from ["']@\/app\/admin\/AdminLogin["']/.test(layout),
    "layout must import the existing app/admin/AdminLogin.tsx, not a second login UI"
  );

  assert.ok(/No access/.test(layout), "the 403 (unauthorized) branch must render a clear 'No access' message");

  // Structural ordering: the auth gate and both its failure branches must
  // appear before children are ever rendered, proving the platform subtree
  // renders only after — never ahead of — authorization.
  const childrenIndex = layout.indexOf("<>{children}</>");
  assert.ok(childrenIndex !== -1, "authorized owners must still reach {children} (missions/approvals/wallet/queue/whatsapp/tenants)");
  assert.ok(gateCallIndex < childrenIndex, "auth gate must run before {children} is ever rendered");

  // robots noindex must cover this subtree, same as /admin/social.
  assert.ok(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/.test(layout), "platform admin subtree must not be indexable");

  // --- Overview-page RSC protection ---------------------------------
  // The App Router still renders and serializes a nested page's Server
  // Component output into the RSC flight payload even when the parent
  // layout discards {children} for an unauthorized visitor — the layout
  // gate alone does not stop this page's env-var-derived integration rows
  // from reaching the response. This mirrors app/admin/social/page.tsx's
  // own independent guard, and directly guards against the regression this
  // test was added for: the previous implementation had no
  // requireOwnerContext() reference anywhere in this file, so every
  // assertion below would fail against it. This content moved from
  // /admin/platform to /admin/system (ADMIN_INFORMATION_ARCHITECTURE.md §1,
  // "System Health") — the legacy /admin/platform path is now a thin
  // redirect() wrapper, covered separately by unified-shell-tenant-ux.test.ts.
  const page = read("app", "admin", "(shell)", "system", "page.tsx");

  assert.ok(
    /import\s*\{\s*requireOwnerContext\s*\}\s*from\s*["']@\/lib\/social\/db-context["']/.test(page),
    "overview page must import the shared requireOwnerContext(), not a duplicate auth mechanism"
  );

  assert.ok(
    /export default async function SystemHealthPage/.test(page),
    "SystemHealthPage must be an async Server Component"
  );

  const pageGateIndex = page.indexOf("await requireOwnerContext()");
  assert.ok(pageGateIndex !== -1, "overview page must invoke await requireOwnerContext()");

  assert.ok(
    /if\s*\(\s*!ctx\.ok\s*\)\s*return null;/.test(page),
    "overview page must return null (not AdminLogin — the layout already owns that UI) when unauthorized"
  );
  assert.equal(
    /return <AdminLogin/.test(page),
    false,
    "overview page must not render a second login UI; the parent layout owns the visible unauthenticated experience"
  );

  const rowsIndex = page.indexOf("const rows");
  assert.ok(rowsIndex !== -1, "overview page must still build its integration rows for authorized owners");
  assert.ok(pageGateIndex < rowsIndex, "auth guard must run before integration rows are constructed");

  for (const envVar of ["WHATSAPP_INTEGRATION_MODE", "RAZORPAY_INTEGRATION_MODE", "HERMES_MODE"]) {
    const envIndex = page.indexOf(`process.env.${envVar}`);
    assert.ok(envIndex !== -1, `overview page must still read process.env.${envVar} for authorized owners`);
    assert.ok(pageGateIndex < envIndex, `auth guard must run before process.env.${envVar} is read`);
  }

  console.log("platform-admin-layout-gate.test.ts: ALL PASS (shared auth reused, both failure branches present, shell gated after auth, noindex present, overview-page RSC guard precedes rows/env reads)");
}

run();
