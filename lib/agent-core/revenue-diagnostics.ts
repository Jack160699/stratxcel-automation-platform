/**
 * Real inputs for packages/revenue-ops's runRevenueWorkflow -- the "Economic
 * Intelligence" section of the master brief. Every real production caller
 * of runRevenueWorkflow/toBusinessGrowthSignals before this was its own
 * package's test suite (see capability:revenue_ops_workflow_pipeline,
 * recorded REAL_NOT_EXPOSED). This file builds its two required inputs
 * (LeadRowInput[], LeadTimingSample[]) and three optional-but-honestly-
 * available ones (consentByLeadId, latestCustomerMessageByLeadId, a real
 * lastOutboundAt per lead) entirely from real tables: crm_leads,
 * whatsapp_messages, contact_consent.
 *
 * Deliberately NOT sourced here (left for the caller to omit, which
 * runRevenueWorkflow's own optional fields handle safely): `events` for
 * diagnoseConversion (no analytics-conversion-event table has been verified
 * yet) and conversationByLeadId's automationMode/insideSessionWindow/
 * approvedTemplates (a different subsystem -- whatsapp_conversations/
 * social_whatsapp_sessions -- not traced in this pass). Both are honestly
 * absent, not fabricated; diagnoseConversion and buildWhatsAppFollowUpSequence
 * both handle missing optional context without inventing data (confirmed by
 * reading their source before wiring this).
 */
import type { LeadRowInput, LeadSource, LeadStatus } from "@stratxcel/revenue-ops";
import type { LeadTimingSample } from "@stratxcel/revenue-ops";

interface MinimalSupabase {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

const KNOWN_SOURCES = new Set<LeadSource>(["whatsapp", "website_form", "manual", "import"]);
/** whatsapp_outreach is a real crm_leads.source value not modeled in revenue-ops's
 * LeadSource union (a WhatsApp-originated outbound lead, not an inbound one) --
 * mapped to "whatsapp" (the closest real category) rather than dropped or guessed
 * at something unrelated. Any other unrecognized future value falls back to "manual". */
function normalizeLeadSource(raw: string): LeadSource {
  if (KNOWN_SOURCES.has(raw as LeadSource)) return raw as LeadSource;
  if (raw === "whatsapp_outreach") return "whatsapp";
  return "manual";
}

interface RawCrmLead {
  id: string;
  tenant_id: string;
  source: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  tags: string[] | null;
  assigned_to: string | null;
  last_interaction_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  created_at: string;
}

/** LeadRowInput plus the real crm_leads.created_at -- LeadRowInput itself
 * (packages/revenue-ops) has no created_at field, but computeRealMessageDerivedFacts
 * needs the lead's real creation time (not last_interaction_at, and never "now") to
 * measure real response time. A structural superset of LeadRowInput, so it is
 * still assignable anywhere LeadRowInput is expected. */
export interface RealLeadRow extends LeadRowInput {
  created_at: string;
}

export async function computeRealLeadRows(supabase: MinimalSupabase, tenantId: string): Promise<RealLeadRow[]> {
  const { data } = await supabase
    .from("crm_leads")
    .select("id, tenant_id, source, contact_name, contact_phone, contact_email, status, metadata, tags, assigned_to, last_interaction_at, next_follow_up_at, notes, created_at")
    .eq("tenant_id", tenantId);
  const rows = (data ?? []) as RawCrmLead[];
  return rows.map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    source: normalizeLeadSource(r.source),
    contact_name: r.contact_name,
    contact_phone: r.contact_phone,
    contact_email: r.contact_email,
    status: r.status as LeadStatus,
    metadata: r.metadata ?? {},
    tags: r.tags ?? undefined,
    assigned_to: r.assigned_to,
    last_interaction_at: r.last_interaction_at,
    next_follow_up_at: r.next_follow_up_at,
    notes: r.notes,
    created_at: r.created_at,
  }));
}

interface RawWhatsAppMessage {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  direction: "inbound" | "outbound";
  body: string | null;
  created_at: string;
}

export interface RealMessageDerivedFacts {
  timingSamples: LeadTimingSample[];
  lastOutboundAtByLeadId: Record<string, string>;
  latestInboundBodyByLeadId: Record<string, string>;
}

/**
 * One real whatsapp_messages query per tenant, grouped in memory by lead_id
 * -- avoids an N+1 query per lead. Leads with zero messages are honestly
 * included with firstOutboundAtIso: null (never contacted yet), matching
 * diagnoseResponseTime's own "new lead waiting" signal.
 */
export async function computeRealMessageDerivedFacts(
  supabase: MinimalSupabase,
  tenantId: string,
  leads: readonly { id: string; status: LeadStatus; created_at: string; next_follow_up_at: string | null }[],
): Promise<RealMessageDerivedFacts> {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id, tenant_id, lead_id, direction, body, created_at")
    .eq("tenant_id", tenantId);
  const rows = ((data ?? []) as RawWhatsAppMessage[]).filter((m) => m.lead_id);

  const byLead = new Map<string, RawWhatsAppMessage[]>();
  for (const m of rows) {
    const list = byLead.get(m.lead_id!) ?? [];
    list.push(m);
    byLead.set(m.lead_id!, list);
  }
  for (const list of byLead.values()) list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const lastOutboundAtByLeadId: Record<string, string> = {};
  const latestInboundBodyByLeadId: Record<string, string> = {};
  const timingSamples: LeadTimingSample[] = [];

  for (const lead of leads) {
    const messages = byLead.get(lead.id) ?? [];
    const firstOutbound = messages.find((m) => m.direction === "outbound") ?? null;
    const lastOutbound = [...messages].reverse().find((m) => m.direction === "outbound") ?? null;
    const lastMessage = messages[messages.length - 1] ?? null;
    const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound") ?? null;

    if (lastOutbound) lastOutboundAtByLeadId[lead.id] = lastOutbound.created_at;
    if (lastInbound?.body) latestInboundBodyByLeadId[lead.id] = lastInbound.body;

    timingSamples.push({
      leadId: lead.id,
      createdAtIso: lead.created_at,
      firstOutboundAtIso: firstOutbound?.created_at ?? null,
      status: lead.status,
      nextFollowUpAtIso: lead.next_follow_up_at,
      // A real, direct signal: the most recent message on this lead's thread
      // is inbound (the customer spoke last) -- never a guess.
      hasPendingInbound: lastMessage !== null && lastMessage.direction === "inbound",
    });
  }

  return { timingSamples, lastOutboundAtByLeadId, latestInboundBodyByLeadId };
}

interface RawConsentRow {
  lead_id: string;
  opted_in: boolean | null;
  opted_out_at: string | null;
  source: string | null;
}

export interface RealConsentFacts {
  optedIn: boolean | null;
  optedOut: boolean;
  provenance: string | null;
}

export async function computeRealConsentByLeadId(
  supabase: MinimalSupabase,
  tenantId: string,
): Promise<Record<string, RealConsentFacts>> {
  const { data } = await supabase
    .from("contact_consent")
    .select("lead_id, opted_in, opted_out_at, source")
    .eq("tenant_id", tenantId);
  const rows = (data ?? []) as RawConsentRow[];
  const byLeadId: Record<string, RealConsentFacts> = {};
  for (const r of rows) {
    if (!r.lead_id) continue;
    byLeadId[r.lead_id] = {
      optedIn: r.opted_in,
      optedOut: r.opted_out_at !== null,
      provenance: r.source,
    };
  }
  return byLeadId;
}
