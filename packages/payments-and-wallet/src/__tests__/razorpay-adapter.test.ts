// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/razorpay-adapter.test.ts
import assert from "node:assert/strict";
import type { ServiceClient } from "../db.ts";
import { createRazorpayAdapter, IntegrationDisabledError } from "../razorpay/adapter.ts";

async function run() {
  delete process.env.RAZORPAY_INTEGRATION_MODE;
  const fakeClient = {} as ServiceClient;

  const adapter = createRazorpayAdapter(fakeClient);
  assert.equal(adapter.mode, "disabled");

  await assert.rejects(() => adapter.createOrder({ tenantId: "t1", amountCents: 10000 }), IntegrationDisabledError);

  console.log("razorpay-adapter.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
