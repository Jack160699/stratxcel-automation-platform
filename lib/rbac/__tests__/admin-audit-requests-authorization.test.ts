// Regression test for a P0 finding from the 2026-08-23 platform security
// audit: app/api/platform/audit-requests/route.ts (GET + PATCH) only checked
// "is the caller logged in?", not platform-staff role — so any signed-up
// customer account could read and edit every prospect's PII (business name,
// email, phone, goals, internal notes) collected by the public free-audit
// funnel. The matching RLS/grant fix lives in
// supabase/migrations/20260823120000_lock_public_audit_requests_to_service_role.sql,
// which also closes the same hole at the direct-PostgREST layer (any
// authenticated Supabase JWT could otherwise read/update the table even
// without going through this app route at all).
//
// This is a static source-inspection test (no live Supabase project is
// reachable from this environment — see the audit's manual-actions list),
// matching the pattern used by app/api/platform/audit/__tests__/audit-payment-safety.test.ts.
// Run with: node --experimental-strip-types lib/rbac/__tests__/admin-audit-requests-authorization.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function run() {
  const routeSource = stripComments(read("app", "api", "platform", "audit-requests", "route.ts"));

  // --- 1. Both handlers must import and call requirePlatformStaff --------
  assert.ok(
    /import\s*\{\s*requirePlatformStaff\s*\}\s*from\s*["'].*platform-staff\/auth/.test(routeSource),
    "route must import requirePlatformStaff from lib/platform-staff/auth"
  );

  const [, getBody = "", patchBody = ""] =
    routeSource.match(/export async function GET\(\)[\s\S]*?\n\}([\s\S]*?)export async function PATCH/) ??
    routeSource.match(/(export async function GET[\s\S]*?)(?=export async function PATCH)/) ??
    [];
  void getBody;
  void patchBody;

  // Simpler, robust check: each exported handler's source slice must
  // contain a requirePlatformStaff call gated behind the auth check, before
  // any read/write of public_audit_requests happens.
  const getSection = routeSource.split("export async function GET")[1]?.split("export async function PATCH")[0] ?? "";
  const patchSection = routeSource.split("export async function PATCH")[1] ?? "";

  for (const [name, section] of [
    ["GET", getSection],
    ["PATCH", patchSection],
  ] as const) {
    assert.ok(section.length > 0, `expected to find a ${name} handler body`);
    assert.ok(
      /requirePlatformStaff\(user\.id,\s*\[[^\]]*"platform_owner"[^\]]*\]\)/.test(section),
      `${name} handler must call requirePlatformStaff(user.id, [...]) with an explicit allowed-roles list`
    );
    assert.ok(
      /if\s*\(!staffAuth\.ok\)\s*\{[\s\S]*?return Response\.json/.test(section),
      `${name} handler must reject (fail closed) when requirePlatformStaff returns !ok`
    );

    const staffCheckIdx = section.indexOf("requirePlatformStaff(user.id");
    const tableAccessIdx = section.indexOf('.from("public_audit_requests")');
    assert.ok(staffCheckIdx !== -1 && tableAccessIdx !== -1, `${name} handler must both authorize and touch public_audit_requests`);
    assert.ok(staffCheckIdx < tableAccessIdx, `${name} handler must authorize BEFORE touching public_audit_requests, not after`);

    // A plain "logged in" check alone is insufficient — must not be the only gate.
    assert.ok(!/if\s*\(!user\)[\s\S]{0,40}401[\s\S]{0,200}\.from\("public_audit_requests"\)/.test(section) ||
      staffCheckIdx < tableAccessIdx,
      `${name} handler must not fall through to public_audit_requests access on "logged in" alone`);
  }

  // --- 2. DB-layer defense in depth: the broad `authenticated` grant/policy
  // introduced in the original table migration must be revoked by a later
  // migration, so direct PostgREST access is also closed. -----------------
  const originalMigration = stripComments(read("supabase", "migrations", "20260805140000_public_audit_requests.sql"));
  assert.ok(
    /grant select, update on public_audit_requests to authenticated/i.test(originalMigration),
    "sanity check: the original migration is expected to contain the overly-broad grant this test guards against"
  );

  const migrationsDir = path.join(root, "supabase", "migrations");
  const laterMigrations = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql") && f > "20260805140000_public_audit_requests.sql")
    .map((f) => stripComments(fs.readFileSync(path.join(migrationsDir, f), "utf8")));

  const revoked = laterMigrations.some(
    (sql) =>
      /revoke select, update on public_audit_requests from authenticated/i.test(sql) &&
      /drop policy if exists public_audit_requests_auth_read/i.test(sql) &&
      /drop policy if exists public_audit_requests_auth_update/i.test(sql)
  );
  assert.ok(
    revoked,
    "expected a later migration to revoke the broad `authenticated` grant and drop the USING(true) policies on public_audit_requests"
  );

  console.log("admin-audit-requests-authorization.test.ts: ALL PASS");
}

run();
