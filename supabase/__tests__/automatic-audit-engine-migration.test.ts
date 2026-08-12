import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../migrations/20260812170000_automatic_audit_engine_v1.sql", import.meta.url),
  "utf8",
);
const staffMigration = readFileSync(
  new URL("../migrations/20260806006500_platform_staff_and_audit_completion_hardening.sql", import.meta.url),
  "utf8",
);

assert.match(migration, /create table public\.audit_generation_runs/i);
assert.match(migration, /unique \(audit_order_id, brand_brain_version\)/i);
assert.match(migration, /job_type = 'audit\.generate_v1'/i);
assert.match(migration, /start_automatic_audit_generation_v1/i);
assert.match(migration, /complete_automatic_audit_generation_v1/i);
assert.match(migration, /retry_automatic_audit_generation_v1/i);
assert.match(migration, /quality_outcome[\s\S]*PASS[\s\S]*LOW_CONFIDENCE[\s\S]*INSUFFICIENT_EVIDENCE/i);
assert.match(migration, /grant select, insert, update, delete on public\.audit_generation_runs to service_role/i);
assert.doesNotMatch(migration, /grant select on public\.audit_generation_runs to authenticated/i);
assert.doesNotMatch(migration, /create policy[\s\S]*audit_generation_runs/i);
assert.match(migration, /completed_by = null/i);
assert.match(migration, /'complete_audit_automatic'/i);
assert.match(migration, /'system'/i);
assert.match(migration, /verified_audit_payment_required/i);
assert.match(migration, /current_brand_brain_version_required/i);
assert.match(migration, /head\.current_version = p_brand_brain_version/i);
assert.match(migration, /audit_cancelled_or_refunded/i);
assert.match(migration, /quality_pass_required/i);
assert.match(migration, /evidence_required/i);
assert.match(migration, /revoke all on function public\.complete_automatic_audit_generation_v1[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.complete_automatic_audit_generation_v1[\s\S]*to service_role/i);
assert.match(migration, /platform_admin_events/i);
assert.doesNotMatch(migration, /create or replace function public\.complete_audit_and_issue_subscription_credit_v5/i);
assert.match(staffMigration, /create or replace function public\.complete_audit_and_issue_subscription_credit_v5/i);

console.log("automatic-audit-engine-migration.test.ts: PASS");
