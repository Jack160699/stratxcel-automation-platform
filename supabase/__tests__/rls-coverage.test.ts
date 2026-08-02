// Static tenant-isolation check on this session's platform migrations
// (20260803*). No live Supabase project is reachable this session (see
// docs/discovery/SUPABASE_DATA_AND_RLS_MAP.md), so this is a
// policy-as-code check on the SQL source: every table must either (a)
// have RLS enabled with a tenant-scoped read policy, or (b) be explicitly
// allowlisted below with a one-line reason it deliberately has none. A
// new table added without either fails this test loudly, rather than
// silently shipping without RLS. Real `get_advisors` / performance
// advisor output should still be run against a reachable non-production
// project before any of this goes live — this test cannot replace that,
// only catch regressions until it's possible.
// Run with: node --experimental-strip-types supabase/__tests__/rls-coverage.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../migrations");

const PLATFORM_MIGRATION_PREFIX = "20260803";

// Tables that intentionally have RLS enabled but zero/no-tenant-read
// policies — service_role only, by design, with the reason documented in
// the migration file itself.
const NO_TENANT_POLICY_ALLOWLIST: Record<string, string> = {
  vault_secrets: "ciphertext blob has no legitimate client-facing use — service_role only",
  razorpay_webhook_events: "not yet known to belong to a tenant until processed — ops/audit surface only",
  whatsapp_unmatched_events: "belongs to no tenant by definition (unrouted) — ops surface only",
};

function run() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql") && f.startsWith(PLATFORM_MIGRATION_PREFIX));
  assert.ok(files.length > 0, "expected to find this session's platform migrations");

  const combinedSql = files.map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8")).join("\n");

  const tableNames = [...combinedSql.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);
  assert.ok(tableNames.length > 0, "expected to find at least one CREATE TABLE statement");

  const failures: string[] = [];

  for (const table of tableNames) {
    const hasRlsEnabled = new RegExp(`alter table ${table} enable row level security;`).test(combinedSql);
    if (!hasRlsEnabled) {
      failures.push(`${table}: RLS is not enabled`);
      continue;
    }

    const hasTenantPolicy = new RegExp(`create policy \\w+ on ${table} for select[\\s\\S]{0,300}tenant_members`).test(combinedSql);
    if (!hasTenantPolicy && !(table in NO_TENANT_POLICY_ALLOWLIST)) {
      failures.push(`${table}: no tenant-scoped read policy and not in the documented allowlist`);
    }
  }

  assert.deepEqual(failures, [], `RLS coverage gaps found:\n${failures.join("\n")}`);

  console.log(`rls-coverage.test.ts: checked ${tableNames.length} tables across ${files.length} migrations — ALL PASS`);
}

run();
