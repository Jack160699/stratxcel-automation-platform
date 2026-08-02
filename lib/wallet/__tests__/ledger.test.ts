// Run with: node --experimental-strip-types lib/wallet/__tests__/ledger.test.ts
import assert from "node:assert/strict";
import { assertValidLedgerAmount } from "../ledger.ts";

function run() {
  // Positive-direction entry types reject negative amounts
  assert.throws(() => assertValidLedgerAmount("credit_purchase", -100));
  assert.doesNotThrow(() => assertValidLedgerAmount("credit_purchase", 100));
  assert.doesNotThrow(() => assertValidLedgerAmount("reservation_release", 500));
  assert.doesNotThrow(() => assertValidLedgerAmount("refund", 200));

  // Negative-direction entry types reject positive amounts
  assert.throws(() => assertValidLedgerAmount("reservation", 100));
  assert.doesNotThrow(() => assertValidLedgerAmount("reservation", -100));
  assert.doesNotThrow(() => assertValidLedgerAmount("debit_usage", -50));

  // adjustment is the one type allowed either sign
  assert.doesNotThrow(() => assertValidLedgerAmount("adjustment", 100));
  assert.doesNotThrow(() => assertValidLedgerAmount("adjustment", -100));

  console.log("ledger.test.ts: ALL PASS");
}

run();
