// Run with: node --experimental-strip-types packages/queue/src/__tests__/backoff.test.ts
import assert from "node:assert/strict";
import { computeBackoffSeconds } from "../backoff.ts";

function run() {
  assert.equal(computeBackoffSeconds(0), 30);
  assert.equal(computeBackoffSeconds(1), 30);
  assert.equal(computeBackoffSeconds(2), 60);
  assert.equal(computeBackoffSeconds(3), 120);
  assert.equal(computeBackoffSeconds(4), 240);
  assert.equal(computeBackoffSeconds(7), 1920);
  // Caps at 1 hour regardless of how many attempts
  assert.equal(computeBackoffSeconds(20), 3600);
  assert.equal(computeBackoffSeconds(100), 3600);

  console.log("backoff.test.ts (@stratxcel/queue): ALL PASS");
}

run();
