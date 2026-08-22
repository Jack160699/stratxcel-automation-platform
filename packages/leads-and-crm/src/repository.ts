import type { ServiceClient } from "./db.ts";
import type { LeadRow, LeadSource, LeadStatus } from "./types.ts";

export async function createLead(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    source: LeadSource;
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    normalizedPhone?: string | null;
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
      normalized_phone: input.normalizedPhone ?? null,
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

export async function updateLead(
  supabase: ServiceClient,
  input: {
    leadId: string;
    tenantId: string;
    tags?: string[];
    assignedTo?: string | null;
    notes?: string | null;
    nextFollowUpAt?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<LeadRow> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.nextFollowUpAt !== undefined) patch.next_follow_up_at = input.nextFollowUpAt;
  if (input.contactName !== undefined) patch.contact_name = input.contactName;
  if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  const { data, error } = await supabase.from("crm_leads").update(patch).eq("id", input.leadId).eq("tenant_id", input.tenantId).select("*").single();
  if (error) throw new Error(`updateLead: ${error.message}`);
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

/** Preferred over findLeadByPhone for dedupe — matches on the normalized form so "9876543210" and "+91 98765 43210" resolve to the same contact. */
export async function findLeadByNormalizedPhone(
  supabase: ServiceClient,
  tenantId: string,
  normalizedPhone: string
): Promise<LeadRow | null> {
  const { data, error } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("normalized_phone", normalizedPhone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findLeadByNormalizedPhone: ${error.message}`);
  return (data as LeadRow) ?? null;
}

export async function listLeads(supabase: ServiceClient, tenantId: string, limit = 100): Promise<LeadRow[]> {
  const { data, error } = await supabase
    .from("crm_leads")
    .select("id, tenant_id, source, contact_name, contact_phone, contact_email, status, metadata, tags, assigned_to, last_interaction_at, next_follow_up_at, notes, normalized_phone, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listLeads: ${error.message}`);
  return (data ?? []) as LeadRow[];
}
