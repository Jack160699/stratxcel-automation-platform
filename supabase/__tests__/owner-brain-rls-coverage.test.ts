// Static tenant/owner-isolation check on the Owner Operating Brain
// migrations (20260810*), same policy-as-code approach as
// rls-coverage.test.ts for the 20260803 platform migrations: every
// owner_* table must have RLS enabled AND either an owner-scoped policy
// (owner_id = auth.uid() joined with a stratxcel_admins check — the same
// pattern the already-live Social Autopilot schema uses) or a documented
// admin-read-only / child-table-via-parent-join policy. A new table added
// without any of these fails this test loudly.
// Run with: node --experimental-strip-types supabase/__tests__/owner-brain-rls-coverage.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../migrations");

const OWNER_BRAIN_MIGRATION_PREFIX = "20260810";

// Child tables with no owner_id column of their own — isolation comes
// from a policy that joins back to their owner-scoped parent (documented
// per-table in the migration itself), not a direct owner_id check.
const PARENT_JOIN_TABLES = new Set([
  "owner_event_entities", // joins owner_events
  "owner_memory_sources", // joins owner_memories
  "owner_decision_options", // joins owner_decisions
  "owner_decision_outcomes", // joins owner_decisions
  "owner_transcripts", // joins owner_voice_notes
]);

// Tables written only by the sync worker (service_role) with a read-only
// admin policy instead of the full owner-scoped for-all policy.
const ADMIN_READ_ONLY_TABLES = new Set(["owner_sync_runs", "owner_events"]);

function run() {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql") && f.startsWith(OWNER_BRAIN_MIGRATION_PREFIX));
  assert.ok(files.length >= 2, "expected the schema migration and the voice-storage migration");

  const combinedSql = files.map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8")).join("\n");

  const tableNames = [...combinedSql.matchAll(/create table if not exists (owner_\w+)/g)].map((m) => m[1]);
  assert.equal(tableNames.length, 24, "existing Owner Brain entities plus four additive provider-level chat entities");

  const failures: string[] = [];

  for (const table of tableNames) {
    const hasRlsEnabled = new RegExp(`alter table ${table} enable row level security;`).test(combinedSql);
    if (!hasRlsEnabled) {
      failures.push(`${table}: RLS is not enabled`);
      continue;
    }

    if (ADMIN_READ_ONLY_TABLES.has(table)) {
      const hasAdminReadPolicy = new RegExp(`create policy \\w+ on ${table} for select[\\s\\S]{0,400}stratxcel_admins`).test(combinedSql);
      if (!hasAdminReadPolicy) failures.push(`${table}: expected an admin-read-only policy referencing stratxcel_admins`);
      continue;
    }

    if (PARENT_JOIN_TABLES.has(table)) {
      // "for all" (read-write, e.g. owner_memory_sources) or "for select"
      // (admin-read-only, e.g. owner_event_entities — populated only by
      // the classification worker) are both legitimate here.
      const hasParentJoinPolicy = new RegExp(`create policy \\w+ on ${table} for (all|select)[\\s\\S]{0,500}exists \\(select 1 from owner_\\w+`).test(combinedSql);
      if (!hasParentJoinPolicy) failures.push(`${table}: expected a policy that joins back to its owner-scoped parent`);
      continue;
    }

    // Every remaining table must be owner_id-scoped AND admin-gated —
    // the exact pattern already live in production for social_* tables.
    const hasOwnerAdminPolicy = new RegExp(`create policy \\w+ on ${table} for all[\\s\\S]{0,400}owner_id = \\(select auth\\.uid\\(\\)\\)[\\s\\S]{0,200}stratxcel_admins`).test(combinedSql);
    if (!hasOwnerAdminPolicy) failures.push(`${table}: no owner_id + stratxcel_admins-scoped policy found`);

    // Never store a raw OAuth token/secret in a plain column — only an opaque vault ref.
    if (table === "owner_source_connections" || table === "owner_desktop_devices" || table === "owner_chat_connections") {
      assert.ok(!/refresh_token|access_token|plaintext/.test(combinedSql.split(table)[1]?.split(";")[0] ?? ""), `${table} must never have a raw-token column`);
    }
  }

  assert.deepEqual(failures, [], `RLS coverage gaps found:\n${failures.join("\n")}`);

  // service_role must always be explicitly granted (RLS bypass alone isn't enough — see the "Supabase grants gotcha" precedent in this codebase's history).
  for (const table of tableNames) {
    const grantPattern = new RegExp(`grant select, insert, update, delete on ${table} to service_role;`);
    assert.match(combinedSql, grantPattern, `${table}: missing explicit service_role grant`);
  }

  // `authenticated` must ALSO be explicitly granted — RLS policies alone
  // are not sufficient without the underlying Postgres table-level GRANT
  // (this class of bug shipped once already, in the original schema
  // migration, and was only caught by scripts/verify-owner-brain-rls.mjs
  // running against the real database — a real authenticated Supabase
  // client got 42501 "permission denied" despite a passing RLS policy).
  // Statements may list several tables in one multi-line GRANT, so this
  // matches on the statement text, not one grant-per-table.
  const authenticatedGrantStatements = [...combinedSql.matchAll(/grant\s+((?:select|insert|update|delete|,|\s)+)\s+on\s+([\s\S]*?)\s+to\s+authenticated;/gi)];
  assert.ok(authenticatedGrantStatements.length > 0, "expected at least one GRANT ... TO authenticated statement");

  for (const table of tableNames) {
    const grantedBySomeStatement = authenticatedGrantStatements.some((m) => new RegExp(`\\b${table}\\b`).test(m[2]));
    assert.ok(grantedBySomeStatement, `${table}: missing an explicit 'to authenticated' grant (RLS policy alone is not enough)`);
  }

  console.log(`owner-brain-rls-coverage.test.ts: checked ${tableNames.length} tables across ${files.length} migrations — ALL PASS`);
}

run();
