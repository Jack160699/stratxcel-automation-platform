// Regression test for a P1 finding from live E2E testing on 2026-08-23:
// four sections of the free Search Growth OS audit report fabricated
// content whenever the backend had no real data, instead of the honest
// "not enough data" empty state the report already uses correctly for
// Search Console/GA4.
//
// Confirmed on a real completed run (audit_generation_runs.status =
// COMPLETED, quality_outcome = PASS) via
// audit_generation_runs.report_data: technicalSeoFindings,
// contentCoverage, aiSearchReadiness, and whyTheyWin were all genuinely
// null (matching the report's own executive summary: "zero grounded
// evidence sources ... category scores cannot be calculated and are
// marked as null"). Despite that, the UI rendered:
//   - a hardcoded "topcompetitor.in / Market Leader" competitor styled
//     as a real HIGH CONFIDENCE finding
//   - Technical SEO "Score: 78/100" with static checklist bullets
//   - AI Search (AEO) "Readiness: 65/100" with static checklist bullets
//   - static "Content & Keywords" gap bullets
// identically for every business, every audit -- content that "could
// have been generated for any business" is exactly what the mission
// brief calls hallucination.
//
// Static source-inspection test (no live Supabase project reachable from
// this environment), matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types app/app/audit/__tests__/visual-report-no-fabricated-findings.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "VisualAuditReport.tsx"), "utf8");

function run() {
  // --- The fabricated placeholder competitor must never reappear. -------
  assert.ok(!src.includes("topcompetitor.in"), 'the hardcoded fallback competitor "topcompetitor.in" must not reappear');
  assert.doesNotMatch(
    src,
    /const competitorsList = report\.whyTheyWin && report\.whyTheyWin\.length > 0\s*\?\s*report\.whyTheyWin\s*:\s*\[/,
    "competitorsList must not fall back to a hardcoded mock array when whyTheyWin is empty"
  );

  // --- No more hardcoded numeric score fallbacks for these two cards. ----
  assert.doesNotMatch(src, /technicalSeoFindings\?\.score\s*\?\?\s*78/, "Technical SEO score must not fall back to a hardcoded 78");
  assert.doesNotMatch(src, /aiSearchReadiness\?\.citationScore\s*\?\?\s*65/, "AEO readiness score must not fall back to a hardcoded 65");

  // --- The static, always-shown checklist bullets must be gone. Each was
  //     shown for every business regardless of real findings. -----------
  const fabricatedBullets = [
    "HTTPS & Canonical safety verified",
    "Sitemap & Robots.txt accessible",
    "JSON-LD structured data missing on subpages",
    "Missing dedicated service landing pages",
    "Low word-count on secondary pages",
    "Primary brand terms rank #1",
    "Core business NAP consistency verified",
    "FAQ schema citations needed for LLM answers",
    "Public brand mentions discoverable",
  ];
  for (const bullet of fabricatedBullets) {
    assert.ok(!src.includes(bullet), `hardcoded generic finding "${bullet}" must not appear as static report content`);
  }

  // --- Each of the four sections must have an honest empty-state message
  //     for when its backing data is genuinely absent. -------------------
  assert.match(src, /Not enough verified data yet to run a technical crawl/, "Technical SEO needs an honest empty state");
  assert.match(src, /Not enough verified data yet to map content gaps/, "Content & Keywords needs an honest empty state");
  assert.match(src, /Not enough verified data yet to score AI-search readiness/, "AEO needs an honest empty state");
  assert.match(src, /Not enough verified data to name specific competitors yet/, "Competitive Intelligence needs an honest empty state");

  console.log("PASS: audit report shows honest empty states instead of fabricated findings when report_data is null");
}

run();
