// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/entitlements-derivation.test.ts
import assert from "node:assert/strict";
import type { ServiceClient } from "../db.ts";
import { hasEntitlement, getEntitlementSummary } from "../entitlements.ts";

type Row = { tenant_id: string; metric: string; limit_amount: number; current_usage: number; is_paused: boolean };

/**
 * Minimal fake of the Supabase query-builder chain both functions use.
 * `.select().eq().eq().maybeSingle()` for hasEntitlement, `.select().eq()`
 * (awaited directly) for getEntitlementSummary.
 */
function fakeSupabase(rows: Row[]): ServiceClient {
  const chain = {
    _table: "" as string,
    _filters: {} as Record<string, string>,
    from(table: string) {
      chain._table = table;
      chain._filters = {};
      return chain;
    },
    select() {
      return chain;
    },
    eq(column: string, value: string) {
      chain._filters[column] = value;
      return chain;
    },
    async maybeSingle() {
      const match = rows.find((r) => r.tenant_id === chain._filters.tenant_id && r.metric === chain._filters.metric);
      return { data: match ?? null, error: null };
    },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      const matches = rows.filter((r) => (chain._filters.tenant_id ? r.tenant_id === chain._filters.tenant_id : true));
      resolve({ data: matches, error: null });
    },
  };
  return chain as unknown as ServiceClient;
}

async function run() {
  const rows: Row[] = [
    { tenant_id: "t1", metric: "social_posts", limit_amount: 12, current_usage: 10, is_paused: false },
    { tenant_id: "t1", metric: "meta_ad_campaigns", limit_amount: 1, current_usage: 1, is_paused: false },
    { tenant_id: "t1", metric: "whatsapp_contacts", limit_amount: 500, current_usage: 50, is_paused: true },
  ];
  const supabase = fakeSupabase(rows);

  // --- 1. Within limit -> has capacity -----------------------------------
  assert.equal(await hasEntitlement(supabase, "t1", "social_posts", 1), true, "10/12 used, 1 more must be allowed");
  assert.equal(await hasEntitlement(supabase, "t1", "social_posts", 3), false, "10 + 3 > 12 must be denied");

  // --- 2. Exactly at limit -> next unit denied ----------------------------
  assert.equal(await hasEntitlement(supabase, "t1", "meta_ad_campaigns", 1), false, "1/1 used must deny one more");

  // --- 3. Paused entitlement always denies, even under the limit ---------
  assert.equal(await hasEntitlement(supabase, "t1", "whatsapp_contacts", 1), false, "is_paused must deny regardless of remaining capacity");

  // --- 4. No row for the tenant/metric -> fails closed --------------------
  assert.equal(await hasEntitlement(supabase, "t1", "website_maintenance", 1), false, "missing entitlement row must fail closed, not open");
  assert.equal(await hasEntitlement(supabase, "unknown-tenant", "social_posts", 1), false, "unknown tenant must fail closed");

  // --- 5. Cross-tenant isolation: t2's check never sees t1's rows --------
  assert.equal(await hasEntitlement(supabase, "t2", "social_posts", 1), false, "a different tenant must never inherit t1's entitlement row");

  // --- 6. Summary reflects remaining/capacity correctly -------------------
  const summary = await getEntitlementSummary(supabase, "t1");
  assert.equal(summary.length, 3);
  const posts = summary.find((s) => s.metric === "social_posts")!;
  assert.equal(posts.remaining, 2);
  assert.equal(posts.hasCapacity, true);
  const whatsapp = summary.find((s) => s.metric === "whatsapp_contacts")!;
  assert.equal(whatsapp.hasCapacity, false, "paused metric must report no capacity even with remaining units");

  console.log("entitlements-derivation.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
