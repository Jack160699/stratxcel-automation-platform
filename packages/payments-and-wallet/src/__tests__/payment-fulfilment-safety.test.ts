import assert from "node:assert/strict";
import { processRazorpayWebhookEvent } from "../razorpay/webhook-events.ts";

function createMockSupabase(initialData: Record<string, any> = {}) {
  const store: Record<string, any[]> = {
    payment_links: initialData.payment_links ?? [],
    payment_orders: initialData.payment_orders ?? [],
    subscriptions: initialData.subscriptions ?? [],
    audit_orders: initialData.audit_orders ?? [],
    continuation_packs: initialData.continuation_packs ?? [],
    domains: initialData.domains ?? [],
    wallet_accounts: initialData.wallet_accounts ?? [],
    wallet_ledger_entries: initialData.wallet_ledger_entries ?? [],
    ...initialData,
  };

  return {
    from: (table: string) => {
      let queryTable = store[table] ?? [];
      let filters: { field: string; val: any }[] = [];

      const builder = {
        select: () => builder,
        eq: (field: string, val: any) => {
          filters.push({ field, val });
          return builder;
        },
        maybeSingle: async () => {
          let rows = queryTable.filter((r) => filters.every((f) => r[f.field] === f.val));
          return { data: rows[0] ?? null, error: null };
        },
        single: async () => {
          let rows = queryTable.filter((r) => filters.every((f) => r[f.field] === f.val));
          if (rows.length === 0) return { data: null, error: { message: "Row not found", code: "PGRST116" } };
          return { data: rows[0], error: null };
        },
        update: (updates: Record<string, any>) => {
          return {
            eq: (field: string, val: any) => {
              for (const row of queryTable) {
                if (row[field] === val) {
                  Object.assign(row, updates);
                }
              }
              return Promise.resolve({ error: null });
            },
          };
        },
        insert: (row: Record<string, any>) => {
          const inserted = { id: `id_${Math.random().toString(36).substring(2)}`, ...row };
          queryTable.push(inserted);
          return {
            select: () => ({
              single: async () => ({ data: inserted, error: null }),
            }),
          };
        },
      };
      return builder;
    },
    rpc: async (fnName: string, params: any) => {
      if (fnName === "fulfill_subscription_payment_atomic") {
        const link = store.payment_links.find((l) => l.id === params.p_payment_link_id);
        if (!link) return { data: { fulfilled: false, reason: "payment_link_not_found" }, error: null };
        if (link.tenant_id !== params.p_tenant_id) return { data: { fulfilled: false, reason: "tenant_mismatch" }, error: null };
        if (link.payment_purpose !== "subscription_payment") return { data: { fulfilled: false, reason: "purpose_mismatch" }, error: null };

        const sub = store.subscriptions.find((s) => s.payment_link_id === link.id || s.id === link.reference_id);
        if (!sub) return { data: { fulfilled: false, reason: "subscription_not_found" }, error: null };
        if (sub.status === "active") return { data: { fulfilled: true, already_fulfilled: true }, error: null };

        sub.status = "active";
        sub.started_at = new Date().toISOString();
        link.status = "paid";

        if (sub.audit_order_id) {
          const audit = store.audit_orders.find((a) => a.id === sub.audit_order_id);
          if (audit && !audit.credit_consumed_at) {
            audit.credit_consumed_at = new Date().toISOString();
          }
        }
        return { data: { fulfilled: true, already_fulfilled: false, subscription_id: sub.id }, error: null };
      }

      if (fnName === "fulfill_continuation_pack_payment_atomic") {
        const pack = store.continuation_packs.find((p) => p.payment_link_id === params.p_payment_link_id);
        if (!pack) return { data: { fulfilled: false, reason: "pack_not_found" }, error: null };
        if (pack.status === "paid") return { data: { fulfilled: true, already_fulfilled: true }, error: null };
        pack.status = "paid";
        return { data: { fulfilled: true, already_fulfilled: false }, error: null };
      }

      if (fnName === "record_domain_payment_atomic") {
        const dom = store.domains.find((d) => d.payment_link_id === params.p_payment_link_id);
        if (!dom) return { data: { fulfilled: false, reason: "domain_not_found" }, error: null };
        dom.status = "paid_pending_registration";
        return { data: { fulfilled: true, status: "paid_pending_registration" }, error: null };
      }

      if (fnName === "append_wallet_ledger_entry_atomic") {
        store.wallet_ledger_entries.push({
          tenant_id: params.p_tenant_id,
          amount_cents: params.p_amount_cents,
          entry_type: params.p_entry_type,
          reference_id: params.p_reference_id,
        });
        return { data: { inserted: true, entry_id: "ledger_1", balance_cents: params.p_amount_cents }, error: null };
      }

      return { data: null, error: { message: "Unknown RPC" } };
    },
    _store: store,
  };
}

async function runTests() {
  console.log("Starting Payment Fulfilment Safety Test Suite...");

  // Scenario A & C: Missing Payment Purpose fails closed (Never defaults to wallet_topup)
  {
    const db = createMockSupabase({
      payment_links: [
        {
          id: "link_no_purpose",
          provider_link_id: "link_no_purpose",
          tenant_id: "tenant_1",
          reference_id: "ref_1",
          amount_cents: 50000,
          currency: "INR",
          status: "created",
          payment_purpose: null, // MISSING PURPOSE
        },
      ],
    });

    const result = await processRazorpayWebhookEvent(db as any, {
      eventType: "payment_link.paid",
      payload: {
        payload: {
          payment_link: { entity: { id: "link_no_purpose", reference_id: "ref_1" } },
          payment: { entity: { id: "pay_1" } },
        },
      },
    });

    assert.equal(result.handled, false);
    assert.equal(result.actionTaken, "reconciliation_failed_unknown_purpose");
    assert.equal(db._store.wallet_ledger_entries.length, 0, "No wallet credit must be granted on missing purpose");
  }

  // Scenario B: Subscription Payment Webhook activates pending subscription & consumes audit credit
  {
    const db = createMockSupabase({
      payment_links: [
        {
          id: "link_sub_1",
          provider_link_id: "link_sub_1",
          tenant_id: "tenant_1",
          reference_id: "sub_1",
          amount_cents: 1899900,
          currency: "INR",
          status: "created",
          payment_purpose: "subscription_payment",
        },
      ],
      subscriptions: [
        {
          id: "sub_1",
          tenant_id: "tenant_1",
          plan_tier: "growth",
          status: "pending_payment",
          audit_order_id: "audit_order_1",
          payment_link_id: "link_sub_1",
        },
      ],
      audit_orders: [
        {
          id: "audit_order_1",
          tenant_id: "tenant_1",
          status: "paid",
          credit_consumed_at: null,
        },
      ],
    });

    const result = await processRazorpayWebhookEvent(db as any, {
      eventType: "payment_link.paid",
      payload: {
        payload: {
          payment_link: { entity: { id: "link_sub_1", reference_id: "sub_1" } },
          payment: { entity: { id: "pay_sub_1" } },
        },
      },
    });

    assert.equal(result.handled, true);
    assert.equal(db._store.subscriptions[0].status, "active", "Subscription must be activated");
    assert.ok(db._store.audit_orders[0].credit_consumed_at, "Audit credit must be consumed atomically on subscription activation");
    assert.equal(db._store.wallet_ledger_entries.length, 0, "Subscription payment must NOT credit wallet");

    // Idempotency check: duplicate delivery
    const result2 = await processRazorpayWebhookEvent(db as any, {
      eventType: "payment_link.paid",
      payload: {
        payload: {
          payment_link: { entity: { id: "link_sub_1", reference_id: "sub_1" } },
          payment: { entity: { id: "pay_sub_1" } },
        },
      },
    });
    assert.equal(result2.handled, true);
    assert.equal(db._store.subscriptions[0].status, "active");
  }

  // Scenario J: Domain Payment moves to paid_pending_registration (NOT active)
  {
    const db = createMockSupabase({
      payment_links: [
        {
          id: "link_dom_1",
          provider_link_id: "link_dom_1",
          tenant_id: "tenant_1",
          reference_id: "dom_1",
          amount_cents: 120000,
          currency: "INR",
          status: "created",
          payment_purpose: "domain_purchase",
        },
      ],
      domains: [
        {
          id: "dom_1",
          tenant_id: "tenant_1",
          domain_name: "example.com",
          status: "pending_payment",
          payment_link_id: "link_dom_1",
        },
      ],
    });

    const result = await processRazorpayWebhookEvent(db as any, {
      eventType: "payment_link.paid",
      payload: {
        payload: {
          payment_link: { entity: { id: "link_dom_1", reference_id: "dom_1" } },
          payment: { entity: { id: "pay_dom_1" } },
        },
      },
    });

    assert.equal(result.handled, true);
    assert.equal(db._store.domains[0].status, "paid_pending_registration", "Domain payment must move to paid_pending_registration, NOT active");
  }

  // Scenario O: Explicit wallet_topup happy path
  {
    const db = createMockSupabase({
      payment_links: [
        {
          id: "link_wallet_1",
          provider_link_id: "link_wallet_1",
          tenant_id: "tenant_1",
          reference_id: "pl_topup_1",
          amount_cents: 1000,
          currency: "INR",
          status: "created",
          payment_purpose: "wallet_topup",
        },
      ],
      wallet_accounts: [
        {
          tenant_id: "tenant_1",
          balance_cents: 0,
        },
      ],
    });

    const result = await processRazorpayWebhookEvent(db as any, {
      eventType: "payment_link.paid",
      payload: {
        payload: {
          payment_link: { entity: { id: "link_wallet_1", reference_id: "pl_topup_1" } },
          payment: { entity: { id: "pay_wallet_1" } },
        },
      },
    });

    assert.equal(result.handled, true);
  }

  console.log("payment-fulfilment-safety.test.ts: ALL PASS (purpose validation, subscription activation, audit credit timing, domain registration state, idempotency verified)");
}

runTests();
