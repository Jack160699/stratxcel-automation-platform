import type { ServiceClient } from "./db.ts";

export interface ContactConsentRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  channel: "whatsapp";
  opted_in: boolean;
  source: string | null;
  captured_at: string | null;
  evidence: string | null;
  opted_out_at: string | null;
  opt_out_reason: string | null;
  updated_at: string;
}

/**
 * No consent is ever invented — a contact with no row here has not
 * consented, full stop (fail closed). Recording an opt-in requires an
 * explicit source (e.g. "customer replied YES to opt-in prompt", "staff
 * recorded verbal consent at intake") — never inferred from the mere fact
 * that a customer sent an inbound message.
 */
export async function recordOptIn(
  supabase: ServiceClient,
  input: { tenantId: string; leadId: string; source: string; evidence?: string | null }
): Promise<ContactConsentRow> {
  const { data, error } = await supabase
    .from("contact_consent")
    .upsert(
      {
        tenant_id: input.tenantId,
        lead_id: input.leadId,
        channel: "whatsapp",
        opted_in: true,
        source: input.source,
        captured_at: new Date().toISOString(),
        evidence: input.evidence ?? null,
        opted_out_at: null,
        opt_out_reason: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,lead_id,channel" }
    )
    .select("*")
    .single();
  if (error) throw new Error(`recordOptIn: ${error.message}`);
  return data as ContactConsentRow;
}

export async function recordOptOut(
  supabase: ServiceClient,
  input: { tenantId: string; leadId: string; reason?: string | null }
): Promise<ContactConsentRow> {
  const { data, error } = await supabase
    .from("contact_consent")
    .upsert(
      {
        tenant_id: input.tenantId,
        lead_id: input.leadId,
        channel: "whatsapp",
        opted_in: false,
        opted_out_at: new Date().toISOString(),
        opt_out_reason: input.reason ?? "customer requested stop",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,lead_id,channel" }
    )
    .select("*")
    .single();
  if (error) throw new Error(`recordOptOut: ${error.message}`);
  return data as ContactConsentRow;
}

/**
 * Fail-closed: no row, an error, or an explicit opt-out all resolve to "not
 * consented." Only an explicit opted_in=true row with no later opt-out
 * authorizes an automated/marketing send.
 */
export async function hasMarketingConsent(supabase: ServiceClient, tenantId: string, leadId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("contact_consent")
    .select("opted_in, opted_out_at")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (error || !data) return false;
  return data.opted_in === true && data.opted_out_at === null;
}
