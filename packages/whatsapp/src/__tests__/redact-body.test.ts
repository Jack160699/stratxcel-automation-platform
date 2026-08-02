// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/redact-body.test.ts
import assert from "node:assert/strict";
import { redactBody } from "../phone-bindings/repository.ts";

function run() {
  const empty = redactBody("");
  assert.equal(empty.excerpt, "");
  assert.equal(empty.length, 0);

  const short = redactBody("hi there");
  assert.equal(short.excerpt, "hi there");
  assert.equal(short.length, 8);

  const long = "x".repeat(500);
  const redacted = redactBody(long);
  assert.equal(redacted.excerpt.length, 24);
  assert.equal(redacted.length, 500);
  assert.ok(!redacted.excerpt.includes(long.slice(30))); // rest of the message never appears

  console.log("redact-body.test.ts (@stratxcel/whatsapp): ALL PASS");
}

run();
