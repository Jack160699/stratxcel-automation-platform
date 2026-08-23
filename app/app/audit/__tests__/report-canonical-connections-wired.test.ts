// Regression test for a P1 finding from live E2E testing on 2026-08-23:
// the audit report showed "Temporary Error" for Google Search Console,
// GA4, Google Business, Instagram, and Facebook, even though
// social_accounts and search_google_connections were confirmed genuinely
// CONNECTED / HEALTHY in the database (real OAuth tokens, real GA4
// property, real Search Console site).
//
// Root cause: AuditHubClient never fetched canonical connector status
// (lib/connectors/canonical-status.ts via
// /api/platform/integrations/status) and never passed a `connections`
// prop to VisualAuditReport at all. resolveConnectorBadgeKey's own logic
// -- "Canonical DB-truth always wins over a one-off live-data-fetch
// hiccup ... a transient Graph API timeout while generating the report
// must never relabel an actually-connected, healthy account as broken"
// -- was correct, but with `canonical` always undefined it fell through
// to `live?.state`, the audit run's own one-off live-fetch result, every
// single time.
//
// Static source-inspection test (no live Supabase project reachable from
// this environment), matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types app/app/audit/__tests__/report-canonical-connections-wired.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientSource = fs.readFileSync(path.join(root, "AuditHubClient.tsx"), "utf8");

function run() {
  assert.match(
    clientSource,
    /fetch\(`\/api\/platform\/integrations\/status\?tenantId=\$\{encodeURIComponent\(tenantId\)\}`\)/,
    "AuditHubClient must fetch canonical connector status from /api/platform/integrations/status"
  );

  assert.match(
    clientSource,
    /<VisualAuditReport[\s\S]*?connections=\{connections\}/,
    "AuditHubClient must pass a real connections prop to VisualAuditReport, not leave it undefined"
  );

  console.log("PASS: AuditHubClient fetches canonical connector status and passes it to VisualAuditReport");
}

run();
