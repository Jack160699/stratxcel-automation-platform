import { hasMarketingConsent, recordOptIn, recordOptOut, type ServiceClient } from "@stratxcel/whatsapp";
import { maskWhatsAppNumber, type NormalizedWhatsAppDestination } from "./e164.ts";

export const CUSTOMER_WHATSAPP_DELIVERY_KIND = "CUSTOMER_WHATSAPP_DELIVERY_DESTINATION";

export interface AuditWhatsAppDestinationRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  lead_id: string;
  e164: string;
  country_iso: string;
  national_number: string;
  consent_opted_in: boolean;
  consent_source: string | null;
  consent_captured_at: string | null;
  consent_withdrawn_at: string | null;
}

export interface PublicWhatsAppDestination {
  countryIso: string;
  nationalNumber: string;
  masked: string;
  consent: boolean;
}

export function toPublicDestination(row: AuditWhatsAppDestinationRow): PublicWhatsAppDestination {
  return {
    countryIso: row.country_iso,
    nationalNumber: row.national_number,
    masked: maskWhatsAppNumber(row.e164),
    consent: row.consent_opted_in === true && !row.consent_withdrawn_at,
  };
}

export async function loadAuditWhatsAppDestination(
  supabase: ServiceClient,
  tenantId: string,
): Promise<AuditWhatsAppDestinationRow | null> {
  const { data, error } = await supabase
    .from("audit_whatsapp_destinations")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return data as AuditWhatsAppDestinationRow;
}

async function findOrCreateDestinationLead(
  supabase: ServiceClient,
  tenantId: string,
  destination: NormalizedWhatsAppDestination,
  existingLeadId: string | null,
): Promise<string> {
  if (existingLeadId) {
    await supabase
      .from("crm_leads")
      .update({
        contact_phone: destination.e164,
        normalized_phone: destination.digits,
        updated_at: new Date().toISOString(),
        metadata: { kind: CUSTOMER_WHATSAPP_DELIVERY_KIND },
      })
      .eq("id", existingLeadId)
      .eq("tenant_id", tenantId);
    return existingLeadId;
  }

  const { data: byPhone } = await supabase
    .from("crm_leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("normalized_phone", destination.digits)
    .maybeSingle();
  if (byPhone?.id) return byPhone.id as string;

  const { data: created, error } = await supabase
    .from("crm_leads")
    .insert({
      tenant_id: tenantId,
      source: "whatsapp",
      contact_phone: destination.e164,
      normalized_phone: destination.digits,
      contact_name: "Audit WhatsApp delivery",
      metadata: { kind: CUSTOMER_WHATSAPP_DELIVERY_KIND },
    })
    .select("id")
    .single();
  if (error || !created?.id) throw new Error(error?.message ?? "Could not save the WhatsApp destination.");
  return created.id as string;
}

export async function upsertAuditWhatsAppDestination(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    userId: string;
    destination: NormalizedWhatsAppDestination;
    consent: boolean;
    source: string;
  },
): Promise<AuditWhatsAppDestinationRow> {
  const existing = await loadAuditWhatsAppDestination(supabase, input.tenantId);
  const leadId = await findOrCreateDestinationLead(
    supabase,
    input.tenantId,
    input.destination,
    existing?.lead_id ?? null,
  );

  const now = new Date().toISOString();
  const row = {
    tenant_id: input.tenantId,
    user_id: input.userId,
    lead_id: leadId,
    e164: input.destination.e164,
    country_iso: input.destination.countryIso,
    national_number: input.destination.nationalNumber,
    consent_opted_in: input.consent,
    consent_source: input.consent ? input.source : existing?.consent_source ?? null,
    consent_captured_at: input.consent ? now : existing?.consent_captured_at ?? null,
    consent_withdrawn_at: input.consent ? null : now,
    updated_at: now,
  };

  const { data, error } = existing
    ? await supabase
        .from("audit_whatsapp_destinations")
        .update(row)
        .eq("id", existing.id)
        .eq("tenant_id", input.tenantId)
        .select("*")
        .single()
    : await supabase.from("audit_whatsapp_destinations").insert(row).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "Could not save the WhatsApp destination.");

  if (input.consent) {
    await recordOptIn(supabase, {
      tenantId: input.tenantId,
      leadId,
      source: input.source,
      evidence: "Customer checked Audit WhatsApp delivery consent.",
    });
  } else {
    await recordOptOut(supabase, {
      tenantId: input.tenantId,
      leadId,
      reason: "Customer withdrew Audit WhatsApp delivery consent.",
    });
  }

  return data as AuditWhatsAppDestinationRow;
}

export async function setAuditWhatsAppConsent(
  supabase: ServiceClient,
  input: { tenantId: string; consent: boolean; source: string },
): Promise<AuditWhatsAppDestinationRow | null> {
  const existing = await loadAuditWhatsAppDestination(supabase, input.tenantId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("audit_whatsapp_destinations")
    .update({
      consent_opted_in: input.consent,
      consent_source: input.consent ? input.source : existing.consent_source,
      consent_captured_at: input.consent ? now : existing.consent_captured_at,
      consent_withdrawn_at: input.consent ? null : now,
      updated_at: now,
    })
    .eq("id", existing.id)
    .eq("tenant_id", input.tenantId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not update WhatsApp consent.");
  if (input.consent) {
    await recordOptIn(supabase, {
      tenantId: input.tenantId,
      leadId: existing.lead_id,
      source: input.source,
      evidence: "Customer enabled Audit WhatsApp delivery consent.",
    });
  } else {
    await recordOptOut(supabase, {
      tenantId: input.tenantId,
      leadId: existing.lead_id,
      reason: "Customer withdrew Audit WhatsApp delivery consent.",
    });
  }
  return data as AuditWhatsAppDestinationRow;
}

export async function destinationHasConsent(
  supabase: ServiceClient,
  tenantId: string,
  leadId: string,
  row: AuditWhatsAppDestinationRow,
): Promise<boolean> {
  if (!row.consent_opted_in || row.consent_withdrawn_at) return false;
  return hasMarketingConsent(supabase, tenantId, leadId);
}
