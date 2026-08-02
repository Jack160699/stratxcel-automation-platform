// Static security check on the queue migration: since no live Postgres
// project is reachable this session (see docs/discovery/SUPABASE_DATA_AND_RLS_MAP.md),
// this is a policy-as-code test on the SQL source itself rather than a
// runtime privilege-escalation test against a real database. It fails
// loudly if a future edit to the migration drops a revoke/grant line.
// Run with: node --experimental-strip-types packages/queue/src/__tests__/migration-security.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(__dirname, "../../../../supabase/migrations/20260803130000_queue.sql");

function run() {
  const sql = fs.readFileSync(migrationPath, "utf8");

  // The queue_internal schema itself must be locked down from PUBLIC.
  assert.match(sql, /revoke all on schema queue_internal from public;/);

  const publicWrapperFunctions = [
    "claim_next_job(text, text[], integer)",
    "heartbeat_job(uuid, text, integer)",
    "complete_job(uuid, text)",
    "fail_job(uuid, text, jsonb, boolean)",
    "cancel_job(uuid)",
    "recover_expired_leases()",
  ];

  for (const signature of publicWrapperFunctions) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const revokePattern = new RegExp(
      `revoke all on function public\\.${escaped} from public, anon, authenticated;`
    );
    const grantPattern = new RegExp(`grant execute on function public\\.${escaped} to service_role;`);

    assert.match(sql, revokePattern, `missing REVOKE for public.${signature}`);
    assert.match(sql, grantPattern, `missing GRANT to service_role for public.${signature}`);
  }

  // Every function must fix its search_path — an unset search_path on a
  // SECURITY DEFINER function is a classic Postgres privilege-escalation
  // vector (a caller-controlled search_path could shadow public.queue_jobs
  // with an attacker table of the same name in another schema).
  const definerFunctionCount = (sql.match(/security definer/g) ?? []).length;
  const fixedSearchPathCount = (sql.match(/set search_path = public, pg_temp/g) ?? []).length;
  assert.equal(
    fixedSearchPathCount,
    definerFunctionCount,
    "every SECURITY DEFINER function must set a fixed search_path"
  );

  console.log("migration-security.test.ts (@stratxcel/queue): ALL PASS");
}

run();
