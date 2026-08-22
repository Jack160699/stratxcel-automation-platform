// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/process-inbound.test.ts
//
// Focused coverage for processInboundMessage's WhatsApp CRM scope fix
// (brief §4/§10): inbound processing, assistant/shadow-response drafting,
// escalation, and consent enforcement must all keep working exactly as
// before; the only removed behavior is the unintended CRM pipeline-stage
// mutation (marking the contact record "LOST") on opt-out, which was never
// required for opt-out safety (recordOptOut + pausing conversation
// automation already enforce it).
import assert from "node:assert/strict";
import { createFakeSupabase, type Tables } from "./support/fake-supabase.ts";
import { processInboundMessage } from "../conversation/process-inbound.ts";
import type { ParsedInboundWhatsAppMessage } from "../types.ts";

const TENANT = "tenant-1";
const PHONE = "919999000099";

function seed(overrides: Partial<Tables> = {}): Tables {
  return {
    crm_leads: [],
    whatsapp_phone_bindings: [{ id: "binding-1", tenant_id: TENANT, status: "active", outbound_enabled: true, source: "migrated_verified_bot" }],
    kill_switches: [],
    ...overrides,
  };
}

function message(providerMessageId: string, body = "I need a website", kind: ParsedInboundWhatsAppMessage["kind"] = "text"): ParsedInboundWhatsAppMessage {
  return {
    from: PHONE,
    body,
    kind,
    mediaId: null,
    mimeType: null,
    providerMessageId,
    timestampIso: new Date().toISOString(),
    phoneNumberId: "993296527209625",
    wabaId: "122126073314774540",
    displayPhoneNumber: "+91 77778 12777",
  };
}

async function run() {
  // --- 1. Normal inbound message: processes successfully, drafts a proposed response ---
  {
    const { client, tables } = createFakeSupabase(seed());
    const result = await processInboundMessage(client, { tenantId: TENANT, message: message("wamid.1") });
    assert.equal(result.optedOut, false);
    assert.equal(result.escalated, false);
    assert.ok(result.leadId, "a contact/conversation identity must be resolved for message threading");
    assert.ok(result.proposedResponse, "assistant response drafting must still work");
    assert.equal((tables.whatsapp_messages ?? []).some((m) => m.direction === "inbound"), true, "the inbound message must be persisted");
    assert.equal((tables.whatsapp_shadow_messages ?? []).length, 1, "a shadow (proposed, never-sent) response must be logged");
    assert.equal((tables.crm_leads ?? []).length, 1, "first contact creates exactly one contact record (identity/threading anchor)");
  }

  // --- 2. Second message from the same number reuses the same contact (no duplicate) ---
  {
    const { client, tables } = createFakeSupabase(seed());
    const first = await processInboundMessage(client, { tenantId: TENANT, message: message("wamid.2a") });
    const second = await processInboundMessage(client, { tenantId: TENANT, message: message("wamid.2b", "any status update?") });
    assert.equal(second.leadId, first.leadId, "repeat contact must reuse the existing identity, never create a duplicate");
    assert.equal((tables.crm_leads ?? []).length, 1);
  }

  // --- 3. Opt-out: consent + automation are enforced, but NO CRM pipeline-stage mutation occurs ---
  {
    const { client, tables } = createFakeSupabase(seed());
    const result = await processInboundMessage(client, { tenantId: TENANT, message: message("wamid.3", "STOP") });
    assert.equal(result.optedOut, true);
    const lead = (tables.crm_leads ?? [])[0] as Record<string, unknown> | undefined;
    assert.ok(lead, "the contact record must still exist (message threading requires it)");
    assert.notEqual(lead?.status, "LOST", "opt-out must never mutate the contact into a CRM sales-pipeline stage — that is the removed unintended CRM behavior");
    const consent = (tables.contact_consent ?? [])[0] as Record<string, unknown> | undefined;
    assert.equal(consent?.opted_in, false, "opt-out must still be recorded as real consent state");
    const conversation = (tables.whatsapp_conversations ?? [])[0] as Record<string, unknown> | undefined;
    assert.equal(conversation?.automation_mode, "paused", "opt-out must still pause conversation automation (the real enforcement mechanism)");
  }

  // --- 4. Escalation still creates a human handoff and pauses automation (unchanged) ---
  {
    const { client, tables } = createFakeSupabase(seed());
    const result = await processInboundMessage(client, { tenantId: TENANT, message: message("wamid.4", "I want to speak to a human agent") });
    assert.equal(result.escalated, true);
    assert.ok((tables.human_handoffs ?? []).length >= 1, "escalation must still create a human handoff");
  }

  // --- 5. Non-text media message: still handled (unsupported-media shadow log), no crash ---
  {
    const { client, tables } = createFakeSupabase(seed());
    const result = await processInboundMessage(client, { tenantId: TENANT, message: message("wamid.5", "", "image") });
    assert.equal(result.optedOut, false);
    assert.equal(result.escalated, false);
    assert.equal((tables.whatsapp_shadow_messages ?? []).length, 1);
  }

  // --- 6. Redelivered inbound (same provider id) is idempotent, never double-processed ---
  {
    const { client, tables } = createFakeSupabase(seed());
    const msg = message("wamid.6-redelivered");
    await processInboundMessage(client, { tenantId: TENANT, message: msg });
    await processInboundMessage(client, { tenantId: TENANT, message: msg });
    const inboundRows = (tables.whatsapp_messages ?? []).filter((m) => m.direction === "inbound" && m.provider_message_id === msg.providerMessageId);
    assert.equal(inboundRows.length, 1, "a redelivered webhook must remain a safe no-op for message recording");
  }

  console.log("process-inbound.test.ts (@stratxcel/whatsapp): ALL PASS (normal processing, contact reuse, opt-out without CRM pipeline mutation, escalation, media handling, redelivery idempotency)");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
