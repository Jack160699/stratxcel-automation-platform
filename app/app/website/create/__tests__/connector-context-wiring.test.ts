// Regression test for a P1 finding from live E2E testing on 2026-08-23:
// this page fetches the tenant's real Brand Brain data (for the Step 2
// pre-fill form) but never forwarded any of it into <SmartWebsiteCreator>,
// which accepts a connectorContext prop specifically so the AI builder can
// resolve the real business name instead of guessing one from free text.
// Every website generated through this page therefore never knew the
// tenant's actual business name.
//
// Static source-inspection test, matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts and
// app/api/platform/website-factory/__tests__/get-route-schema-alignment.test.ts.
// Run with: node --experimental-strip-types app/app/website/create/__tests__/connector-context-wiring.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const pageSource = stripComments(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "page.tsx"),
    "utf8"
  )
);

function run() {
  assert.match(
    pageSource,
    /const connectorContext[^=]*=\s*\{/,
    "page must build a connectorContext object from the Brand Brain data it already fetches"
  );
  assert.match(
    pageSource,
    /brandBrain:\s*\{[^}]*businessName/s,
    "connectorContext must carry the real businessName through to brandBrain"
  );

  const creatorUsage = pageSource.split("<SmartWebsiteCreator")[1]?.split("/>")[0] ?? "";
  assert.ok(creatorUsage.length > 0, "could not locate the <SmartWebsiteCreator ... /> usage");
  assert.match(
    creatorUsage,
    /connectorContext=\{connectorContext\}/,
    "<SmartWebsiteCreator> must actually receive the connectorContext prop, not just have one built and discarded"
  );

  console.log("PASS: create/page.tsx wires real Brand Brain data into SmartWebsiteCreator's connectorContext");
}

run();
