// Static check that every Owner Operating Brain API route file actually
// gates on an auth mechanism appropriate to its caller — an admin-owner
// session (requireOwnerContext), a Vercel Cron secret (CRON_SECRET), or a
// paired-device bearer token (authenticateDevice) — rather than being
// silently reachable by anyone. A new route added without one of these
// fails this test loudly instead of shipping an open endpoint.
// Run with: node --experimental-strip-types lib/owner-brain/__tests__/route-auth-coverage.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.resolve(__dirname, "../../../app/api/admin/operating-brain");

// The device-pairing completion route is deliberately unauthenticated by
// session/cron/bearer — the one-time pairing code IS its credential
// (verified inside completeDevicePairing, which rejects on any mismatch).
const PAIRING_CODE_IS_THE_CREDENTIAL = new Set(["devices/pair/route.ts"]);

const AUTH_MARKERS = [
  "requireOwnerContext",
  "requireOperatingBrainApiAccess",
  "requireReleaseAccessApi",
  "CRON_SECRET",
  "authenticateDevice",
];

function listRouteFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listRouteFiles(full, base));
    else if (entry.name === "route.ts") out.push(path.relative(base, full).replace(/\\/g, "/"));
  }
  return out;
}

function run() {
  const routeFiles = listRouteFiles(routesDir);
  assert.ok(routeFiles.length >= 10, `expected at least 10 route.ts files, found ${routeFiles.length}`);

  const failures: string[] = [];
  for (const relPath of routeFiles) {
    if (PAIRING_CODE_IS_THE_CREDENTIAL.has(relPath)) continue;
    const source = fs.readFileSync(path.join(routesDir, relPath), "utf8");
    const hasAuthMarker = AUTH_MARKERS.some((marker) => source.includes(marker));
    if (!hasAuthMarker) failures.push(relPath);
  }

  assert.deepEqual(failures, [], `routes with no recognizable auth guard:\n${failures.join("\n")}`);

  console.log(`route-auth-coverage.test.ts (owner-brain): checked ${routeFiles.length} route files — ALL PASS`);
}

run();
