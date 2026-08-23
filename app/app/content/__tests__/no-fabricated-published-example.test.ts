// Regression test for a P1 finding from live E2E testing on 2026-08-23:
// the Content & Media page's starter/example creatives (injected whenever
// a tenant has fewer than 5 real items -- true for every brand-new
// tenant) included one item claiming category: "published",
// status: "PUBLISHED", a publishedAt timestamp, and fabricated metrics
// (reach: 840, engagement: 62, impressions: 1120) -- for a tenant with
// zero rows in content_master, i.e. nothing was ever actually published
// or measured. A real customer's first visit to their Content page would
// see what looks like a live Instagram post already getting real
// engagement.
//
// Static source-inspection test (no live Supabase project reachable from
// this environment), matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types app/app/content/__tests__/no-fabricated-published-example.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rawSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "page.tsx"),
  "utf8"
);
// Strip comments first -- this file's own explanatory comment about the bug
// this test guards against literally contains the strings being asserted
// against, matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
const src = rawSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function run() {
  // Isolate the "starter curated creatives" block (the items only ever
  // pushed when the tenant has no real content) so a future real,
  // genuinely-published item elsewhere in the file can't produce a false
  // positive here.
  const starterBlock = src.split('id: "starter-festive"')[1] ?? "";
  assert.ok(starterBlock.length > 0, "could not locate the starter curated creatives block in page.tsx");

  assert.doesNotMatch(
    starterBlock,
    /category:\s*"published"/,
    'no starter/example content item may claim category: "published" -- none of them were ever actually published'
  );
  assert.doesNotMatch(
    starterBlock,
    /status:\s*"PUBLISHED"/,
    'no starter/example content item may claim status: "PUBLISHED"'
  );
  assert.doesNotMatch(
    starterBlock,
    /publishedAt:/,
    "no starter/example content item may carry a publishedAt timestamp -- nothing was actually published"
  );
  assert.doesNotMatch(
    starterBlock,
    /metrics:\s*\{/,
    "no starter/example content item may carry fabricated engagement metrics -- nothing was ever measured"
  );

  console.log("PASS: no starter/example content item fabricates a published state or engagement metrics");
}

run();
