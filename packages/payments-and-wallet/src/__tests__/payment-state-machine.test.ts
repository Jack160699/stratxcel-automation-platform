// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/payment-state-machine.test.ts
import assert from "node:assert/strict";
import {
  canTransitionPayment,
  assertPaymentTransition,
  isTerminalPaymentState,
  InvalidPaymentTransitionError,
} from "../razorpay/payment-state-machine.ts";

function run() {
  assert.equal(canTransitionPayment("CREATED", "AUTHORIZED"), true);
  assert.equal(canTransitionPayment("AUTHORIZED", "CAPTURED"), true);
  assert.equal(canTransitionPayment("CAPTURED", "REFUNDED"), true);
  assert.equal(canTransitionPayment("CAPTURED", "PARTIALLY_REFUNDED"), true);
  assert.equal(canTransitionPayment("PARTIALLY_REFUNDED", "REFUNDED"), true);
  assert.equal(canTransitionPayment("CREATED", "FAILED"), true);
  assert.equal(canTransitionPayment("AUTHORIZED", "FAILED"), true);

  // Cannot skip straight from CREATED to CAPTURED
  assert.equal(canTransitionPayment("CREATED", "CAPTURED"), false);
  // Cannot un-fail or un-refund
  assert.equal(canTransitionPayment("FAILED", "CAPTURED"), false);
  assert.equal(canTransitionPayment("REFUNDED", "CAPTURED"), false);

  assert.equal(isTerminalPaymentState("FAILED"), true);
  assert.equal(isTerminalPaymentState("REFUNDED"), true);
  assert.equal(isTerminalPaymentState("CAPTURED"), false);

  assert.throws(() => assertPaymentTransition("CREATED", "CAPTURED"), InvalidPaymentTransitionError);
  assert.doesNotThrow(() => assertPaymentTransition("CREATED", "AUTHORIZED"));

  console.log("payment-state-machine.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
