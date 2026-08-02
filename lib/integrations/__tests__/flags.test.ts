// Run with: node --experimental-strip-types lib/integrations/__tests__/flags.test.ts
import assert from "node:assert/strict";
import { getIntegrationMode } from "../flags.ts";

function run() {
  delete process.env.TEST_INTEGRATION_MODE;
  assert.equal(getIntegrationMode("TEST_INTEGRATION_MODE"), "disabled");

  process.env.TEST_INTEGRATION_MODE = "shadow";
  assert.equal(getIntegrationMode("TEST_INTEGRATION_MODE"), "shadow");

  process.env.TEST_INTEGRATION_MODE = "live";
  assert.equal(getIntegrationMode("TEST_INTEGRATION_MODE"), "live");

  // Garbage values fail safe to "disabled" rather than throwing or defaulting to "live"
  process.env.TEST_INTEGRATION_MODE = "yolo";
  assert.equal(getIntegrationMode("TEST_INTEGRATION_MODE"), "disabled");

  delete process.env.TEST_INTEGRATION_MODE;
  console.log("flags.test.ts: ALL PASS");
}

run();
