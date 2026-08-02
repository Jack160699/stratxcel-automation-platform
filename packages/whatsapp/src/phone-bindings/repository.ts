import type { ServiceClient } from "../db.ts";
import type { PhoneBindingEnvironment, UnmatchedWhatsAppEventRow, WhatsAppPhoneBindingRow } from "./types.ts";

export async function createPhoneBinding(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber?: string | null;
    providerAccountRef?: string | null;
    environment?: PhoneBindingEnvironment;
    defaultLanguage?: string;
    timezone?: string;
    createdBy?: string | null;
  }
): Promise<WhatsAppPhoneBindingRow> {
  const { data, error } = await supabase
    .from("whatsapp_phone_bindings")
    .insert({
      tenant_id: input.tenantId,
      waba_id: input.wabaId,
      phone_number_id: input.phoneNumberId,
      display_phone_number: input.displayPhoneNumber ?? null,
      provider_account_ref: input.providerAccountRef ?? null,
      environment: input.environment ?? "test",
      default_language: input.defaultLanguage ?? "en",
      timezone: input.timezone ?? "UTC",
      created_by: input.createdBy ?? null,
      // Deliberately status:'pending', shadow_mode:true, inbound/outbound
      // disabled by default at the table level too — a binding only
      // becomes routable after an explicit activation step, never on
      // creation.
    })
    .select("*")
    .single();
  if (error) throw new Error(`createPhoneBinding: ${error.message}`);
  return data as WhatsAppPhoneBindingRow;
}

/**
 * The routing lookup itself — resolves which tenant owns a given
 * phone_number_id. Only ACTIVE bindings are routable; pending/disabled/
 * revoked bindings intentionally return null so a half-configured or
 * deliberately shut-off number behaves identically to an unknown one
 * (ack safely, never guess, never respond).
 */
export async function findActiveBindingByPhoneNumberId(
  supabase: ServiceClient,
  phoneNumberId: string
): Promise<WhatsAppPhoneBindingRow | null> {
  const { data, error } = await supabase
    .from("whatsapp_phone_bindings")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`findActiveBindingByPhoneNumberId: ${error.message}`);
  return (data as WhatsAppPhoneBindingRow) ?? null;
}

export async function listPhoneBindingsForTenant(
  supabase: ServiceClient,
  tenantId: string
): Promise<WhatsAppPhoneBindingRow[]> {
  const { data, error } = await supabase
    .from("whatsapp_phone_bindings")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPhoneBindingsForTenant: ${error.message}`);
  return (data ?? []) as WhatsAppPhoneBindingRow[];
}

export async function updatePhoneBindingStatus(
  supabase: ServiceClient,
  input: { bindingId: string; status: WhatsAppPhoneBindingRow["status"]; verifiedAt?: string | null }
): Promise<WhatsAppPhoneBindingRow> {
  const { data, error } = await supabase
    .from("whatsapp_phone_bindings")
    .update({
      status: input.status,
      verified_at: input.verifiedAt ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.bindingId)
    .select("*")
    .single();
  if (error) throw new Error(`updatePhoneBindingStatus: ${error.message}`);
  return data as WhatsAppPhoneBindingRow;
}

const REDACTED_EXCERPT_LENGTH = 24;

/**
 * Pure so it's unit-testable without a database: a short excerpt plus the
 * true original length, so ops can distinguish "empty message" from "long
 * message, redacted" without ever seeing the redacted portion.
 */
export function redactBody(body: string): { excerpt: string; length: number } {
  return { excerpt: body.slice(0, REDACTED_EXCERPT_LENGTH), length: body.length };
}

/**
 * Records that a webhook arrived for a phone_number_id with no active
 * binding — visibility for ops ("someone is messaging a number we haven't
 * configured") without ever storing the full message body.
 */
export async function recordUnmatchedEvent(
  supabase: ServiceClient,
  input: { phoneNumberId: string; wabaId?: string | null; providerMessageId?: string | null; body: string }
): Promise<UnmatchedWhatsAppEventRow> {
  const redacted = redactBody(input.body);
  const { data, error } = await supabase
    .from("whatsapp_unmatched_events")
    .insert({
      phone_number_id: input.phoneNumberId,
      waba_id: input.wabaId ?? null,
      provider_message_id: input.providerMessageId ?? null,
      body_excerpt: redacted.excerpt,
      body_length: redacted.length,
    })
    .select("*")
    .single();
  if (error) throw new Error(`recordUnmatchedEvent: ${error.message}`);
  return data as UnmatchedWhatsAppEventRow;
}
