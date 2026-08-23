// Regression test for a P1 finding from live E2E testing on 2026-08-23:
// clicking "Save Changes" on the My Shop / Brand settings page always
// failed with 400 "tenantId is required".
//
// POST /api/platform/brand (app/api/platform/brand/route.ts) reads
// tenantId from the JSON body only — `if (!body.tenantId) return 400`
// — unlike its own GET handler, which reads tenantId from the query
// string. page.tsx's save() sent `body: JSON.stringify({ content })`,
// omitting tenantId entirely, so every save on this page 400'd for
// every tenant, confirmed live via runtime logs
// (POST /api/platform/brand 400).
//
// Static source-inspection test (no live Supabase project reachable from
// this environment), matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types app/app/brand/__tests__/save-includes-tenant-id.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = fs.readFileSync(path.join(root, "page.tsx"), "utf8");
const routeSource = fs.readFileSync(path.join(root, "..", "..", "api", "platform", "brand", "route.ts"), "utf8");

function run() {
  // --- The route's POST handler must still require tenantId in the body. -
  assert.match(
    routeSource,
    /if \(!body\.tenantId\) return Response\.json/,
    "route.ts's POST tenantId-in-body requirement changed shape — re-check save()'s payload still satisfies it"
  );

  // --- save() must include tenantId in the POST body it sends. -----------
  const saveFn = pageSource.match(/async function save\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.ok(saveFn.length > 0, "could not locate save() in app/app/brand/page.tsx — check it hasn't been renamed/restructured");
  assert.match(
    saveFn,
    /JSON\.stringify\(\{\s*tenantId,\s*content\s*\}\)/,
    'save() must POST body: JSON.stringify({ tenantId, content }) — omitting tenantId 400s on every save'
  );

  console.log("PASS: Brand page save() includes tenantId in the POST body, matching what the route requires");
}

run();
