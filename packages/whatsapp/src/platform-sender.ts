import type { ServiceClient } from "./db.ts";

export interface PlatformWhatsAppSender {
  bindingId: string;
  tenantId: string;
}

/**
 * Resolves the Stratxcel PLATFORM WhatsApp Business sender used for
 * product delivery (Audit reports). Never reads a binding id or tenant
 * from the browser. Never hardcodes production UUIDs.
 *
 * Precedence:
 * 1. STRATXCEL_WHATSAPP_PLATFORM_BINDING_ID
 * 2. STRATXCEL_WHATSAPP_PLATFORM_TENANT_ID (active outbound binding)
 * 3. WHATSAPP_PHONE_NUMBER_ID match against an active outbound binding
 */
export async function resolvePlatformWhatsAppSender(
  supabase: ServiceClient,
): Promise<{ ok: true; sender: PlatformWhatsAppSender } | { ok: false; reason: "sender_not_configured" }> {
  const bindingId = process.env.STRATXCEL_WHATSAPP_PLATFORM_BINDING_ID?.trim();
  if (bindingId) {
    const row = await loadActiveOutboundBinding(supabase, { id: bindingId });
    if (row) return { ok: true, sender: { bindingId: row.id, tenantId: row.tenant_id } };
    return { ok: false, reason: "sender_not_configured" };
  }

  const platformTenantId = process.env.STRATXCEL_WHATSAPP_PLATFORM_TENANT_ID?.trim();
  if (platformTenantId) {
    const row = await loadActiveOutboundBinding(supabase, { tenantId: platformTenantId });
    if (row) return { ok: true, sender: { bindingId: row.id, tenantId: row.tenant_id } };
    return { ok: false, reason: "sender_not_configured" };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (phoneNumberId) {
    const row = await loadActiveOutboundBinding(supabase, { phoneNumberId });
    if (row) return { ok: true, sender: { bindingId: row.id, tenantId: row.tenant_id } };
  }

  return { ok: false, reason: "sender_not_configured" };
}

async function loadActiveOutboundBinding(
  supabase: ServiceClient,
  filter: { id?: string; tenantId?: string; phoneNumberId?: string },
): Promise<{ id: string; tenant_id: string; source: string } | null> {
  let query = supabase
    .from("whatsapp_phone_bindings")
    .select("id, tenant_id, source")
    .eq("status", "active")
    .eq("outbound_enabled", true);
  if (filter.id) query = query.eq("id", filter.id);
  if (filter.tenantId) query = query.eq("tenant_id", filter.tenantId);
  if (filter.phoneNumberId) query = query.eq("phone_number_id", filter.phoneNumberId);
  const { data } = await query.maybeSingle();
  if (!data || data.source === "legacy_verified_bot") return null;
  return data as { id: string; tenant_id: string; source: string };
}
