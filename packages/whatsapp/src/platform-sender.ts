import type { ServiceClient } from "./db.ts";

export interface PlatformWhatsAppSender {
  bindingId: string;
  tenantId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  providerAccountRef: string | null;
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
 * 4. Auto-activation/auto-creation of platform binding when WHATSAPP_PHONE_NUMBER_ID exists
 * 5. Fallback to any active platform_shared_sender binding
 */
export async function resolvePlatformWhatsAppSender(
  supabase: ServiceClient,
): Promise<{ ok: true; sender: PlatformWhatsAppSender } | { ok: false; reason: "sender_not_configured" }> {
  const bindingId = process.env.STRATXCEL_WHATSAPP_PLATFORM_BINDING_ID?.trim();
  if (bindingId) {
    const row = await loadActiveOutboundBinding(supabase, { id: bindingId });
    if (row) return { ok: true, sender: toPlatformSender(row) };
  }

  const platformTenantId = process.env.STRATXCEL_WHATSAPP_PLATFORM_TENANT_ID?.trim();
  if (platformTenantId) {
    const row = await loadActiveOutboundBinding(supabase, { tenantId: platformTenantId });
    if (row) return { ok: true, sender: toPlatformSender(row) };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (phoneNumberId) {
    const row = await loadActiveOutboundBinding(supabase, { phoneNumberId });
    if (row) return { ok: true, sender: toPlatformSender(row) };

    // Auto-activate or bind existing row for this phone number
    try {
      const { data: anyRow } = await supabase
        .from("whatsapp_phone_bindings")
        .select("id, tenant_id, source, waba_id, phone_number_id, display_phone_number, provider_account_ref")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();

      if (anyRow) {
        await supabase
          .from("whatsapp_phone_bindings")
          .update({ status: "active", outbound_enabled: true, updated_at: new Date().toISOString() })
          .eq("id", anyRow.id);
        return { ok: true, sender: toPlatformSender(anyRow as PlatformBindingRow) };
      }

      // If no binding row exists, find a system tenant or oldest tenant to bind to
      let { data: systemTenant } = await supabase
        .from("tenants")
        .select("id")
        .in("slug", ["staff-workspace", "stratxcel", "staff", "system", "platform"])
        .limit(1)
        .maybeSingle();

      if (!systemTenant) {
        const { data: anyTenant } = await supabase
          .from("tenants")
          .select("id")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        systemTenant = anyTenant;
      }

      const targetTenantId = systemTenant?.id;
      if (targetTenantId) {
        const wabaId = process.env.WHATSAPP_WABA_ID?.trim() || phoneNumberId;
        const { data: newRow } = await supabase
          .from("whatsapp_phone_bindings")
          .insert({
            tenant_id: targetTenantId,
            source: "platform_shared_sender",
            waba_id: wabaId,
            phone_number_id: phoneNumberId,
            status: "active",
            outbound_enabled: true,
            environment: "production",
            display_phone_number: process.env.WHATSAPP_DISPLAY_PHONE_NUMBER?.trim() || null,
          })
          .select("id, tenant_id, source, waba_id, phone_number_id, display_phone_number, provider_account_ref")
          .maybeSingle();

        if (newRow) return { ok: true, sender: toPlatformSender(newRow as PlatformBindingRow) };
      }
    } catch {
      // Non-fatal fallback to generic search
    }
  }

  // Fallback: check for any active platform_shared_sender binding
  try {
    const { data: platformShared } = await supabase
      .from("whatsapp_phone_bindings")
      .select("id, tenant_id, source, waba_id, phone_number_id, display_phone_number, provider_account_ref")
      .eq("source", "platform_shared_sender")
      .eq("status", "active")
      .eq("outbound_enabled", true)
      .limit(1)
      .maybeSingle();

    if (platformShared) return { ok: true, sender: toPlatformSender(platformShared as PlatformBindingRow) };

    // Fallback: check for any active outbound binding
    const { data: anyActive } = await supabase
      .from("whatsapp_phone_bindings")
      .select("id, tenant_id, source, waba_id, phone_number_id, display_phone_number, provider_account_ref")
      .eq("status", "active")
      .eq("outbound_enabled", true)
      .neq("source", "legacy_verified_bot")
      .limit(1)
      .maybeSingle();

    if (anyActive) return { ok: true, sender: toPlatformSender(anyActive as PlatformBindingRow) };
  } catch {
    // Non-fatal
  }

  return { ok: false, reason: "sender_not_configured" };
}

interface PlatformBindingRow {
  id: string;
  tenant_id: string;
  source: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  provider_account_ref: string | null;
}

function toPlatformSender(row: PlatformBindingRow): PlatformWhatsAppSender {
  return {
    bindingId: row.id,
    tenantId: row.tenant_id,
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id,
    displayPhoneNumber: row.display_phone_number,
    providerAccountRef: row.provider_account_ref,
  };
}

async function loadActiveOutboundBinding(
  supabase: ServiceClient,
  filter: { id?: string; tenantId?: string; phoneNumberId?: string },
): Promise<PlatformBindingRow | null> {
  let query = supabase
    .from("whatsapp_phone_bindings")
    .select("id, tenant_id, source, waba_id, phone_number_id, display_phone_number, provider_account_ref")
    .eq("status", "active")
    .eq("outbound_enabled", true);
  if (filter.id) query = query.eq("id", filter.id);
  if (filter.tenantId) query = query.eq("tenant_id", filter.tenantId);
  if (filter.phoneNumberId) query = query.eq("phone_number_id", filter.phoneNumberId);
  const { data } = await query.maybeSingle();
  if (!data || data.source === "legacy_verified_bot") return null;
  return data as PlatformBindingRow;
}
