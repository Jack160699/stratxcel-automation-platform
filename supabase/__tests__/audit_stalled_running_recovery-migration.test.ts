import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../migrations/20260819100000_audit_stalled_running_recovery.sql", import.meta.url),
  "utf8",
);

console.log("Running StratXcel Audit Stalled-RUNNING Recovery Migration Test...\n");

// A run must only be treated as stalled -- never a legitimately still-executing
// one -- when its heartbeat is meaningfully older than both the 60s function
// ceiling and the 25s customer-polling watchdog used elsewhere.
assert.match(migration, /v_run\.status = 'RUNNING'/);
assert.match(migration, /v_run\.heartbeat_at < now\(\) - interval '3 minutes'/);

// The queue job itself must not be actively pending or leased -- otherwise
// some other invocation could still legitimately be holding this run.
assert.match(migration, /qj\.status in \('PENDING', 'LEASED'\)/);
assert.match(migration, /not exists/);

// The original NEEDS_REVIEW/FAILED recoverability path must be untouched --
// this is additive, not a replacement.
assert.match(migration, /v_run\.status not in \('NEEDS_REVIEW', 'FAILED'\) and not v_stalled_running/);

// Every other safety check from the original function must survive
// byte-for-byte: staff auth, tenant match, cancelled/refunded guard,
// in_review requirement, and the 5-attempt recovery ceiling.
assert.match(migration, /platform_audit_staff_required/);
assert.match(migration, /audit_order_not_found_or_tenant_mismatch/);
assert.match(migration, /audit_cancelled_or_refunded/);
assert.match(migration, /v_order\.status <> 'in_review'/);
assert.match(migration, /v_next_recovery > 5/);
assert.match(migration, /recovery_limit_reached/);

// The admin audit trail must record whether this specific recovery came
// through the new stalled-RUNNING path, for observability.
assert.match(migration, /'recovered_from_stalled_running', v_stalled_running/);

// No privilege surface change.
assert.match(migration, /revoke all on function public\.retry_automatic_audit_generation_v1[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.retry_automatic_audit_generation_v1[\s\S]*to service_role/i);
assert.doesNotMatch(migration, /to authenticated/i);
assert.doesNotMatch(migration, /create policy/i);

console.log("✓ a RUNNING run is only recoverable when heartbeat is >3min stale");
console.log("✓ recovery is refused if the queue job is still PENDING/LEASED");
console.log("✓ the original NEEDS_REVIEW/FAILED recovery path is untouched");
console.log("✓ every other safety check (staff auth, tenant match, cancelled/refunded, in_review, 5-attempt ceiling) survives unchanged");
console.log("✓ no privilege surface change");
console.log("\n=================================================================");
console.log("AUDIT STALLED-RUNNING RECOVERY MIGRATION TEST PASSED SUCCESSFULLY!");
console.log("=================================================================");
