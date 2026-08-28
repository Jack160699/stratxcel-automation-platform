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
// STRATXCEL DASHBOARD UI ALIGNMENT & REAL CONTENT PIPELINE BINDING
// (2026-08-28) removed the entire "starter curated creatives" mechanism
// this test used to isolate and inspect -- the page now renders only real
// image_generation_jobs/social_media_assets records, and a tenant with
// none gets ContentLibraryClient's own honest empty state instead of any
// synthetic example content. That's a strictly stronger fix than patching
// the fabricated fields (there's no longer any mock item that COULD
// fabricate a published state, metrics, or an unverified review claim),
// so this test now asserts the mechanism is gone entirely rather than
// inspecting fields on a block that no longer exists.
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
// Strip comments first -- this file's own explanatory comments about the
// bug this test guards against literally contain the strings being
// asserted against, matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
const src = rawSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function run() {
  // The starter/example fallback mechanism itself must be gone -- not
  // patched, removed. A brand-new tenant with zero real generations must
  // never see synthetic example content standing in for real content.
  for (const removedId of ['id: "starter-festive"', 'id: "starter-review"', 'id: "starter-reel"', 'id: "starter-caption"']) {
    assert.doesNotMatch(src, new RegExp(removedId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `the starter/example fallback item (${removedId}) must not exist -- a tenant with no real content gets a real empty state, never synthetic example content`);
  }
  assert.doesNotMatch(src, /generatePosterSvg/, "the mock SVG poster generator must not exist -- content previews must come from real generated/uploaded media");

  // No literal fabricated-published fields can exist anywhere in the file
  // once the mechanism that produced them is gone.
  assert.doesNotMatch(src, /publishedAt:\s*new Date/, "no item may be constructed with a fabricated publishedAt timestamp");
  assert.doesNotMatch(src, /metrics:\s*\{\s*reach:/, "no item may be constructed with fabricated engagement metrics");

  // No unverified-claim placeholder templates can exist either, now that
  // the review-spotlight starter item that carried them is gone.
  assert.doesNotMatch(src, /Thank you to (all )?our (wonderful )?customers for the love and 5-star reviews on Google Maps/, "no unverified 5-star Google review claim may exist anywhere in the page");
  assert.doesNotMatch(src, /\[Add your custom(er's)? words? here\]/i, "no bracket-placeholder template string may exist in the page's own source");

  // The real data path this page now uses instead must actually be present.
  assert.match(src, /image_generation_jobs/, "the page must query real image_generation_jobs records");
  assert.match(src, /loadTenantMedia/, "the page must still resolve real uploaded/generated media assets");

  console.log("PASS: the starter/example content mechanism is fully removed -- no item can fabricate a published state, engagement metrics, or an unverified review claim, because no synthetic item exists at all");
}

run();
