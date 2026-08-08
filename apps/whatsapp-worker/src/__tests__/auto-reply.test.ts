// Run with: node --experimental-strip-types apps/whatsapp-worker/src/__tests__/auto-reply.test.ts
//
// Tests the worker's automatic-reply gate (processor.ts's
// maybeSendAutomaticReply) against an in-memory fake Supabase — no network,
// no real Postgres, no real Meta call. processInboundMessage's own pipeline
// (lead upsert, opt-out, escalation) has its own dedicated coverage
// elsewhere; here a ProcessInboundResult is constructed directly so these
// tests isolate exactly what the gate itself decides given that result.
import assert from "node:assert/strict";
import { maybeSendAutomaticReply } from "../processor.ts";
import { createFakeSupabase, type Tables } from "../../../../packages/whatsapp/src/__tests__/support/fake-supabase.ts";
import type { ParsedInboundWhatsAppMessage, ProcessInboundResult } from "@stratxcel/whatsapp";

const TENANT = "tenant-1";
const LEAD_ID = "lead-1";

function seed(overrides: Partial<Tables> = {}): Tables {
  return {
    crm_leads: [{ id: LEAD_ID, tenant_id: TENANT, contact_phone: "919999000099", normalized_phone: "919999000099", last_interaction_at: new Date().toISOString() }],
    whatsapp_phone_bindings: [{ id: "binding-1", tenant_id: TENANT, status: "active", outbound_enabled: true, source: "migrated_verified_bot" }],
    kill_switches: [],
    ...overrides,
  };
}

function message(providerMessageId: string): ParsedInboundWhatsAppMessage {
  return {
    from: "919999000099",
    body: "I need a website",
    kind: "text",
    mediaId: null,
    mimeType: null,
    providerMessageId,
    timestampIso: new Date().toISOString(),
    phoneNumberId: "993296527209625",
    wabaId: "122126073314774540",
    displayPhoneNumber: "+91 77778 12777",
  };
}

function result(overrides: Partial<ProcessInboundResult> = {}): ProcessInboundResult {
  return {
    leadId: LEAD_ID,
    optedOut: false,
    escalated: false,
    escalationReason: null,
    proposedResponse: "Thanks for reaching out — here's what we offer...",
    serviceKey: "website",
    confidence: "high",
    ...overrides,
  };
}

async function run() {
  const originalAutoReply = process.env.WHATSAPP_AUTO_REPLY_ENABLED;
  const originalMode = process.env.WHATSAPP_INTEGRATION_MODE;
  try {
    // --- 1. AUTO_REPLY_ENABLED missing/false: proposed response NOT sent ---
    {
      delete process.env.WHATSAPP_AUTO_REPLY_ENABLED;
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const { client, fromCalls } = createFakeSupabase(seed());
      await maybeSendAutomaticReply(client, TENANT, message("wamid.1"), result());
      assert.equal(fromCalls.includes("whatsapp_phone_bindings"), false, "no orchestration attempt may occur when the gate is off");
    }
    {
      process.env.WHATSAPP_AUTO_REPLY_ENABLED = "false";
      const { client, fromCalls } = createFakeSupabase(seed());
      await maybeSendAutomaticReply(client, TENANT, message("wamid.1b"), result());
      assert.equal(fromCalls.length, 0, "the literal string 'false' must also stay disabled");
    }
    {
      process.env.WHATSAPP_AUTO_REPLY_ENABLED = "TRUE";
      const { client, fromCalls } = createFakeSupabase(seed());
      await maybeSendAutomaticReply(client, TENANT, message("wamid.1c"), result());
      assert.equal(fromCalls.length, 0, "only the exact lowercase string 'true' may enable auto-reply");
    }

    process.env.WHATSAPP_AUTO_REPLY_ENABLED = "true";

    // --- 2. enabled but WHATSAPP_INTEGRATION_MODE=disabled: no real send ---
    {
      process.env.WHATSAPP_INTEGRATION_MODE = "disabled";
      const { client, tables } = createFakeSupabase(seed());
      await maybeSendAutomaticReply(client, TENANT, message("wamid.2"), result());
      const outboundRows = (tables.whatsapp_messages ?? []).filter((m) => m.direction === "outbound");
      assert.equal(outboundRows.some((m) => m.status === "sent"), false, "disabled mode: no message may ever be marked sent");
      assert.equal((tables.whatsapp_shadow_messages ?? []).length, 0, "disabled mode: adapter never reaches the shadow-log branch either");
    }

    // --- 3. enabled but no active outbound binding: no send ----------------
    {
      process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
      const { client, tables } = createFakeSupabase(seed({ whatsapp_phone_bindings: [] }));
      await maybeSendAutomaticReply(client, TENANT, message("wamid.3"), result());
      assert.equal((tables.whatsapp_messages ?? []).filter((m) => m.direction === "outbound").length, 0);
    }

    // --- 4. proposedResponse null: no send ----------------------------------
    {
      const { client, fromCalls } = createFakeSupabase(seed());
      await maybeSendAutomaticReply(client, TENANT, message("wamid.4"), result({ proposedResponse: null }));
      assert.equal(fromCalls.length, 0, "a null proposed response must never reach the orchestrator at all");
    }

    // --- 5. opt-out inbound: no automatic reply -----------------------------
    {
      const { client, fromCalls } = createFakeSupabase(seed());
      await maybeSendAutomaticReply(client, TENANT, message("wamid.5"), result({ optedOut: true }));
      assert.equal(fromCalls.length, 0, "an opted-out lead must never receive an automatic reply, even if proposedResponse were somehow non-null");
    }

    // --- 6. escalation/handoff inbound: no automatic reply ------------------
    {
      const { client, fromCalls } = createFakeSupabase(seed());
      await maybeSendAutomaticReply(client, TENANT, message("wamid.6"), result({ escalated: true }));
      assert.equal(fromCalls.length, 0, "an escalated lead must never receive an automatic reply — a human owns this thread now");
    }

    // --- 7. normal case, all gates open: exactly one orchestration attempt -
    {
      const { client, tables } = createFakeSupabase(seed());
      await maybeSendAutomaticReply(client, TENANT, message("wamid.7"), result());
      const outboundRows = (tables.whatsapp_messages ?? []).filter((m) => m.direction === "outbound");
      assert.equal(outboundRows.length, 1, "exactly one outbound orchestration attempt must have occurred");
      assert.equal(tables.whatsapp_shadow_messages?.length, 1);
    }

    // --- 8. idempotency key is exactly derived from the provider message id
    {
      const { client, tables } = createFakeSupabase(seed());
      await maybeSendAutomaticReply(client, TENANT, message("wamid.STRATXCEL_AUTOREPLY_KEY_CHECK"), result());
      const outboundRow = (tables.whatsapp_messages ?? []).find((m) => m.direction === "outbound");
      assert.equal(outboundRow?.idempotency_key, "whatsapp_auto_reply:wamid.STRATXCEL_AUTOREPLY_KEY_CHECK");
    }

    // --- 9. redelivered inbound (same provider id) cannot double-send ------
    {
      const { client, tables } = createFakeSupabase(seed());
      const msg = message("wamid.9-redelivered");
      await maybeSendAutomaticReply(client, TENANT, msg, result());
      await maybeSendAutomaticReply(client, TENANT, msg, result()); // simulates a Meta webhook redelivery reaching the gate a second time
      const outboundRows = (tables.whatsapp_messages ?? []).filter((m) => m.direction === "outbound" && m.idempotency_key === `whatsapp_auto_reply:${msg.providerMessageId}`);
      assert.equal(outboundRows.length, 1, "a redelivered inbound message must never cause a second outbound send");
      assert.equal(tables.whatsapp_shadow_messages?.length, 1, "the adapter must only have actually been invoked once");
    }

    console.log("auto-reply.test.ts (@stratxcel/whatsapp-worker): ALL PASS");
  } finally {
    if (originalAutoReply === undefined) delete process.env.WHATSAPP_AUTO_REPLY_ENABLED;
    else process.env.WHATSAPP_AUTO_REPLY_ENABLED = originalAutoReply;
    if (originalMode === undefined) delete process.env.WHATSAPP_INTEGRATION_MODE;
    else process.env.WHATSAPP_INTEGRATION_MODE = originalMode;
  }
}

run();
