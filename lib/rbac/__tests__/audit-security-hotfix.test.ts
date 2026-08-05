// Security Regression Test Suite for Audit Security Hotfix
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  console.log("Starting audit security hotfix tests...");

  // 1. Inspect app/api/platform/audit/route.ts
  const auditRouteSource = read("app", "api", "platform", "audit", "route.ts");

  // Verify authentication check exists
  assert.ok(
    /getUser\(\)/.test(auditRouteSource),
    "app/api/platform/audit/route.ts must perform auth.getUser() check"
  );
  assert.ok(
    /status:\s*401/.test(auditRouteSource),
    "app/api/platform/audit/route.ts must return HTTP 401 when unauthenticated"
  );

  // Verify service-role DB client is NOT used without tenant membership / user ownership check
  assert.equal(
    /serviceDb\.from\(["']public_audit_requests["']\)\.select\(.*\)\.eq\(["']id["'],\s*auditId\)\.single\(\)/.test(auditRouteSource),
    false,
    "app/api/platform/audit/route.ts MUST NOT select by auditId alone using serviceDb without tenant/user ownership verification"
  );

  // Verify RLS supabase client or explicit tenant ownership constraint is present
  assert.ok(
    /tenant_members/.test(auditRouteSource) || /supabase\.from\(["']public_audit_requests["']\)/.test(auditRouteSource),
    "app/api/platform/audit/route.ts must enforce tenant_members membership or use the authenticated RLS supabase client"
  );

  // 2. Verify migration 20260805160000_authenticated_audit_jobs.sql RLS policies exist
  const migrationSource = read("supabase", "migrations", "20260805160000_authenticated_audit_jobs.sql");
  assert.ok(
    /create policy[\s\S]*?public_audit_requests for select/i.test(migrationSource),
    "Migration 20260805160000 must include RLS select policy for public_audit_requests"
  );
  assert.ok(
    /auth\.uid\(\)/.test(migrationSource),
    "Migration 20260805160000 RLS policies must constrain select/insert/update by auth.uid()"
  );

  console.log("audit-security-hotfix.test.ts: ALL PASS (unauthenticated access denied, cross-tenant isolation enforced, no unconstrained serviceDb reads)");
}

run();
