// Regression test for a P1 finding from live E2E testing on 2026-08-23
// (SEO/audit system pass): a real tenant with Google Search Console, GA4,
// Google Business, Instagram, Facebook, and YouTube all genuinely CONNECTED
// (confirmed live against production data) saw their own audit report's
// "Data Used In This Audit" panel correctly show every one of those as
// Connected -- directly above an Executive Summary reading "zero grounded
// evidence sources... category scores cannot be calculated", an Authority
// Score of 0/100, "Google Search Console is not connected yet", and a
// paid-plan-locked upsell to "Connect Primary Digital Data Sources" they
// had already connected.
//
// Root cause: the "Data Used" badges (fixed in an earlier pass, see
// resolveConnectorBadgeKey) correctly use live canonical connector truth,
// but the executive summary/score/opportunities text is frozen at
// generation time from report.connectorAvailability -- a snapshot that, for
// this tenant, was taken while a since-fixed OAuth token-persistence bug
// meant the connections genuinely couldn't be used yet. Nothing reconciled
// the two, so the live badges and the frozen findings silently contradicted
// each other with no explanation.
//
// Static source-inspection test, matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types app/app/audit/__tests__/visual-report-stale-connector-notice.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = stripComments(fs.readFileSync(path.join(root, "VisualAuditReport.tsx"), "utf8"));

function run() {
  assert.match(
    src,
    /const staleConnectorLabels = ALL_CONNECTOR_PROVIDERS\.filter/,
    "must compute which connectors are canonically CONNECTED but weren't actually used to generate this report's stored findings"
  );
  assert.match(
    src,
    /canonical\?\.connectionState !== "CONNECTED"/,
    "staleness check must key off live canonical connection state, not the frozen report snapshot"
  );

  const bannerBlock = src.split("staleConnectorLabels.length > 0")[1]?.split("EXECUTIVE VERDICT")[0] ?? "";
  assert.ok(bannerBlock.length > 0, "could not locate the stale-connector notice banner");
  assert.match(
    bannerBlock,
    /connected after this audit ran/,
    "the banner must honestly explain that these connectors postdate the report, not silently show contradictory numbers"
  );

  // The CTA must not promise a self-service refresh that 409s for exactly
  // the customers who need it (free-audit re-runs are gated to one grant
  // per tenant via claim_fresh_product_grant_audit_v1) -- it must route to
  // a real, always-working channel instead.
  assert.doesNotMatch(
    bannerBlock,
    />\s*Request a refreshed audit/,
    "must not promise a specific self-service refresh action that can fail for tenants who already used their free-audit grant"
  );
  assert.match(bannerBlock, /wa\.me/, "the banner's CTA must route to a real, always-working support channel");

  console.log("PASS: the audit report honestly flags findings that predate a now-connected connector, instead of silently contradicting its own live connector badges");
}

run();
