import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../migrations/20260819080000_free_audit_price_check_repair.sql", import.meta.url),
  "utf8",
);

console.log("Running StratXcel Free Audit Price-Check Repair Migration Test...\n");

// The free-by-default model (audit_fee_cents = 0, list/discount = 0,
// fulfilment_source = 'product_grant') must be recognized as fulfilled.
assert.match(migration, /p_order\.audit_fee_cents = 0/);
assert.match(migration, /p_order\.fulfilment_source = 'product_grant'/);
assert.match(migration, /coalesce\(p_order\.list_price_cents, 0\) = 0/);
assert.match(migration, /coalesce\(p_order\.discount_cents, 0\) = 0/);

// The legacy paid-audit branch (₹999, promo/grant or verified payment link)
// must still be present, unmodified in substance.
assert.match(migration, /p_order\.audit_fee_cents = 99900/);
assert.match(migration, /p_order\.fulfilment_source in \('promo', 'product_grant'\)/);
assert.match(migration, /payment_purpose = 'audit_fee'/);
assert.match(migration, /link\.status = 'paid'/);

// The redundant, now-incorrect standalone `<> 99900` price gates must be gone
// from start/complete — audit_has_verified_fulfilment is the single source
// of truth for both pricing models.
const startFn = migration.split("CREATE OR REPLACE FUNCTION public.start_automatic_audit_generation_v1")[1]
  ?.split("CREATE OR REPLACE FUNCTION public.complete_automatic_audit_generation_v1")[0] ?? "";
const completeFn = migration.split("CREATE OR REPLACE FUNCTION public.complete_automatic_audit_generation_v1")[1] ?? "";
assert.ok(startFn.length > 0, "start_automatic_audit_generation_v1 must be present");
assert.ok(completeFn.length > 0, "complete_automatic_audit_generation_v1 must be present");
assert.doesNotMatch(startFn, /audit_fee_cents\s*<>\s*99900/);
assert.doesNotMatch(completeFn, /audit_fee_cents\s*<>\s*99900/);
assert.match(startFn, /audit_has_verified_fulfilment\(v_order\)/);
assert.match(completeFn, /audit_has_verified_fulfilment\(v_order\)/);

// Tenant scoping, idempotency, and citation validation in the two RPCs must
// be entirely untouched by this repair -- it only fixes the price gate.
assert.match(startFn, /v_order\.tenant_id <> p_expected_tenant_id/);
assert.match(startFn, /on conflict \(audit_order_id, brand_brain_version\) do nothing/);
assert.match(completeFn, /unknown_report_citation/);
assert.match(completeFn, /v_order\.tenant_id <> p_expected_tenant_id/);

// No privilege surface change.
assert.match(migration, /revoke all on function public\.start_automatic_audit_generation_v1[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.start_automatic_audit_generation_v1[\s\S]*to service_role/i);
assert.doesNotMatch(migration, /to authenticated/i);
assert.doesNotMatch(migration, /create policy/i);

console.log("✓ audit_has_verified_fulfilment recognizes both the free-by-default and legacy paid models");
console.log("✓ redundant standalone price gates removed from start/complete RPCs");
console.log("✓ tenant scoping, idempotency, and citation validation untouched");
console.log("✓ no privilege surface change");
console.log("\n=================================================================");
console.log("FREE AUDIT PRICE-CHECK REPAIR MIGRATION TEST PASSED SUCCESSFULLY!");
console.log("=================================================================");
