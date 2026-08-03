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

  const layout = read("app", "admin", "platform", "layout.tsx");

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
    /import AdminLogin from ["']\.\.\/AdminLogin["']/.test(layout),
    "layout must import the existing app/admin/AdminLogin.tsx, not a second login UI"
  );

  assert.ok(/No access/.test(layout), "the 403 (unauthorized) branch must render a clear 'No access' message");

  // Structural ordering: the auth gate and both its failure branches must
  // appear before the authenticated shell (nav + heading) in source order,
  // proving the shell renders only after — never ahead of — authorization.
  const navIndex = layout.indexOf("NAV_ITEMS.map");
  const headingIndex = layout.indexOf("Platform Admin</h1>");
  assert.ok(navIndex !== -1 && headingIndex !== -1, "authenticated shell (nav + heading) must still exist for authorized owners");
  assert.ok(gateCallIndex < navIndex && gateCallIndex < headingIndex, "auth gate must run before the authenticated shell is rendered");

  // robots noindex must cover this subtree, same as /admin/social.
  assert.ok(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/.test(layout), "platform admin subtree must not be indexable");

  console.log("platform-admin-layout-gate.test.ts: ALL PASS (shared auth reused, both failure branches present, shell gated after auth, noindex present)");
}

run();
