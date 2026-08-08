// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/outbound.test.ts
//
// Behavioral tests for the single shared outbound-send orchestrator
// (packages/whatsapp/src/outbound.ts) against an in-memory fake Supabase —
// no network, no real Postgres. Static structural checks on this same file
// (zero-send guarantee wording, gate ordering, migrated-vs-legacy source
// handling) live in lib/whatsapp/__tests__/whatsapp-*-safety.test.ts;
// these tests instead prove the *runtime* behavior those checks assume.
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

async function run() {
  const originalMode = process.env.WHATSAPP_INTEGRATION_MODE;
  try {
    // --- legacy_verified_bot binding: structurally unable to send ---------
    {
      const { client } = createFakeSupabase(
        seed({ whatsapp_phone_bindings: [{ id: "b", tenant_id: TENANT, status: "active", outbound_enabled: true, source: "legacy_verified_bot" }] })
      );
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const outcome = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k1" });
      assert.equal(outcome.ok, false);
      assert.equal((outcome as { reason: string }).reason, "legacy_bot_shadow_no_send");
    }

    // --- migrated_verified_bot: sends once every normal gate passes -------
    {
      const { client, tables } = createFakeSupabase(seed());
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const outcome = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hello", idempotencyKey: "k2" });
      assert.equal(outcome.ok, true, `expected success, got: ${JSON.stringify(outcome)}`);
      assert.equal((outcome as { alreadySent: boolean }).alreadySent, false);
      assert.equal(tables.whatsapp_shadow_messages?.length, 1, "shadow adapter must have recorded exactly one shadow send");
    }

    // --- no active outbound binding => no send -----------------------------
    {
      const { client } = createFakeSupabase(seed({ whatsapp_phone_bindings: [] }));
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const outcome = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k3" });
      assert.equal(outcome.ok, false);
      assert.equal((outcome as { reason: string }).reason, "no_active_outbound_binding");
    }

    // --- kill switch active => no send --------------------------------------
    {
      const { client } = createFakeSupabase(seed({ kill_switches: [{ scope: "tenant", scope_id: TENANT, enabled: true, reason: "incident" }] }));
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const outcome = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k4" });
      assert.equal(outcome.ok, false);
      assert.ok((outcome as { reason: string }).reason.startsWith("kill_switch_active"));
    }

    // --- WHATSAPP_INTEGRATION_MODE=disabled: zero network, typed rejection -
    {
      const { client, tables } = createFakeSupabase(seed());
      process.env.WHATSAPP_INTEGRATION_MODE = "disabled";
      const outcome = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k5" });
      assert.equal(outcome.ok, false, "disabled mode must never report success");
      assert.equal((tables.whatsapp_shadow_messages ?? []).length, 0, "no shadow row from disabled mode");
      const outboundRows = (tables.whatsapp_messages ?? []).filter((m) => m.direction === "outbound");
      assert.equal(outboundRows.some((m) => m.status === "sent" || m.status === "submitted"), false, "disabled mode must never mark a message sent/submitted");
    }

    // --- WHATSAPP_INTEGRATION_MODE=shadow: zero network, recorded as shadow
    {
      const { client, tables } = createFakeSupabase(seed());
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const outcome = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k6" });
      assert.equal(outcome.ok, true);
      assert.equal((outcome as { mode: string }).mode, "shadow");
      const outboundRows = (tables.whatsapp_messages ?? []).filter((m) => m.direction === "outbound" && m.idempotency_key === "k6");
      assert.equal(outboundRows[0]?.status, "submitted", "shadow mode marks 'submitted', never 'sent' — 'sent' is reserved for a real live send");
    }

    // --- idempotency: same key never sends twice ----------------------------
    {
      const { client, tables } = createFakeSupabase(seed());
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const first = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k7" });
      const second = await sendOutboundWhatsAppMessage(client, { tenantId: TENANT, leadId: LEAD_ID, body: "hi", idempotencyKey: "k7" });
      assert.equal(first.ok, true);
      assert.equal(second.ok, true);
      assert.equal((second as { alreadySent: boolean }).alreadySent, true, "a repeated idempotency key must resolve to the already-sent outcome, not send again");
      assert.equal(tables.whatsapp_shadow_messages?.length, 1, "only the first call may have actually invoked the adapter");
    }

    // --- 10. dashboard/manual route uses the SAME shared orchestrator ------
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
  }
}

run();
