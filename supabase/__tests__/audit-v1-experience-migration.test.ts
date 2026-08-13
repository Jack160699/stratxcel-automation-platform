import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../migrations/20260813180000_audit_v1_experience.sql", import.meta.url),
  "utf8",
);

assert.match(migration, /create table if not exists public\.audit_reset_snapshots/i);
assert.match(migration, /create table if not exists public\.tenant_current_audits/i);
assert.match(migration, /reset_audit_product_eligibility_v1/i);
assert.match(migration, /claim_fresh_product_grant_audit_v1/i);
assert.match(migration, /tenant_has_fresh_audit_grant/i);
assert.match(migration, /audit_has_verified_fulfilment/i);
assert.match(migration, /fulfilment_source in \('promo', 'product_grant'\)/i);
assert.match(migration, /actual_paid_cents, 0\) = 0/i);
assert.doesNotMatch(migration, /delete from public\.audit_orders/i);
assert.doesNotMatch(migration, /delete from public\.tenants/i);
assert.doesNotMatch(migration, /delete from public\.promo_redemptions/i);
assert.doesNotMatch(migration, /delete from auth\.users/i);
assert.doesNotMatch(migration, /grant select on public\.audit_reset_snapshots to authenticated/i);
assert.match(migration, /grant execute on function public\.reset_audit_product_eligibility_v1/i);
assert.match(migration, /platform_owner_or_admin_required/i);
assert.match(migration, /fresh_audit_grant_required/i);

console.log("audit-v1-experience-migration.test.ts: PASS");
