import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260812090000_workforce_core.sql"),
  "utf8",
);

const tables = ["workforce_plans", "workforce_stages", "workforce_reviews"];
for (const table of tables) {
  assert.match(sql, new RegExp(`create table if not exists ${table}`));
  assert.match(sql, new RegExp(`alter table ${table} enable row level security`));
}

assert.match(sql, /tenant_members/);
assert.match(sql, /grant select, insert, update, delete on workforce_plans, workforce_stages, workforce_reviews to service_role/);
assert.equal(/drop table/i.test(sql), false, "Migration must not drop tables");

console.log("workforce-core-migration.test.ts: ALL PASS");
