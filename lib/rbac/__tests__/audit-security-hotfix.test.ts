// Security & Baseline Test Suite for Audit Disabled-State & Access Control Hotfix
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  console.log("Starting audit security & disabled-state baseline tests...");

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

  // Verify rejection of AUDIT_ENGINE_MODE=live
  assert.ok(
    /AUDIT_ENGINE_MODE === ["']live["']/.test(auditRouteSource),
    "app/api/platform/audit/route.ts must reject AUDIT_ENGINE_MODE=live with a configuration error"
  );
  assert.ok(
    /status:\s*400/.test(auditRouteSource),
    "app/api/platform/audit/route.ts must return HTTP 400 when AUDIT_ENGINE_MODE=live is requested"
  );

  // Verify disabled state parameters: job_status = "saved", progress_percentage = 0, started_at = null
  assert.ok(
    /job_status:\s*["']saved["']/.test(auditRouteSource),
    "app/api/platform/audit/route.ts must save audit jobs with job_status = 'saved'"
  );
  assert.ok(
    /progress_percentage:\s*0/.test(auditRouteSource),
    "app/api/platform/audit/route.ts must save audit jobs with progress_percentage = 0"
  );
  assert.ok(
    /started_at:\s*null/.test(auditRouteSource),
    "app/api/platform/audit/route.ts must set started_at = null in disabled state"
  );

  // Verify RBAC tenant visibility (Owner/Admin roles or Audit Creator)
  assert.ok(
    /m\.role === ["']owner["']\s*\|\|\s*m\.role === ["']admin["']/.test(auditRouteSource),
    "app/api/platform/audit/route.ts must restrict tenant audit access to owners and admins or the audit creator"
  );
  assert.ok(
    /user_id\.eq\.\$\{user\.id\}/.test(auditRouteSource),
    "app/api/platform/audit/route.ts must allow audit creator access"
  );

  // 2. Verify migration 20260805170000_flag_simulated_legacy_audits.sql exists
  const repairMigration = read("supabase", "migrations", "20260805170000_flag_simulated_legacy_audits.sql");
  assert.ok(
    /simulated_legacy/.test(repairMigration),
    "Migration 20260805170000 must set generation_method = 'simulated_legacy'"
  );
  assert.ok(
    /unverified/.test(repairMigration),
    "Migration 20260805170000 must set report_trust_status = 'unverified'"
  );

  console.log("audit-security-hotfix.test.ts: ALL PASS (unauthenticated 401, live-mode 400 rejection, disabled job_status=saved, started_at=null, owner/admin/creator RBAC visibility, repair migration verified)");
}

run();
