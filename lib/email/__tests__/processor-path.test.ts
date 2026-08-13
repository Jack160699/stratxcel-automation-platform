// Run with: node --experimental-strip-types lib/email/__tests__/processor-path.test.ts
import assert from "node:assert/strict";
import { resolveEmailProcessorPathAvailable } from "../processor-path.ts";

const fresh = new Date().toISOString();
const stale = new Date(Date.now() - 180_000).toISOString();
const delayed = new Date(Date.now() - 60_000).toISOString();

assert.equal(
  resolveEmailProcessorPathAvailable({ lastHeartbeatAt: fresh, heartbeatStatus: "idle" }),
  true
);
assert.equal(
  resolveEmailProcessorPathAvailable({ lastHeartbeatAt: fresh, heartbeatStatus: "busy" }),
  true
);
assert.equal(
  resolveEmailProcessorPathAvailable({ lastHeartbeatAt: fresh, heartbeatStatus: "degraded" }),
  false
);
assert.equal(
  resolveEmailProcessorPathAvailable({ lastHeartbeatAt: fresh, heartbeatStatus: "unavailable" }),
  false
);
assert.equal(
  resolveEmailProcessorPathAvailable({ lastHeartbeatAt: fresh, heartbeatStatus: "stopped" }),
  false
);
assert.equal(
  resolveEmailProcessorPathAvailable({ lastHeartbeatAt: stale, heartbeatStatus: "idle" }),
  false
);
assert.equal(
  resolveEmailProcessorPathAvailable({ lastHeartbeatAt: delayed, heartbeatStatus: "idle" }),
  false
);
assert.equal(resolveEmailProcessorPathAvailable({ lastHeartbeatAt: null }), false);
assert.equal(
  resolveEmailProcessorPathAvailable({
    lastHeartbeatAt: null,
    processorMode: "http-manual-with-external-scheduler",
  }),
  true
);
assert.equal(
  resolveEmailProcessorPathAvailable({
    lastHeartbeatAt: fresh,
    heartbeatStatus: "idle",
    heartbeatQueryFailed: true,
  }),
  false
);
assert.equal(
  resolveEmailProcessorPathAvailable({
    lastHeartbeatAt: null,
    processorMode: "http-manual-with-external-scheduler",
    heartbeatQueryFailed: true,
  }),
  false
);

console.log("processor-path.test.ts: ALL PASS");
