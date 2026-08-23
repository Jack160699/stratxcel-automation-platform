// Regression test for a P1 finding from live E2E testing on 2026-08-23:
// AuditHubClient's "Start Free Audit" empty-state button POSTed
// { action: "finalize" } to /api/platform/audit/onboarding. That route's
// own guard — `if (!order && action !== "start_fresh") return 404` —
// rejects any action other than "start_fresh" when the tenant has no
// existing audit order, so every tenant with zero audit_orders rows
// (e.g. right after the onboarding-time auto-create silently failed, a
// separate P1 fixed the same day) got a 404 "No Audit in progress" and
// the button never worked. "finalize" is a real, later action in that
// route's state machine — for completing an audit that already has an
// order — not for creating one from a cold start; only "start_fresh"
// calls claim_fresh_product_grant_audit_v1 and triggers automatic audit
// generation.
//
// Static source-inspection test (no live Supabase project reachable from
// this environment), matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types app/app/audit/__tests__/start-audit-action.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientSource = fs.readFileSync(path.join(root, "AuditHubClient.tsx"), "utf8");
const routeSource = fs.readFileSync(
  path.join(root, "..", "..", "api", "platform", "audit", "onboarding", "route.ts"),
  "utf8"
);

function run() {
  // --- The route's cold-start guard must still require start_fresh. ------
  assert.match(
    routeSource,
    /if \(!order && action !== "start_fresh"\)/,
    "route.ts's cold-start guard changed shape — re-check startAudit()'s action still satisfies it"
  );

  // --- startAudit() must send the action that actually creates a fresh
  //     order, not one that only operates on an order that already
  //     exists. -------------------------------------------------------
  const startAuditFn = clientSource.match(/const startAudit = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[load\]\);/)?.[0] ?? "";
  assert.ok(startAuditFn.length > 0, "could not locate startAudit() in AuditHubClient.tsx — check it hasn't been renamed/restructured");
  assert.match(
    startAuditFn,
    /action:\s*"start_fresh"/,
    'startAudit() must POST { action: "start_fresh" } — any other action 404s for a tenant with no existing audit order'
  );
  assert.doesNotMatch(
    startAuditFn,
    /action:\s*"finalize"/,
    'startAudit() must not send { action: "finalize" } — that only completes an audit that already has an order, and 404s from a cold start'
  );

  console.log('PASS: "Start Free Audit" sends action: "start_fresh", matching the route\'s cold-start requirement');
}

run();
