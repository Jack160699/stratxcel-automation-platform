import assert from "node:assert/strict";
import type { ServiceClient } from "../db.ts";
import { createRazorpayAdapter, IntegrationDisabledError } from "../razorpay/adapter.ts";

const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;
const fakeDb = { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: "shadow-id" }, error: null }) }) }) }) } as unknown as ServiceClient;
const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;

try {
  process.env.RAZORPAY_TEST_KEY_ID = "test-id";
  process.env.RAZORPAY_TEST_KEY_SECRET = "test-secret";
  process.env.RAZORPAY_KEY_ID = "live-id";
  process.env.RAZORPAY_KEY_SECRET = "live-secret";

  for (const mode of ["test", "live"] as const) {
    process.env.RAZORPAY_INTEGRATION_MODE = mode;
    const calls: RequestInit[] = [];
    globalThis.fetch = (async (_url, init) => {
      calls.push(init ?? {});
      return { ok: true, status: 200, json: async () => ({ id: "provider-id", amount: 1000, currency: "INR" }) } as Response;
    }) as typeof fetch;
    const adapter = createRazorpayAdapter(fakeDb);
    await adapter.createOrder({ tenantId: "t", amountCents: 1000 });
    await adapter.createPaymentLink({ tenantId: "t", amountCents: 1000 });
    assert.equal(calls.length, 2);
    const expected = mode === "test" ? basic("test-id", "test-secret") : basic("live-id", "live-secret");
    const forbidden = mode === "test" ? basic("live-id", "live-secret") : basic("test-id", "test-secret");
    for (const call of calls) {
      assert.equal((call.headers as Record<string, string>).Authorization, expected);
      assert.notEqual((call.headers as Record<string, string>).Authorization, forbidden);
    }
  }

  for (const mode of ["disabled", "invalid", "shadow"] as const) {
    process.env.RAZORPAY_INTEGRATION_MODE = mode;
    let fetches = 0;
    globalThis.fetch = (async () => { fetches++; throw new Error("must not fetch"); }) as typeof fetch;
    const adapter = createRazorpayAdapter(fakeDb);
    if (mode === "shadow") {
      await adapter.createOrder({ tenantId: "t", amountCents: 1000 });
      await adapter.createPaymentLink({ tenantId: "t", amountCents: 1000 });
    } else {
      await assert.rejects(() => adapter.createOrder({ tenantId: "t", amountCents: 1000, ...({ mode: "live" } as object) }), IntegrationDisabledError);
      await assert.rejects(() => adapter.createPaymentLink({ tenantId: "t", amountCents: 1000, ...({ mode: "live" } as object) }), IntegrationDisabledError);
    }
    assert.equal(fetches, 0);
  }

  for (const mode of ["test", "live"] as const) {
    process.env.RAZORPAY_INTEGRATION_MODE = mode;
    const secretName = mode === "test" ? "RAZORPAY_TEST_KEY_SECRET" : "RAZORPAY_KEY_SECRET";
    delete process.env[secretName];
    let fetches = 0;
    globalThis.fetch = (async () => { fetches++; throw new Error("must not fetch"); }) as typeof fetch;
    const adapter = createRazorpayAdapter(fakeDb);
    await assert.rejects(() => adapter.createOrder({ tenantId: "t", amountCents: 1000 }), /credentials are missing/);
    await assert.rejects(() => adapter.createPaymentLink({ tenantId: "t", amountCents: 1000 }), /credentials are missing/);
    assert.equal(fetches, 0);
    process.env[secretName] = mode === "test" ? "test-secret" : "live-secret";
  }
  console.log("razorpay-test-mode-isolation.test.ts: ALL PASS");
} finally {
  process.env = savedEnv;
  globalThis.fetch = savedFetch;
}
