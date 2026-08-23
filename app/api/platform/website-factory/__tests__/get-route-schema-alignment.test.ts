// Regression test for a P1 finding from live E2E testing on 2026-08-23:
// GET /api/platform/website-factory 500'd on every load with "column
// site_projects.framework does not exist". Confirmed via
// information_schema.columns on the live production table: site_projects
// has no "framework" column, and "template" should have been
// "template_id". The domains select had the same drift ("domain" is
// really "domain_name"; "verification_status"/"ssl_status" don't exist on
// domains at all), and domainsRes.error was silently discarded
// (`domains: domainsRes.data ?? []`), so that second broken query would
// have stayed invisible even after fixing the first.
//
// Static source-inspection test (no live Supabase project reachable from
// this environment), matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types app/api/platform/website-factory/__tests__/get-route-schema-alignment.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const routeSource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "route.ts"),
  "utf8"
);

// The route file's own explanatory comment about this historical bug names
// the offending columns (framework, verification_status, ...), which would
// otherwise trip these same assertions against the comment text rather than
// the code. Strip comments first, matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function run() {
  const cleanSource = stripComments(routeSource);
  const getFn = cleanSource.split("export async function GET(request: Request) {")[1]?.split("export async function PATCH")[0] ?? "";
  assert.ok(getFn.length > 0, "could not locate the GET handler in website-factory/route.ts");

  assert.doesNotMatch(getFn, /\bframework\b/, "site_projects has no framework column -- it must not appear in the select");
  assert.doesNotMatch(getFn, /,\s*template\s*,/, 'site_projects has no "template" column -- it is "template_id"');
  assert.match(getFn, /template_id/, "the site_projects select must use the real column name template_id");

  assert.doesNotMatch(getFn, /verification_status/, "domains has no verification_status column");
  assert.doesNotMatch(getFn, /ssl_status/, "domains has no ssl_status column (unlike site_projects, which genuinely has one)");
  assert.match(getFn, /domain:domain_name/, "the domains select must alias the real column domain_name as domain");

  assert.match(
    getFn,
    /if \(domainsRes\.error\) return Response\.json/,
    "domainsRes.error must be checked and surfaced, not silently discarded via `domains: domainsRes.data ?? []`"
  );

  console.log("PASS: website-factory GET route selects only real site_projects/domains columns and surfaces both query errors");
}

run();
