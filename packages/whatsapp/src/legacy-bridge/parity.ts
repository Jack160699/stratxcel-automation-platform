import type { ServiceClient } from "../db.ts";
import { checkEscalation } from "../escalation.ts";
import type { LegacyShadowEventInput, ParityCategory } from "./types.ts";

/**
 * Lightweight, dependency-free fingerprint — not cryptographic, just a
 * stable short marker so two ingests are comparable without storing full
 * message bodies twice (once already on whatsapp_messages, once here).
 */
function fingerprint(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `fp_${(hash >>> 0).toString(16)}_${text.length}`;
}

/**
 * Structural/functional parity only — NOT text equality (see task section
 * 9: "exact text equality is NOT required for AI responses if the
 * intended function is equivalent"). The shadow side has no real AI
 * provider configured anywhere in this repo, so there is no comparable
 * generated sales reply to diff against the legacy bot's actual reply.
 * What IS safety-relevant and genuinely comparable is: would Stratxcel's
 * deterministic escalation logic have handed this to a human at the same
 * point the legacy bot did? That's what this function measures.
 */
export async function recordParityForInbound(
  supabase: ServiceClient,
  input: { tenantId: string; phoneBindingId: string; shadowEventId: string; event: LegacyShadowEventInput }
): Promise<ParityCategory> {
  const body = input.event.message_body ?? "";
  const shadow = checkEscalation({ body, compilerMatched: false });
  const shadowProposedAction = shadow.shouldEscalate ? "would_escalate_to_human" : "would_compose_automated_reply";
  const observedHandoff = input.event.observed_handoff ?? null;

  let category: ParityCategory;
  let mismatchReason: string | null = null;
  if (observedHandoff === null || observedHandoff === undefined) {
    category = "NOT_COMPARABLE";
    mismatchReason = "legacy event did not report an observed handoff outcome";
  } else if (observedHandoff === shadow.shouldEscalate) {
    category = shadow.shouldEscalate ? "MATCH" : "FUNCTIONAL_MATCH";
  } else {
    category = "MISMATCH";
    mismatchReason = `observed_handoff=${observedHandoff} shadow_handoff=${shadow.shouldEscalate} (reason=${shadow.reason ?? "none"})`;
  }

  const { error } = await supabase.from("whatsapp_parity_records").upsert(
    {
      tenant_id: input.tenantId,
      phone_binding_id: input.phoneBindingId,
      shadow_event_id: input.shadowEventId,
      legacy_event_id: input.event.event_id,
      received_at: input.event.occurred_at,
      input_fingerprint: fingerprint(body),
      observed_action: input.event.observed_action ?? null,
      // The legacy hook's own outbound reply text is not part of this
      // task's ingestion contract (not yet built/deployed) — left null
      // rather than fabricated.
      observed_reply_excerpt: null,
      shadow_proposed_action: shadowProposedAction,
      shadow_proposed_reply_excerpt: shadow.shouldEscalate ? null : "[shadow: would compose automated reply — no send]",
      observed_lead_transition: input.event.observed_lead_stage ?? null,
      shadow_lead_transition: null,
      observed_handoff: observedHandoff,
      shadow_handoff: shadow.shouldEscalate,
      parity_category: category,
      mismatch_reason: mismatchReason,
      compared_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,legacy_event_id" }
  );
  if (error) throw new Error(`recordParityForInbound: ${error.message}`);
  return category;
}

export async function recordParityNotComparable(
  supabase: ServiceClient,
  input: { tenantId: string; phoneBindingId: string; shadowEventId: string; legacyEventId: string; reason: string }
): Promise<ParityCategory> {
  const { error } = await supabase.from("whatsapp_parity_records").upsert(
    {
      tenant_id: input.tenantId,
      phone_binding_id: input.phoneBindingId,
      shadow_event_id: input.shadowEventId,
      legacy_event_id: input.legacyEventId,
      parity_category: "NOT_COMPARABLE",
      mismatch_reason: input.reason,
      compared_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,legacy_event_id" }
  );
  if (error) throw new Error(`recordParityNotComparable: ${error.message}`);
  return "NOT_COMPARABLE";
}
