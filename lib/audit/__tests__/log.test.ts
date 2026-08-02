// Run with: node --experimental-strip-types lib/audit/__tests__/log.test.ts
import assert from "node:assert/strict";
import { sanitizeAuditMetadata } from "../log.ts";

function run() {
  const sanitized = sanitizeAuditMetadata({
    missionId: "abc-123",
    accessToken: "super-secret-value",
    RAZORPAY_KEY_SECRET: "another-secret",
    userPassword: "hunter2",
    note: "totally fine text",
    count: 3,
  });

  assert.equal(sanitized.missionId, "abc-123");
  assert.equal(sanitized.note, "totally fine text");
  assert.equal(sanitized.count, 3);
  assert.equal(sanitized.accessToken, "[redacted]");
  assert.equal(sanitized.RAZORPAY_KEY_SECRET, "[redacted]");
  assert.equal(sanitized.userPassword, "[redacted]");

  console.log("log.test.ts: ALL PASS");
}

run();
