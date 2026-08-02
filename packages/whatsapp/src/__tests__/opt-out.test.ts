// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/opt-out.test.ts
import assert from "node:assert/strict";
import { isOptOutMessage } from "../conversation/opt-out.ts";

function run() {
  assert.equal(isOptOutMessage("STOP"), true);
  assert.equal(isOptOutMessage("stop"), true);
  assert.equal(isOptOutMessage("unsubscribe"), true);
  assert.equal(isOptOutMessage("opt out"), true);
  assert.equal(isOptOutMessage("Please do not message me again"), true);

  // Real questions must never be misclassified as opt-outs
  assert.equal(isOptOutMessage("Can you stop by our office tomorrow?"), false);
  assert.equal(isOptOutMessage("I want to cancel my old plan and upgrade"), false);
  assert.equal(isOptOutMessage("Hi, I need a website"), false);
  assert.equal(isOptOutMessage(""), false);

  console.log("opt-out.test.ts (@stratxcel/whatsapp): ALL PASS");
}

run();
