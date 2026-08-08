export type LegacyShadowEventType =
  | "inbound_message"
  | "outbound_message"
  | "delivery_status"
  | "lead_update"
  | "qualification_update"
  | "human_handoff"
  | "followup_scheduled"
  | "payment_intent_detected"
  | "bot_reply_decision"
  | "owner_command";

export type ParityCategory = "MATCH" | "FUNCTIONAL_MATCH" | "EXPECTED_DIFFERENCE" | "MISMATCH" | "NOT_COMPARABLE" | "ERROR";

/**
 * The contract for one raw event as the (not-yet-built, not-yet-deployed)
 * legacy-repo hook would report it. Nothing here is trusted for tenant or
 * binding resolution — only phone_number_id is used, and only to look up
 * the single pre-configured legacy binding; a phone_number_id that doesn't
 * match it is rejected, never guessed into some tenant.
 */
export interface LegacyShadowEventInput {
  event_id: string; // legacy repo's own idempotency key (e.g. WA message id, or a derived key for non-message events)
  event_type: LegacyShadowEventType;
  phone_number_id: string; // the legacy WABA's receiving number — must match the configured legacy binding
  occurred_at: string; // ISO timestamp from the legacy system
  contact_phone?: string | null;
  direction?: "inbound" | "outbound" | null;
  message_body?: string | null; // present for inbound_message/outbound_message
  observed_action?: string | null; // what the legacy bot actually did (free-text category, e.g. "auto_reply_sent", "handoff_created")
  observed_handoff?: boolean | null;
  observed_lead_stage?: string | null;
  is_owner_command?: boolean; // legacy repo's own isOwnerNumber()/CEO-command classification, trusted only to EXCLUDE from customer CRM mirroring
  timestamp: number; // unix seconds, for HMAC + replay-window validation
  nonce: string; // unique per request, for replay protection
}
