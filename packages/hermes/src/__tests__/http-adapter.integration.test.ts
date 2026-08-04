// Opt-in only — skipped by default. Requires a real Hermes instance and
// never runs as part of `npm run test:foundation` or CI. To run against a
// local Hermes Runs API (e.g. the patched launcher described in
// docs/hermes/RECONCILIATION.md):
//
//   HERMES_INTEGRATION_TEST=1 HERMES_MODE=http HERMES_BASE_URL=http://127.0.0.1:18642 \
//   HERMES_API_KEY=<API_SERVER_KEY> \
//   node --experimental-strip-types packages/hermes/src/__tests__/http-adapter.integration.test.ts
//
// Deliberately does not submit a real mission — healthCheck/getCapabilities
// only, so this never requires quota or leaves a run behind. Never retries
// on 429/503; a single failure is reported and the test exits non-zero.
import assert from "node:assert/strict";
import { createHermesHttpAdapter } from "../http-adapter.ts";
import { loadHermesRuntimeConfig } from "../config.ts";

async function run() {
  if (process.env.HERMES_INTEGRATION_TEST !== "1") {
    console.log("http-adapter.integration.test.ts (@stratxcel/hermes): SKIPPED (set HERMES_INTEGRATION_TEST=1 to run)");
    return;
  }

  const config = loadHermesRuntimeConfig();
  assert.equal(config.mode, "http", "HERMES_MODE must be 'http' to run this test");

  const adapter = createHermesHttpAdapter(config);

  const health = await adapter.healthCheck();
  assert.ok(["ok", "degraded"].includes(health.status), `unexpected health status: ${health.status}`);

  const capabilities = await adapter.getCapabilities();
  assert.ok(capabilities && typeof capabilities === "object");

  console.log("http-adapter.integration.test.ts (@stratxcel/hermes): ALL PASS (live Hermes instance)");
}

run().catch((err) => {
  console.error("http-adapter.integration.test.ts (@stratxcel/hermes): FAIL", err);
  process.exitCode = 1;
});
