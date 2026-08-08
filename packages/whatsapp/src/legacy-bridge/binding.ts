import type { ServiceClient } from "../db.ts";
import type { WhatsAppPhoneBindingRow } from "../phone-bindings/types.ts";

/**
 * The designated legacy-bot binding is entirely server-configured via
 * environment variables set by whoever operates the deployment — never by
 * an incoming request. If any of the three identifying env vars are unset,
 * this is a safe, total no-op: no binding exists, nothing resolves, the
 * whole shadow bridge is inert. This is intentional — the real WABA/phone
 * identifiers for the verified bot were not independently obtainable
 * during this task (no Meta API token available to query them), so the
 * binding stays unconfigured until the owner supplies them.
 */
export interface LegacyBindingConfig {
  tenantId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  legacyHost: string;
}

export function readLegacyBindingConfig(): LegacyBindingConfig | null {
  const tenantId = process.env.WHATSAPP_LEGACY_TENANT_ID;
  const wabaId = process.env.WHATSAPP_LEGACY_WABA_ID;
  const phoneNumberId = process.env.WHATSAPP_LEGACY_PHONE_NUMBER_ID;
  if (!tenantId || !wabaId || !phoneNumberId) return null;
  return {
    tenantId,
    wabaId,
    phoneNumberId,
    displayPhoneNumber: process.env.WHATSAPP_LEGACY_DISPLAY_NUMBER || null,
    legacyHost: process.env.WHATSAPP_LEGACY_HOST || "bot.stratxcel.ai",
  };
}

/**
 * Idempotent upsert of the single legacy-bot binding row, from server
 * config only. `outbound_enabled` and `inbound_enabled` are always forced
 * false here — this binding exists for shadow observation, never for
 * Stratxcel to actually route Meta traffic through. Safe to call
 * repeatedly (e.g. on deploy) — never creates a second row, and never
 * flips an operator's later manual status change back.
 */
export async function ensureLegacyBotBinding(
  supabase: ServiceClient
): Promise<{ configured: false } | { configured: true; binding: WhatsAppPhoneBindingRow }> {
  const config = readLegacyBindingConfig();
  if (!config) return { configured: false };

  const { data: existing } = await supabase
    .from("whatsapp_phone_bindings")
    .select("*")
    .eq("source", "legacy_verified_bot")
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("whatsapp_phone_bindings")
      .update({
        waba_id: config.wabaId,
        phone_number_id: config.phoneNumberId,
        display_phone_number: config.displayPhoneNumber,
        legacy_host: config.legacyHost,
        inbound_enabled: false,
        outbound_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(`ensureLegacyBotBinding (update): ${error.message}`);
    return { configured: true, binding: data as WhatsAppPhoneBindingRow };
  }

  const { data, error } = await supabase
    .from("whatsapp_phone_bindings")
    .insert({
      tenant_id: config.tenantId,
      waba_id: config.wabaId,
      phone_number_id: config.phoneNumberId,
      display_phone_number: config.displayPhoneNumber,
      environment: "production",
      status: "pending",
      inbound_enabled: false,
      outbound_enabled: false,
      shadow_mode: true,
      source: "legacy_verified_bot",
      migration_status: "shadowing",
      legacy_host: config.legacyHost,
    })
    .select("*")
    .single();
  if (error) throw new Error(`ensureLegacyBotBinding (insert): ${error.message}`);
  return { configured: true, binding: data as WhatsAppPhoneBindingRow };
}

/** Read-only lookup — does not create anything. Used by the ingest endpoint and the admin status view. */
export async function findLegacyBotBinding(supabase: ServiceClient): Promise<WhatsAppPhoneBindingRow | null> {
  const { data, error } = await supabase.from("whatsapp_phone_bindings").select("*").eq("source", "legacy_verified_bot").maybeSingle();
  if (error) throw new Error(`findLegacyBotBinding: ${error.message}`);
  return (data as WhatsAppPhoneBindingRow) ?? null;
}
