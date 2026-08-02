import type { ServiceClient } from "../db.ts";
import type { RazorpayWebhookEventRow } from "./types.ts";

export class DuplicateWebhookEventError extends Error {
  constructor(providerEventId: string) {
    super(`Razorpay webhook event ${providerEventId} was already recorded — refusing to reprocess`);
    this.name = "DuplicateWebhookEventError";
  }
}

/**
 * Replay protection: Razorpay (like most webhook providers) delivers
 * at-least-once, and a malicious replay of a captured old payload is a
 * real attack vector against payment-triggered wallet credits. The unique
 * constraint on provider_event_id is the actual enforcement; this function
 * turns the resulting unique-violation into a typed error the caller can
 * branch on (log-and-ignore) instead of a generic Postgres error.
 */
export async function recordWebhookEventOnce(
  supabase: ServiceClient,
  input: { providerEventId: string; eventType: string; payload: Record<string, unknown> }
): Promise<RazorpayWebhookEventRow> {
  const { data, error } = await supabase
    .from("razorpay_webhook_events")
    .insert({ provider_event_id: input.providerEventId, event_type: input.eventType, payload: input.payload })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new DuplicateWebhookEventError(input.providerEventId);
    throw new Error(`recordWebhookEventOnce: ${error.message}`);
  }
  return data as RazorpayWebhookEventRow;
}

export async function markWebhookEventProcessed(supabase: ServiceClient, eventId: string): Promise<void> {
  const { error } = await supabase
    .from("razorpay_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId);
  if (error) throw new Error(`markWebhookEventProcessed: ${error.message}`);
}
