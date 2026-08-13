import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../migrations/20260813220000_tenant_invitations.sql", import.meta.url),
  "utf8",
);

assert.match(migration, /create table if not exists public\.tenant_invitations/);
assert.match(migration, /role in \('admin', 'operator', 'viewer'\)/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.tenant_invitations from public, anon, authenticated/);
assert.match(migration, /grant select, insert, update on table public\.tenant_invitations to service_role/);
assert.doesNotMatch(migration, /delete from public\.tenants/i);
assert.doesNotMatch(migration, /delete from auth\.users/i);

console.log("tenant-invitations-migration.test.ts: PASS");
