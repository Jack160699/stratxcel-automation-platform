// Regression test for a P1 finding from live E2E testing on 2026-08-23:
// the Growth Assistant told a tenant with a genuinely CONNECTED Google
// Business Profile (social_accounts row: platform='google_business',
// status='CONNECTED') to "Connect Google Business Profile" as its #1
// weekly recommendation.
//
// Root cause: prepareWeekPlan checked
// accounts.some(a => a.platform === "google" && a.status === "CONNECTED"),
// but social_accounts never stores platform === "google" for this
// connector -- the real value is "google_business" (confirmed live via a
// direct query). "google" alone can never match, so googleConnected was
// always false regardless of real connection state.
//
// Static source-inspection test (no live Supabase project reachable from
// this environment), matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types lib/social/agent/__tests__/plan-growth-google-connected-check.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "plan-growth-intent.ts"),
  "utf8"
);

function run() {
  assert.doesNotMatch(
    src,
    /const googleConnected = accounts\.some\(\(a\) => a\.platform === "google" && a\.status === "CONNECTED"\);/,
    'googleConnected must not check platform === "google" alone -- social_accounts stores "google_business" for this connector, so that check can never match a real row'
  );
  assert.match(
    src,
    /a\.platform === "google_business" \|\| a\.platform === "google"/,
    'googleConnected must check platform === "google_business" (the real stored value), with "google" kept only as a fallback'
  );

  console.log('PASS: Growth Assistant\'s googleConnected check matches the real social_accounts platform value ("google_business")');
}

run();
