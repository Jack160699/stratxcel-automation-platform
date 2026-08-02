// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/ledger.test.ts
import assert from "node:assert/strict";
import { assertValidLedgerAmount } from "../wallet/ledger.ts";

function run() {
  assert.throws(() => assertValidLedgerAmount("credit_purchase", -100));
  assert.doesNotThrow(() => assertValidLedgerAmount("credit_purchase", 100));
  assert.doesNotThrow(() => assertValidLedgerAmount("reservation_release", 500));
  assert.doesNotThrow(() => assertValidLedgerAmount("refund", 200));

  assert.throws(() => assertValidLedgerAmount("reservation", 100));
  assert.doesNotThrow(() => assertValidLedgerAmount("reservation", -100));
  assert.doesNotThrow(() => assertValidLedgerAmount("debit_usage", -50));

  assert.doesNotThrow(() => assertValidLedgerAmount("adjustment", 100));
  assert.doesNotThrow(() => assertValidLedgerAmount("adjustment", -100));

  console.log("ledger.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
