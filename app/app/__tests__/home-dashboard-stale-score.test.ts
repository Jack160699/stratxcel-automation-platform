// Regression test for a P1 finding from live E2E testing on 2026-08-23
// (Connectors pass): the Home dashboard showed "Online Health 0/100 · At
// risk" directly next to "Connected sources: 7" and the sidebar's "Live on
// Google & WhatsApp" badge -- a real tenant with 5 of 7 sources genuinely
// connected saw a score and "Today's Priorities" (e.g. "Connect Primary
// Digital Data Sources") both frozen from audit-generation time, before
// those connections existed. Same defect class as the Audit report page's
// stale-connector contradiction (VisualAuditReport.tsx), on a second,
// even more prominent surface -- the first thing a customer sees.
//
// Static source-inspection test, matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types app/app/__tests__/home-dashboard-stale-score.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const src = stripComments(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "page.tsx"),
    "utf8"
  )
);

function run() {
  assert.match(
    src,
    /const scoreIsStale = Boolean\(/,
    "must compute whether the audit score/opportunities predate a connector that's since come online"
  );
  assert.match(
    src,
    /status\.connectionState !== "CONNECTED"/,
    "staleness check must compare against live canonical connection state, not the frozen report snapshot"
  );

  // Both dashboard variants must receive and honor the flag.
  for (const componentName of ["FreeUserDashboard", "SubscribedUserDashboard"]) {
    const fnBlock = src.split(`function ${componentName}(`)[1]?.split(/\nfunction [A-Z]/)[0] ?? "";
    assert.ok(fnBlock.length > 0, `could not locate ${componentName}`);
    assert.match(fnBlock, /scoreIsStale/, `${componentName} must accept and use scoreIsStale`);
    assert.match(
      fnBlock,
      /scoreIsStale \? <StaleScoreIndicator \/> : <ScoreRing|scoreIsStale \? \(/,
      `${componentName} must not render the numeric ScoreRing when the score is stale`
    );
  }

  // A stale score's own opportunities (e.g. "Connect Primary Digital Data
  // Sources" for sources that are now actually connected) must not be shown.
  assert.match(
    src,
    /scoreIsStale \? \[\] : \(report\?\.opportunities/,
    "opportunities must be suppressed, not just the score, when the report predates current connections"
  );

  console.log("PASS: Home dashboard suppresses its stale health score and opportunities instead of contradicting live connector state");
}

run();
