import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

console.log("Running StratXcel restore_scoped_public_audit_requests_grant Migration Test...\n");

// Regression for a P1 finding from live E2E testing on 2026-08-23 (SEO/LEO
// pass): /app/growth 500'd on GET /api/platform/audit with "permission
// denied for table public_audit_requests" for every authenticated
// customer, leaving the page's loading skeleton stuck.
//
// Root cause: 20260823120000_lock_public_audit_requests_to_service_role.sql
// correctly removed a real vulnerability -- unscoped USING (true) policies
// named public_audit_requests_auth_read/_auth_update that let any
// authenticated user read/modify any prospect's row -- but its
// `drop policy if exists` calls targeted those specific (wrong) names,
// which never matched the policies actually installed on the table
// ("Authenticated users can select/update/insert tenant audit requests",
// already correctly scoped to tenant_id/user_id). Those drops were
// therefore no-ops; the correctly-scoped policies were never touched.
// What actually broke everything was a blanket `revoke select, update
// ... from authenticated`: a Postgres table-level GRANT is checked before
// RLS policies are ever evaluated, so revoking it blocks all authenticated
// access regardless of how well-scoped the policies are. It also missed
// that app/api/platform/audit/route.ts is a third, legitimate consumer of
// this table via the authenticated (RLS-enforced) client -- the original
// migration's comment claimed only two service-role-only routes touched
// this table, which was incomplete.
const restoringRaw = readFileSync(
  new URL("../migrations/20260823150000_restore_scoped_public_audit_requests_grant.sql", import.meta.url),
  "utf8",
);
// Strip SQL comments first -- this migration's own explanatory comment
// narrates what the earlier (buggy) migration did, in prose that would
// otherwise trip these same assertions against the comment text rather
// than the executable SQL, matching the pattern used elsewhere in this
// codebase for JS/TS source-inspection tests.
const restoring = restoringRaw.replace(/--.*$/gm, "");

assert.match(
  restoring,
  /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+public\.public_audit_requests\s+to\s+authenticated/i,
  "must restore select, insert, and update to authenticated -- information_schema confirmed all three were revoked, including insert, which the original lockdown migration's revoke never even mentioned"
);

// Must never grant to anon or re-introduce broader access than the
// pre-existing scoped policies expect -- this migration's whole point is
// restoring exactly the grant those policies were built for, nothing more.
assert.doesNotMatch(restoring, /\bto\s+anon\b/i, "must not grant access to the anon role");
assert.doesNotMatch(restoring, /drop\s+policy/i, "must not touch policies -- the correctly-scoped ones were never actually removed, only the base grant was");
assert.doesNotMatch(restoring, /using\s*\(\s*true\s*\)/i, "must not reintroduce an unscoped USING (true) policy -- that was the original vulnerability");

// The lockdown migration this corrects must still exist and still revoke
// the grant -- this is an additive correction, not an edit to history.
const lockdown = readFileSync(
  new URL("../migrations/20260823120000_lock_public_audit_requests_to_service_role.sql", import.meta.url),
  "utf8",
);
assert.match(lockdown, /revoke\s+select\s*,\s*update/i, "the original lockdown migration must remain unmodified (fix forward, not rewrite history)");

console.log("PASS: authenticated access to public_audit_requests is restored to exactly what the pre-existing, correctly-scoped RLS policies expect, without reintroducing the unscoped USING (true) vulnerability");
