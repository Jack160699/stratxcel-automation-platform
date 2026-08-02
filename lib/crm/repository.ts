import { createSupabaseServiceClient } from "../supabase/service";
import type { LeadRow, LeadSource, LeadStatus } from "./types";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export async function createLead(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    source: LeadSource;
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<LeadRow> {
  const { data, error } = await supabase
    .from("crm_leads")
    .insert({
      tenant_id: input.tenantId,
      source: input.source,
      contact_name: input.contactName ?? null,
      contact_phone: input.contactPhone ?? null,
      contact_email: input.contactEmail ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();
  if (error) throw new Error(`createLead: ${error.message}`);
  return data as LeadRow;
}

export async function updateLeadStatus(
  supabase: ServiceClient,
  input: { leadId: string; status: LeadStatus }
): Promise<LeadRow> {
  const { data, error } = await supabase
    .from("crm_leads")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("id", input.leadId)
    .select("*")
    .single();
  if (error) throw new Error(`updateLeadStatus: ${error.message}`);
  return data as LeadRow;
}

export async function findLeadByPhone(
  supabase: ServiceClient,
  tenantId: string,
  contactPhone: string
): Promise<LeadRow | null> {
  const { data, error } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("contact_phone", contactPhone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findLeadByPhone: ${error.message}`);
  return (data as LeadRow) ?? null;
}

export async function listLeads(
  supabase: ServiceClient,
  tenantId: string,
  limit = 100
): Promise<LeadRow[]> {
  const { data, error } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listLeads: ${error.message}`);
  return (data ?? []) as LeadRow[];
}
