import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260816140000_growth_os_core_schema.sql"),
  "utf8",
);

const tables = [
  "business_evidence",
  "business_requirements",
  "service_catalog_v2",
  "plan_versions",
  "value_ledger",
];

for (const table of tables) {
  assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`, "i"));
  assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
}

assert.match(sql, /tenant_members/);
assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.business_evidence/i);
assert.match(sql, /REVOKE ALL ON public\.business_evidence/i);
assert.equal(/DROP TABLE/i.test(sql), false, "Growth OS migration must never drop tables");

console.log("growth-os-migration.test.ts: ALL PASS");
