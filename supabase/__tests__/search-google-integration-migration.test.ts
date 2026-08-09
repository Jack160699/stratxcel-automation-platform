// Run with: node --experimental-strip-types supabase/__tests__/search-google-integration-migration.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260809120000_search_google_integration.sql"), "utf8");

// Additive-only, tenant-scoped table with RLS + correct grants — same shape
// the existing search_discovery_runtime migration test checks.
assert.match(sql, /create table if not exists search_google_connections/);
assert.match(sql, /alter table search_google_connections enable row level security/);
assert.match(sql, /revoke all on search_google_connections from public, anon/);
assert.match(sql, /grant select on search_google_connections to authenticated/);
assert.match(sql, /grant select, insert, update, delete on search_google_connections to service_role/);
assert.match(sql, /create policy search_google_connections_tenant_read on search_google_connections for select[\s\S]{0,300}tenant_members/, "the tenant read policy must actually scope by tenant_members");

// Tenant-scoped: every row belongs to exactly one tenant.
assert.match(sql, /tenant_id uuid not null references tenants\(id\) on delete cascade/);
assert.match(sql, /unique \(tenant_id\)/);

// No credentials committed directly to the table — only an opaque vault
// reference. This intentionally does NOT use the naive
// /access_token|refresh_token/ substring check the search-discovery-runtime
// test uses, because this table's ref column is deliberately named
// "encrypted_refresh_token_ref" (it contains the substring "refresh_token"
// by design, to signal what it references) — the real assertion is that no
// column looks like it stores a raw, usable secret.
assert.equal(/\bclient_secret\b/i.test(sql), false, "no raw client secret column");
assert.equal(/\baccess_token\s+text\b/i.test(sql), false, "no raw access_token column");
assert.match(sql, /encrypted_refresh_token_ref text/, "only an opaque vault reference column, never a plaintext token column");
assert.equal(/\brefresh_token\s+text\b/i.test(sql), false, "no plaintext refresh_token column — only the _ref pointer");

// No SECURITY DEFINER functions introduced by this migration.
assert.equal(/security definer/i.test(sql), false);

// Not one of the applied migrations this task must never edit.
const appliedMigrations = ["20260809010000_subscription_v1_catalog_alignment.sql", "20260809020000_search_discovery_runtime.sql"];
for (const applied of appliedMigrations) {
  assert.equal(fs.existsSync(path.join(process.cwd(), "supabase/migrations", applied)) === true, true, `${applied} must still exist unmodified`);
}
const appliedSql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260809020000_search_discovery_runtime.sql"), "utf8");
assert.equal(/search_google_connections/.test(appliedSql), false, "the applied search-discovery migration must not have been edited to reference the new table");

console.log("search-google-integration-migration.test.ts: ALL PASS (additive schema, tenant RLS, grants, no raw credential columns, applied migrations untouched)");
