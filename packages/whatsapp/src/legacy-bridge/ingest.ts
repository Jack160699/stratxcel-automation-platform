import { createLead, findLeadByNormalizedPhone } from "@stratxcel/leads-and-crm";
import { createHumanHandoff } from "@stratxcel/human-handoff";
import type { ServiceClient } from "../db.ts";
import { normalizePhoneNumber } from "../phone-normalize.ts";
import { findLegacyBotBinding } from "./binding.ts";
import { getWhatsAppMigrationMode } from "./mode.ts";
import { recordParityForInbound, recordParityNotComparable } from "./parity.ts";
import type { LegacyShadowEventInput, ParityCategory } from "./types.ts";

export type IngestOutcome =
  | { ok: true; skipped: false; alreadyIngested: boolean; shadowEventId: string; parityCategory: ParityCategory | null }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; reason: string };

/**
 * The core shadow bridge. This function NEVER imports the outbound
 * adapter or send-outbound choke point — it has no way to call the Meta
 * Send API even if it wanted to. It only: resolves the pre-configured
 * legacy binding (never a client-supplied tenant), finds-or-creates a
 * lead by normalized phone (same dedupe logic as native inbound), and
 * persists an idempotent shadow event plus a canonical inbox mirror.
 *
 * Owner/CEO commands (`is_owner_command: true`) are recorded for audit
 * visibility only — never turned into a lead, never mirrored into the
 * customer-facing inbox, and Stratxcel has no privileged-command
 * execution path for them to leak into in the first place.
 *
 * Consent is never inferred here: mirroring a legacy conversation does
 * not create or imply a contact_consent row. hasMarketingConsent() stays
 * fail-closed for every legacy-shadowed lead exactly as it is for native
 * leads, per the existing consent model.
 */
export async function ingestLegacyShadowEvent(supabase: ServiceClient, event: LegacyShadowEventInput): Promise<IngestOutcome> {
  const mode = getWhatsAppMigrationMode();
  if (mode === "off") return { ok: true, skipped: true, reason: "migration_mode_off" };

  const binding = await findLegacyBotBinding(supabase);
  if (!binding) return { ok: true, skipped: true, reason: "legacy_binding_not_configured" };
  if (binding.phone_number_id !== event.phone_number_id) {
    // Never guess a tenant for a phone_number_id that doesn't match the
    // one, pre-configured legacy binding — this is the whole point of
    // "server-side tenant resolution, never client-supplied."
    return { ok: false, reason: "phone_number_id_mismatch" };
  }

  const tenantId = binding.tenant_id;
  const isOwnerCommand = event.is_owner_command === true;
  let leadId: string | null = null;

  const isMessageEvent = event.event_type === "inbound_message" || event.event_type === "outbound_message";

  if (!isOwnerCommand && isMessageEvent && event.contact_phone) {
    const normalizedPhone = normalizePhoneNumber(event.contact_phone);
    let lead = normalizedPhone ? await findLeadByNormalizedPhone(supabase, tenantId, normalizedPhone) : null;
    if (!lead) {
      lead = await createLead(supabase, {
        tenantId,
        source: "whatsapp",
        contactPhone: event.contact_phone,
        normalizedPhone,
        metadata: { origin: "legacy_verified_bot_shadow" },
      });
    }
    leadId = lead.id;
  }

  const shouldMirrorMessage = !isOwnerCommand && leadId !== null && isMessageEvent;

  const { data: rpcResult, error } = await supabase.rpc("ingest_legacy_whatsapp_shadow_event", {
    p_tenant_id: tenantId,
    p_phone_binding_id: binding.id,
    p_lead_id: leadId,
    p_source_event_id: event.event_id,
    p_event_type: isOwnerCommand ? "owner_command" : event.event_type,
    p_direction: event.direction ?? null,
    p_occurred_at: event.occurred_at,
    p_payload: {
      observed_action: event.observed_action ?? null,
      observed_handoff: event.observed_handoff ?? null,
      observed_lead_stage: event.observed_lead_stage ?? null,
      is_owner_command: isOwnerCommand,
    },
    p_mirror_message: shouldMirrorMessage,
    p_message_direction: event.direction ?? null,
    p_message_body: event.message_body ?? null,
    p_provider_message_id: event.event_id,
  });
  if (error) return { ok: false, reason: `rpc_failed:${error.message}` };

  const result = rpcResult as { success: boolean; already_ingested?: boolean; shadow_event_id?: string; reason?: string };
  if (!result.success) return { ok: false, reason: result.reason ?? "rpc_rejected" };
  if (result.already_ingested) {
    return { ok: true, skipped: false, alreadyIngested: true, shadowEventId: result.shadow_event_id!, parityCategory: null };
  }

  // An observed handoff the legacy bot actually created is real, already-
  // happened staff-visible state — mirroring it as a real Stratxcel
  // human_handoffs row is recording a fact, not "triggering an external
  // customer action." A shadow-computed *proposed* escalation (see
  // recordParityForInbound) is deliberately NOT mirrored the same way —
  // it stays a parity comparison, never an auto-created staff task.
  if (!isOwnerCommand && event.event_type === "human_handoff" && leadId) {
    await createHumanHandoff(supabase, {
      tenantId,
      reason: `Mirrored from legacy_verified_bot: ${event.observed_action ?? "handoff reported"}`,
      contextSnapshot: { source: "legacy_verified_bot", legacyEventId: event.event_id, observedAction: event.observed_action ?? null },
    });
  }

  let parityCategory: ParityCategory | null = null;
  if (!isOwnerCommand) {
    parityCategory =
      event.event_type === "inbound_message"
        ? await recordParityForInbound(supabase, { tenantId, phoneBindingId: binding.id, shadowEventId: result.shadow_event_id!, event })
        : await recordParityNotComparable(supabase, {
            tenantId,
            phoneBindingId: binding.id,
            shadowEventId: result.shadow_event_id!,
            legacyEventId: event.event_id,
            reason: `event_type "${event.event_type}" has no shadow-side comparison implemented this task`,
          });
  }

  return { ok: true, skipped: false, alreadyIngested: false, shadowEventId: result.shadow_event_id!, parityCategory };
}
