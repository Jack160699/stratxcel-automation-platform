// Regression test for a P2 finding from live E2E testing on 2026-08-23
// (SEO/LEO pass): the Growth page's 4 independent data sources (missions,
// approvals, wallet, audit) were fetched with sequential `await` calls one
// after another instead of concurrently, even though none of them depend
// on another's result. Live-measured: each individual call took ~1.1-1.8s,
// but the page's loading skeleton stayed up for ~5.5-9s (their sum) instead
// of ~1.8s (the slowest one) -- long enough that a real customer could
// reasonably believe the page was permanently stuck rather than just slow.
//
// Static source-inspection test, matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types app/app/growth/__tests__/parallel-data-loading.test.ts
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
  const loadDataBlock = src.split("const loadData = useCallback(async (tId: string) => {")[1]?.split("}, []);")[0] ?? "";
  assert.ok(loadDataBlock.length > 0, "could not locate the loadData function body");

  assert.match(
    loadDataBlock,
    /await Promise\.all\(\[/,
    "the 4 independent data loaders must run concurrently via Promise.all, not one after another"
  );

  // Each loader must still be present and still handle its own failure
  // gracefully (Promise.all must not turn one loader's rejection into a
  // hard failure for the other three) -- confirm each fetch call is still
  // wrapped in its own try/catch inside the Promise.all array, not bare.
  const fetchCalls = [...loadDataBlock.matchAll(/await fetch\(`\/api\/platform\/(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(
    fetchCalls.sort(),
    ["approvals", "audit", "missions", "wallet"],
    "all 4 original data sources must still be fetched"
  );
  const tryCount = (loadDataBlock.match(/\btry\s*\{/g) ?? []).length;
  assert.ok(tryCount >= 4, `expected each of the 4 loaders to keep its own try/catch (found ${tryCount} try blocks) -- Promise.all must not remove per-loader fault isolation`);

  console.log("PASS: Growth page's 4 independent data loaders run concurrently, each still isolated from the others' failures");
}

run();
