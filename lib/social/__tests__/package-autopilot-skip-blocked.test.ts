// Static source-inspection test (package-autopilot.ts has Supabase/queue/
// payments imports and does not resolve standalone under
// `node --experimental-strip-types` -- see package-media.test.ts's header
// for the same constraint on this file). Run with:
//   node --experimental-strip-types lib/social/__tests__/package-autopilot-skip-blocked.test.ts
//
// Real, confirmed dead-end found live (Marketing Creative Quality Test
// mission, 2026-09-06): a BLOCKED queue item (one that permanently
// exhausted its bounded recovery budget) could not be skipped through the
// real product surface at all. Preview and Edit are both correctly
// disabled for BLOCKED in the dashboard, but Skip has no such guard and a
// customer could click it -- it silently failed skipPackageQueueItem's
// status allow-list (BLOCKED was missing), threw "This item can no longer
// be skipped", and surfaced to the customer as the generic, actively
// misleading "Autopilot needs attention. Review its setup and try again."
// -- discarding this exact item's own specific, already-known last_error
// in the process. A real customer whose item got BLOCKED had no self-serve
// way to ever move past it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = fs.readFileSync(path.join(root, "lib/social/package-autopilot.ts"), "utf8");

function testSkipAllowsBlockedItems() {
  const fnStart = source.indexOf("export async function skipPackageQueueItem");
  assert.ok(fnStart >= 0, "skipPackageQueueItem must exist");
  const fnBody = source.slice(fnStart, fnStart + 2500);
  assert.match(
    fnBody,
    /\.in\("status",\s*\[[^\]]*"BLOCKED"[^\]]*\]\)/,
    "skipPackageQueueItem's status guard must include BLOCKED -- otherwise a permanently-exhausted item can never be skipped through the real product surface"
  );
  console.log("package-autopilot-skip-blocked.test.ts: skipPackageQueueItem's allow-list includes BLOCKED — PASS");
}

function run() {
  testSkipAllowsBlockedItems();
  console.log("package-autopilot-skip-blocked.test.ts: ALL PASS");
}

run();
