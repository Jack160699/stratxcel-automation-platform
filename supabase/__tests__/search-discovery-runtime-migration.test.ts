import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path";
const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260809020000_search_discovery_runtime.sql"), "utf8");
const tables = ["search_projects", "search_analysis_runs", "search_opportunities", "search_recommendations", "search_actions", "search_measurement_snapshots"];
for (const table of tables) { assert.match(sql, new RegExp(`create table if not exists ${table}`)); assert.match(sql, new RegExp(`alter table ${table} enable row level security`)); assert.match(sql, new RegExp(`revoke all on[^;]*${table}[^;]*from public, anon`, "s")); assert.match(sql, new RegExp(`grant select[^;]*${table}[^;]*to authenticated`, "s")); }
assert.equal(/access_token|refresh_token|oauth_token|client_secret/i.test(sql), false, "Search tables must not store provider credentials");
assert.match(sql, /unique \(tenant_id, idempotency_key\)/); assert.match(sql, /unique \(tenant_id, project_id, fingerprint\)/); assert.equal(/security definer/i.test(sql), false);
assert.match(sql, /ownership_verified boolean not null default false/);
console.log("search-discovery-runtime-migration.test.ts: ALL PASS (additive schema, tenant RLS, grants, no credentials)");
