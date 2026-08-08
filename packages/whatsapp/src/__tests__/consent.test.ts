// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/consent.test.ts
import assert from "node:assert/strict";
import type { ServiceClient } from "../db.ts";
import { hasMarketingConsent } from "../consent.ts";

type Row = { opted_in: boolean; opted_out_at: string | null };

function fakeSupabase(row: Row | null, opts: { fail?: boolean } = {}): ServiceClient {
  const chain = {
    from(_table: string) {
      return chain;
    },
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    async maybeSingle() {
      if (opts.fail) return { data: null, error: { message: "connection refused" } };
      return { data: row, error: null };
    },
  };
  return chain as unknown as ServiceClient;
}

async function run() {
  // --- 1. No consent row at all -> fail closed (not consented) -----------
  assert.equal(await hasMarketingConsent(fakeSupabase(null), "t1", "l1"), false);

  // --- 2. Explicit opted_in with no opt-out -> consented ------------------
  assert.equal(await hasMarketingConsent(fakeSupabase({ opted_in: true, opted_out_at: null }), "t1", "l1"), true);

  // --- 3. Opted in but later opted out -> not consented, opt-out wins -----
  assert.equal(await hasMarketingConsent(fakeSupabase({ opted_in: true, opted_out_at: "2026-08-01T00:00:00Z" }), "t1", "l1"), false);

  // --- 4. opted_in explicitly false -> not consented ----------------------
  assert.equal(await hasMarketingConsent(fakeSupabase({ opted_in: false, opted_out_at: null }), "t1", "l1"), false);

  // --- 5. A DB read failure -> fail closed, never treated as consented ---
  assert.equal(await hasMarketingConsent(fakeSupabase(null, { fail: true }), "t1", "l1"), false);

  console.log("consent.test.ts (@stratxcel/whatsapp): ALL PASS");
}

run();
