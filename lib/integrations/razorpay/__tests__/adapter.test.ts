// Run with: node --experimental-strip-types lib/integrations/razorpay/__tests__/adapter.test.ts
import assert from "node:assert/strict";
import type { createSupabaseServiceClient } from "../../../supabase/service.ts";
import { createRazorpayAdapter, IntegrationDisabledError } from "../adapter.ts";

async function run() {
  delete process.env.RAZORPAY_INTEGRATION_MODE;
  const fakeClient = {} as ReturnType<typeof createSupabaseServiceClient>;

  const adapter = createRazorpayAdapter(fakeClient);
  assert.equal(adapter.mode, "disabled");

  await assert.rejects(
    () => adapter.createOrder({ tenantId: "t1", amountCents: 10000 }),
    IntegrationDisabledError
  );

  console.log("adapter.test.ts (razorpay): ALL PASS");
}

run();
