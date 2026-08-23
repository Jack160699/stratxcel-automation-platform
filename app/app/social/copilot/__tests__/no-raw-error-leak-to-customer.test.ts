// Regression test for a P1 finding from live E2E testing on 2026-08-23
// (Content Quality pass): when a Growth Assistant turn failed, the chat
// bubble rendered `I hit an error and couldn't finish: ${result.reason}` --
// the orchestrator's raw internal failure code ("empty_turn_output") or, on
// an unexpected exception, the raw Error.message, which orchestrator.ts's
// own comment explicitly warns "may be a DB error, a provider SDK message,
// or an infra leak (RLS/service-role internals)". The orchestrator already
// computes a sanitized, customer-appropriate message via customerSafeError()
// and returns it as result.text -- but the frontend built its own message
// from result.reason instead, bypassing that sanitization entirely, and
// violating the mission's "translate technical failures into customer
// language" requirement (a raw code like "empty_turn_output" answers none
// of: what happened, why it matters, what to do).
//
// Static source-inspection test, matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types app/app/social/copilot/__tests__/no-raw-error-leak-to-customer.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = [
  path.join(dir, "..", "useTenantAgentSession.ts"),
  path.join(dir, "..", "..", "..", "..", "admin", "(shell)", "social", "copilot", "useAgentSession.ts"),
];

function run() {
  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    const failedBlock = src.split('"failed" in result && result.failed')[1]?.split(/\n\s*\}\n/)[0] ?? "";
    assert.ok(failedBlock.length > 0, `could not locate the failed-run handling block in ${file}`);

    assert.doesNotMatch(
      failedBlock,
      /I hit an error and couldn't finish/,
      `${file}: must not build a message that echoes the raw internal reason code/exception text`
    );
    assert.doesNotMatch(
      failedBlock,
      /result\.reason/,
      `${file}: must not use the orchestrator's raw, unsanitized reason field for anything shown to the user`
    );
    assert.match(
      failedBlock,
      /result\.text/,
      `${file}: must use result.text, the orchestrator's already-sanitized customer-safe message`
    );
  }

  console.log("PASS: Growth Assistant failure states use the sanitized message, never the raw internal reason/exception text");
}

run();
