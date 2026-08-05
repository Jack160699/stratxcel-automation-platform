// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/razorpay-reconciliation.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ServiceClient } from "../db.ts";
import { reconcilePaymentLink } from "../razorpay/payment-links.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

async function testReconcilePaymentLinkUnitTests() {
  process.env.RAZORPAY_KEY_ID = "rzp_live_test_key_123";
  process.env.RAZORPAY_KEY_SECRET = "rzp_live_test_secret_456";

  // --- SOURCE CODE SECURITY GUARDS ---
  const tenantContextCode = read("lib", "tenants", "tenant-context.ts");
  assert.ok(
    !tenantContextCode.includes("x-admin-bypass"),
    "lib/tenants/tenant-context.ts MUST NOT contain x-admin-bypass"
  );
  assert.ok(
    !tenantContextCode.includes("x-admin-secret"),
    "lib/tenants/tenant-context.ts MUST NOT contain x-admin-secret"
  );
  assert.ok(
    !tenantContextCode.includes("CRON_SECRET"),
    "lib/tenants/tenant-context.ts MUST NOT accept CRON_SECRET as user auth"
  );
  assert.ok(
    !tenantContextCode.includes("system_admin"),
    "lib/tenants/tenant-context.ts MUST NOT fabricate system_admin role"
  );

  const dynamicRouteCode = read("app", "api", "platform", "payments", "links", "[id]", "reconcile", "route.ts");
  assert.ok(
    !dynamicRouteCode.includes("x-admin-bypass"),
    "reconcile route MUST NOT contain x-admin-bypass"
  );
  assert.ok(
    !dynamicRouteCode.includes("x-admin-secret"),
    "reconcile route MUST NOT contain x-admin-secret"
  );
  assert.ok(
    /requireTenantContext\(tenantId\)/.test(dynamicRouteCode),
    "reconcile route MUST call requireTenantContext(tenantId) before processing"
  );
  assert.ok(
    /requirePermission\(ctx\.role,\s*["']wallet:topup["']\)/.test(dynamicRouteCode),
    "reconcile route MUST enforce wallet:topup permission check"
  );
  assert.ok(
    !dynamicRouteCode.includes("serviceDb.from"),
    "reconcile route MUST NOT auto-discover tenantId with service role before auth"
  );

  const staticRouteCode = read("app", "api", "platform", "payments", "links", "reconcile", "route.ts");
  assert.ok(
    !staticRouteCode.includes("x-admin-bypass"),
    "static reconcile route MUST NOT contain x-admin-bypass"
  );
  assert.ok(
    /requireTenantContext\(tenantId\)/.test(staticRouteCode),
    "static reconcile route MUST call requireTenantContext(tenantId)"
  );

  // --- FUNCTIONAL RECONCILIATION & IDEMPOTENCY UNIT TESTS ---
  const tenantA = "tenant_reconcile_A";
  const tenantB = "tenant_reconcile_B";

  const mockLink = {
    id: "link_rec_100",
    tenant_id: tenantA,
    provider: "razorpay",
    provider_link_id: "plink_rzp_live_100",
    reference_id: "pl_1785910159982_1f8a2bac",
    amount_cents: 1000,
    currency: "INR",
    status: "created",
    payment_purpose: "wallet_topup",
    mode: "live",
    short_url: "https://rzp.io/i/test",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const dbLinks = new Map<string, Record<string, unknown>>();
  dbLinks.set("link_rec_100", { ...mockLink });

  const ordersDb = new Map<string, Record<string, unknown>>();
  const ledgerEntries: Record<string, unknown>[] = [];
  let walletBalance = 0;

  const mockDb = {
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      const amountCents = (args.p_amount_cents as number) || 1000;
      const existing = ledgerEntries.find(
        (e) => e.tenant_id === args.p_tenant_id && e.reference_type === args.p_reference_type && e.reference_id === args.p_reference_id
      );
      if (existing) {
        return { data: { inserted: false, entry_id: existing.id, balance_cents: walletBalance }, error: null };
      }
      const entryId = `entry_${Date.now()}`;
      ledgerEntries.push({ id: entryId, tenant_id: args.p_tenant_id, amount_cents: amountCents, reference_type: args.p_reference_type, reference_id: args.p_reference_id });
      walletBalance += amountCents;
      return { data: { inserted: true, entry_id: entryId, balance_cents: walletBalance }, error: null };
    },
    from: (table: string) => {
      if (table === "payment_links") {
        return {
          select: () => ({
            eq: (_f: string, tId: string) => ({
              or: (_clause: string) => ({
                maybeSingle: async () => {
                  const item = dbLinks.get("link_rec_100");
                  if (item && item.tenant_id === tId) {
                    return { data: { ...item }, error: null };
                  }
                  return { data: null, error: null };
                },
                single: async () => {
                  const item = dbLinks.get("link_rec_100");
                  return { data: item ? { ...item } : null, error: null };
                },
              }),
              eq: (_f2: string, refId: string) => ({
                maybeSingle: async () => {
                  const item = dbLinks.get("link_rec_100");
                  if (item && item.tenant_id === tId && (item.reference_id === refId || item.id === refId)) {
                    return { data: { ...item }, error: null };
                  }
                  return { data: null, error: null };
                },
                single: async () => {
                  const item = dbLinks.get("link_rec_100");
                  return { data: item ? { ...item } : null, error: null };
                },
              }),
              maybeSingle: async () => {
                const item = dbLinks.get("link_rec_100");
                return { data: item ? { ...item } : null, error: null };
              },
              single: async () => {
                const item = dbLinks.get("link_rec_100");
                return { data: item ? { ...item } : null, error: null };
              },
            }),
            maybeSingle: async () => {
              const item = dbLinks.get("link_rec_100");
              return { data: item ? { ...item } : null, error: null };
            },
            single: async () => {
              const item = dbLinks.get("link_rec_100");
              return { data: item ? { ...item } : null, error: null };
            },
          }),
          update: (fields: Record<string, unknown>) => ({
            eq: (_f: string, id: string) => {
              const item = dbLinks.get(id);
              if (item) Object.assign(item, fields);
              return Promise.resolve({ data: item, error: null });
            },
          }),
        };
      }
      if (table === "payment_orders") {
        return {
          select: () => ({
            eq: (f1: string, v1: string) => ({
              eq: (f2: string, v2: string) => ({
                eq: (f3: string, v3: string) => ({
                  eq: (f4: string, v4: string) => ({
                    maybeSingle: async () => {
                      const key = `${v1}:${v2}:${v3}:${v4}`;
                      return { data: ordersDb.get(key) ?? null, error: null };
                    },
                  }),
                }),
              }),
            }),
          }),
          insert: (fields: Record<string, unknown>) => {
            const key = `${fields.tenant_id}:${fields.provider}:${fields.reference_type}:${fields.reference_id}`;
            const row = { id: `ord_${Date.now()}`, ...fields };
            ordersDb.set(key, row);
            return {
              select: () => ({
                single: async () => ({ data: row, error: null }),
              }),
            };
          },
        };
      }
      if (table === "wallet_ledger_entries") {
        return {
          select: () => ({
            eq: (f1: string, v1: string) => ({
              eq: (f2: string, v2: string) => ({
                eq: (f3: string, v3: string) => ({
                  maybeSingle: async () => {
                    const match = ledgerEntries.find((e) => e.tenant_id === v1 && e.reference_type === v2 && e.reference_id === v3);
                    return { data: match ?? null, error: null };
                  },
                }),
              }),
            }),
          }),
          insert: (fields: Record<string, unknown>) => {
            const row = { id: `entry_${Date.now()}`, ...fields };
            ledgerEntries.push(row);
            walletBalance += fields.amount_cents as number;
            return {
              select: () => ({
                single: async () => ({ data: row, error: null }),
              }),
            };
          },
        };
      }
      if (table === "wallet_accounts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { tenant_id: tenantA, balance_cents: walletBalance }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { balance_cents: walletBalance }, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  } as unknown as ServiceClient;

  // 1. Cross-tenant reconciliation rejected
  await assert.rejects(
    () => reconcilePaymentLink(mockDb, { linkId: "link_rec_100", tenantId: tenantB }),
    (err: Error) => err.message.includes("Payment link not found or not owned by tenant")
  );

  // 2. Razorpay API credentials verification (never exposed in response)
  let authHeaderSent = "";
  const mockFetchRazorpayPaid = async (url: string | URL | Request, init?: RequestInit) => {
    authHeaderSent = (init?.headers as Record<string, string>)?.Authorization || "";
    return new Response(
      JSON.stringify({
        id: "plink_rzp_live_100",
        reference_id: "pl_1785910159982_1f8a2bac",
        amount: 1000,
        currency: "INR",
        status: "paid",
        payments: [{ id: "pay_TLz7wvGkOjs2Fh" }],
      }),
      { status: 200 }
    );
  };

  // 3. Mismatched attributes rejected
  const mockFetchMismatched = async () =>
    new Response(
      JSON.stringify({
        id: "plink_rzp_live_100",
        reference_id: "pl_1785910159982_1f8a2bac",
        amount: 9999, // Mismatched amount!
        currency: "INR",
        status: "paid",
      }),
      { status: 200 }
    );

  await assert.rejects(
    () => reconcilePaymentLink(mockDb, { linkId: "link_rec_100", tenantId: tenantA }, mockFetchMismatched as unknown as typeof fetch),
    (err: Error) => err.message.includes("attributes do not match stored record")
  );

  // 4. Razorpay CREATED does not mark link paid
  const mockFetchCreated = async () =>
    new Response(
      JSON.stringify({
        id: "plink_rzp_live_100",
        reference_id: "pl_1785910159982_1f8a2bac",
        amount: 1000,
        currency: "INR",
        status: "created",
      }),
      { status: 200 }
    );

  const resCreated = await reconcilePaymentLink(
    mockDb,
    { linkId: "link_rec_100", tenantId: tenantA },
    mockFetchCreated as unknown as typeof fetch
  );
  assert.equal(resCreated.reconciled, false);
  assert.equal(resCreated.razorpayStatus, "created");
  assert.equal(dbLinks.get("link_rec_100")?.status, "created", "Local link status must stay CREATED");
  assert.equal(ordersDb.size, 0, "No payment order created for CREATED status");

  // 5. Razorpay PAID reconciles exactly once
  const resPaid1 = await reconcilePaymentLink(
    mockDb,
    { linkId: "link_rec_100", tenantId: tenantA },
    mockFetchRazorpayPaid as unknown as typeof fetch
  );
  assert.equal(resPaid1.reconciled, true);
  assert.equal(resPaid1.razorpayStatus, "paid");
  assert.equal(dbLinks.get("link_rec_100")?.status, "paid", "Local link status updated to PAID");
  assert.equal(ordersDb.size, 1, "Exactly 1 payment_order created");
  assert.equal(ledgerEntries.length, 1, "Exactly 1 credit_purchase ledger entry created");
  assert.equal(walletBalance, 1000, "Wallet balance increased by 1000 cents (₹10)");
  assert.equal(
    authHeaderSent,
    `Basic ${Buffer.from("rzp_live_test_key_123:rzp_live_test_secret_456").toString("base64")}`,
    "Auth header correctly formed server-side"
  );

  // 6. Repeated reconciliation creates no duplicate payment order or credit (Idempotent)
  const resPaid2 = await reconcilePaymentLink(
    mockDb,
    { linkId: "link_rec_100", tenantId: tenantA },
    mockFetchRazorpayPaid as unknown as typeof fetch
  );
  assert.equal(resPaid2.reconciled, true);
  assert.equal(ordersDb.size, 1, "Payment order count remains 1");
  assert.equal(ledgerEntries.length, 1, "Ledger entry count remains 1 (no duplicate credit)");
  assert.equal(walletBalance, 1000, "Wallet balance remains 1000 cents");

  // 7. API failures do not change local state
  const mockFetch500 = async () => new Response("Internal Server Error", { status: 500 });
  await assert.rejects(
    () => reconcilePaymentLink(mockDb, { linkId: "link_rec_100", tenantId: tenantA }, mockFetch500 as unknown as typeof fetch),
    (err: Error) => err.message.includes("Razorpay API returned error status 500")
  );

  console.log("razorpay-reconciliation.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

testReconcilePaymentLinkUnitTests();
