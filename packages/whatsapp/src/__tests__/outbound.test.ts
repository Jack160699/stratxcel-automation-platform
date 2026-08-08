// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/outbound.test.ts
//
// Behavioral tests for the single shared outbound-send orchestrator
// (packages/whatsapp/src/outbound.ts) against an in-memory fake Supabase —
// no network, no real Postgres. "live" mode is exercised with a stubbed
// globalThis.fetch (restored after each use) so the real adapter code path
// runs end-to-end without ever reaching graph.facebook.com. Static
// structural checks on this same file (zero-send guarantee wording, gate
// ordering, migrated-vs-legacy source handling) live in
// lib/whatsapp/__tests__/whatsapp-*-safety.test.ts; these tests instead
// prove the *runtime* behavior those checks assume.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendOutboundWhatsAppMessage } from "../outbound.ts";
import { createFakeSupabase, type Tables } from "./support/fake-supabase.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

const TENANT = "tenant-1";
const LEAD_ID = "lead-1";

function seed(overrides: Partial<Tables> = {}): Tables {
  const lead = {
    id: LEAD_ID,
    tenant_id: TENANT,
    contact_phone: "919999000099",
    normalized_phone: "919999000099",
    // Recent interaction => inside the 24h free-form window, so no
    // template/consent is required for these tests unless explicitly seeded.
    last_interaction_at: new Date().toISOString(),
  };
  const binding = {
    id: "binding-1",
    tenant_id: TENANT,
    status: "active",
    outbound_enabled: true,
    source: "migrated_verified_bot",
  };
  return {
    crm_leads: [lead],
    whatsapp_phone_bindings: [binding],
    kill_switches: [],
    ...overrides,
  };
}

/** Stubs global fetch for exactly the duration of `fn`, then restores it — used only to exercise the real "live" adapter branch without any real network call. */
async function withStubbedFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

async function run() {
  const originalMode = process.env.WHATSAPP_INTEGRATION_MODE;
  const originalToken = process.env.WHATSAPP_TOKEN;
  const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  try {
    // --- 1. integration mode disabled: zero rows, zero network, before any recording ---
    {
      const { client, tables, fromCalls } = createFakeSupabase(seed());
      process.env.WHATSAPP_INTEGRATION_MODE = "disabled";
      const outcome = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k-disabled" });
      assert.equal(outcome.ok, false, "disabled mode must never report success");
      assert.equal((outcome as { reason: string }).reason, "integration_disabled");
      assert.equal((tables.whatsapp_messages ?? []).length, 0, "disabled mode must create zero outbound rows");
      assert.equal((tables.whatsapp_shadow_messages ?? []).length, 0);
      assert.equal(fromCalls.includes("whatsapp_phone_bindings"), false, "the mode check must run before the binding lookup, let alone recording");
    }

    // --- 2. successful shadow send: one row, submitted, retry doesn't re-invoke adapter ---
    {
      const { client, tables } = createFakeSupabase(seed());
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const first = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k-shadow" });
      assert.equal(first.ok, true, `expected success, got: ${JSON.stringify(first)}`);
      assert.equal((first as { alreadySent: boolean }).alreadySent, false);
      const row = (tables.whatsapp_messages ?? []).find((m) => m.idempotency_key === "k-shadow");
      assert.equal(row?.status, "submitted");
      assert.equal(tables.whatsapp_shadow_messages?.length, 1, "the adapter must have been invoked exactly once");

      const second = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k-shadow" });
      assert.equal(second.ok, true);
      assert.equal((second as { alreadySent: boolean }).alreadySent, true);
      assert.equal(tables.whatsapp_shadow_messages?.length, 1, "a repeated key on a proven-sent row must never invoke the adapter again");
    }

    // --- 3. successful live (mocked) send: provider id persisted, retry doesn't re-invoke adapter ---
    {
      const { client, tables } = createFakeSupabase(seed());
      process.env.WHATSAPP_INTEGRATION_MODE = "live";
      process.env.WHATSAPP_TOKEN = "test-token-not-real";
      process.env.WHATSAPP_PHONE_NUMBER_ID = "000000000000000";
      let fetchCalls = 0;
      const fakeFetch = (async () => {
        fetchCalls++;
        return { ok: true, json: async () => ({ messages: [{ id: "wamid.FAKE_LIVE_ID" }] }) } as Response;
      }) as unknown as typeof fetch;

      const first = await withStubbedFetch(fakeFetch, () => sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k-live" }));
      assert.equal(first.ok, true, `expected success, got: ${JSON.stringify(first)}`);
      assert.equal((first as { providerId: string }).providerId, "wamid.FAKE_LIVE_ID");
      const row = (tables.whatsapp_messages ?? []).find((m) => m.idempotency_key === "k-live");
      assert.equal(row?.status, "sent");
      assert.equal(row?.provider_message_id, "wamid.FAKE_LIVE_ID");
      assert.equal(fetchCalls, 1);

      const second = await withStubbedFetch(fakeFetch, () => sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k-live" }));
      assert.equal((second as { alreadySent: boolean }).alreadySent, true);
      assert.equal(fetchCalls, 1, "a retry on an already-sent live message must never call fetch again");
    }

    // --- 4. mocked Meta/adapter failure: row marked failed, provider id stays null ---
    {
      const { client, tables } = createFakeSupabase(seed());
      process.env.WHATSAPP_INTEGRATION_MODE = "live";
      process.env.WHATSAPP_TOKEN = "test-token-not-real";
      process.env.WHATSAPP_PHONE_NUMBER_ID = "000000000000000";
      const failingFetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;

      const outcome = await withStubbedFetch(failingFetch, () => sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k-fail" }));
      assert.equal(outcome.ok, false, "a rejected Meta call must never report success");
      const row = (tables.whatsapp_messages ?? []).find((m) => m.idempotency_key === "k-fail");
      assert.equal(row?.status, "failed");
      assert.equal(row?.provider_message_id, null, "provider_message_id must stay null — Meta never returned one");
      assert.ok(row?.error, "a sanitized error must be recorded on the row");
      assert.equal(JSON.stringify(row?.error).includes("test-token-not-real"), false, "the recorded error must never contain the live token");

      // --- 5. retry the SAME key after a failed send: must not fabricate success, must not call fetch again ---
      let secondFetchCalled = false;
      const trackingFetch = (async () => {
        secondFetchCalled = true;
        return { ok: true, json: async () => ({ messages: [{ id: "wamid.SHOULD_NOT_HAPPEN" }] }) } as Response;
      }) as unknown as typeof fetch;
      const retry = await withStubbedFetch(trackingFetch, () => sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k-fail" }));
      assert.equal(retry.ok, false);
      assert.equal((retry as { reason: string }).reason, "previous_send_failed");
      assert.notEqual((retry as { alreadySent?: boolean }).alreadySent, true, "a failed prior attempt must never be reported as alreadySent");
      assert.equal(secondFetchCalled, false, "a retry on a known-failed row must never call the adapter again");
      const rowsAfterRetry = (tables.whatsapp_messages ?? []).filter((m) => m.idempotency_key === "k-fail");
      assert.equal(rowsAfterRetry.length, 1, "the retry must not have created a second row");
    }

    // --- 6. existing queued row (simulating a prior attempt that died mid-flight): no fabricated success, no adapter call ---
    {
      const { client, tables } = createFakeSupabase(
        seed({
          whatsapp_messages: [
            {
              id: "stuck-queued-1",
              tenant_id: TENANT,
              lead_id: LEAD_ID,
              conversation_id: "convo-preexisting",
              direction: "outbound",
              body: "stuck",
              idempotency_key: "k-stuck",
              provider_message_id: null,
              status: "queued",
              status_updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            },
          ],
        })
      );
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const outcome = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k-stuck" });
      assert.equal(outcome.ok, false);
      assert.equal((outcome as { reason: string }).reason, "previous_send_incomplete");
      assert.equal(tables.whatsapp_shadow_messages?.length ?? 0, 0, "a queued/unproven row must never trigger an adapter call");
    }

    // --- 7. simulated concurrency race on the same key: adapter invoked at most once ------
    {
      // Simulates the "loser" of a real DB race: another caller's insert
      // already landed (still queued, mid-flight) by the time this call
      // reaches recordWhatsAppMessage's own alreadyRecorded branch.
      const { client, tables } = createFakeSupabase(
        seed({
          whatsapp_messages: [
            {
              id: "race-winner-1",
              tenant_id: TENANT,
              lead_id: LEAD_ID,
              conversation_id: "convo-race",
              direction: "outbound",
              body: "racing",
              idempotency_key: "k-race",
              provider_message_id: null,
              status: "queued",
              status_updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            },
          ],
        })
      );
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const loser = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k-race" });
      assert.equal(loser.ok, false);
      assert.equal(tables.whatsapp_shadow_messages?.length ?? 0, 0, "the race loser must never itself invoke the adapter");
      assert.equal((tables.whatsapp_messages ?? []).filter((m) => m.idempotency_key === "k-race").length, 1, "still exactly one row for the key — no duplicate");
    }

    // --- no active outbound binding => no send -----------------------------
    {
      const { client } = createFakeSupabase(seed({ whatsapp_phone_bindings: [] }));
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const outcome = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k-nobinding" });
      assert.equal(outcome.ok, false);
      assert.equal((outcome as { reason: string }).reason, "no_active_outbound_binding");
    }

    // --- kill switch active => no send --------------------------------------
    {
      const { client } = createFakeSupabase(seed({ kill_switches: [{ scope: "tenant", scope_id: TENANT, enabled: true, reason: "incident" }] }));
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const outcome = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k-killswitch" });
      assert.equal(outcome.ok, false);
      assert.ok((outcome as { reason: string }).reason.startsWith("kill_switch_active"));
    }

    // --- 10. legacy_verified_bot binding: structurally unable to send ------
    {
      const { client } = createFakeSupabase(
        seed({ whatsapp_phone_bindings: [{ id: "b", tenant_id: TENANT, status: "active", outbound_enabled: true, source: "legacy_verified_bot" }] })
      );
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const outcome = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k-legacy" });
      assert.equal(outcome.ok, false);
      assert.equal((outcome as { reason: string }).reason, "legacy_bot_shadow_no_send");
    }

    // --- 11. migrated_verified_bot: obeys the normal gates only, can send --
    {
      const { client, tables } = createFakeSupabase(seed());
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const outcome = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hello", idempotencyKey: "k-migrated" });
      assert.equal(outcome.ok, true, `expected success, got: ${JSON.stringify(outcome)}`);
      assert.equal(tables.whatsapp_shadow_messages?.length, 1);
    }

    // --- 12. dashboard/manual route uses the SAME shared orchestrator ------
    {
      assert.equal(fs.existsSync(path.join(root, "lib", "whatsapp", "send-outbound.ts")), false, "the old per-app copy must no longer exist — one implementation only");
      const routeSource = read("app", "api", "platform", "whatsapp", "send", "route.ts");
      assert.ok(/from\s+["']@stratxcel\/whatsapp["']/.test(routeSource), "dashboard send route must import sendOutboundWhatsAppMessage from the shared package");
      assert.ok(/sendOutboundWhatsAppMessage\(/.test(routeSource), "dashboard send route must call the shared orchestrator");
    }

    console.log("outbound.test.ts (@stratxcel/whatsapp): ALL PASS");
  } finally {
    if (originalMode === undefined) delete process.env.WHATSAPP_INTEGRATION_MODE;
    else process.env.WHATSAPP_INTEGRATION_MODE = originalMode;
    if (originalToken === undefined) delete process.env.WHATSAPP_TOKEN;
    else process.env.WHATSAPP_TOKEN = originalToken;
    if (originalPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
  }
}

run();
