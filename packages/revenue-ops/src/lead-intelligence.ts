import type {
  ClaimedField,
  CrmLifecycleStage,
  LeadIntelligence,
  LeadSource,
  LeadStatus,
} from "./types.ts";

/** CRM lead row shape aligned with `crm_leads` — no invented fields. */
export interface LeadRowInput {
  id: string;
  tenant_id: string;
  source: LeadSource;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: LeadStatus;
  metadata: Record<string, unknown>;
  tags?: string[];
  assigned_to: string | null;
  last_interaction_at: string | null;
  next_follow_up_at: string | null;
  notes?: string | null;
}

export interface LeadIntelligenceInput {
  lead: LeadRowInput;
  nowIso?: string;
  consent?: {
    optedIn: boolean | null;
    optedOut: boolean;
    provenance: string | null;
    evidenceIds?: readonly string[];
  };
  conversation?: {
    lastOutboundAt?: string | null;
    language?: string | null;
    appointmentScheduled?: boolean;
    proposalSent?: boolean;
  };
  overdueFollowUp?: boolean;
}

function known<T>(value: T, evidenceIds: readonly string[] = []): ClaimedField<T> {
  return { value, status: "known", evidenceIds };
}

function derived<T>(value: T, evidenceIds: readonly string[]): ClaimedField<T> {
  return { value, status: "derived", evidenceIds };
}

function unknownField<T>(): ClaimedField<T> {
  return { value: null, status: "unknown", evidenceIds: [] };
}

function stringFromMeta(metadata: Record<string, unknown>, key: string): string | null {
  const raw = metadata[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

function urgencyFromMeta(metadata: Record<string, unknown>): ClaimedField<"low" | "medium" | "high"> {
  const raw = metadata.urgency;
  if (raw === "low" || raw === "medium" || raw === "high") {
    return known(raw, [`lead:metadata.urgency`]);
  }
  return unknownField();
}

function resolveLifecycleStage(input: LeadIntelligenceInput): ClaimedField<CrmLifecycleStage> {
  const { lead, conversation, overdueFollowUp } = input;
  const evidenceIds: string[] = [`lead:status:${lead.status}`];

  if (overdueFollowUp) {
    return derived("follow_up_due", [...evidenceIds, "lead:next_follow_up_at"]);
  }
  if (conversation?.proposalSent) {
    return derived("proposal_sent", [...evidenceIds, "conversation:proposalSent"]);
  }
  if (conversation?.appointmentScheduled) {
    return derived("appointment_scheduled", [...evidenceIds, "conversation:appointmentScheduled"]);
  }

  const metaStage = stringFromMeta(lead.metadata, "lifecycle_stage");
  if (metaStage) {
    return known(metaStage as CrmLifecycleStage, [`lead:metadata.lifecycle_stage`]);
  }

  switch (lead.status) {
    case "NEW":
      return derived("new_lead", evidenceIds);
    case "CONTACTED":
      return derived("contacted", evidenceIds);
    case "QUALIFIED":
      return derived("qualified", evidenceIds);
    case "WON":
      return derived("won", evidenceIds);
    case "LOST":
      return derived("lost", evidenceIds);
    default:
      return unknownField();
  }
}

function resolveQualification(status: LeadStatus): ClaimedField<"qualified" | "unqualified" | "needs_review"> {
  switch (status) {
    case "QUALIFIED":
      return derived("qualified", [`lead:status:${status}`]);
    case "LOST":
      return derived("unqualified", [`lead:status:${status}`]);
    case "NEW":
    case "CONTACTED":
      return derived("needs_review", [`lead:status:${status}`]);
    default:
      return unknownField();
  }
}

/** Map CRM lead rows to a conservative intelligence overlay — never invent facts. */
export function buildLeadIntelligence(input: LeadIntelligenceInput): LeadIntelligence {
  const { lead, consent, conversation } = input;
  const generatedAtIso = input.nowIso ?? new Date().toISOString();
  const meta = lead.metadata ?? {};
  const leadEvidence = (suffix: string) => [`lead:${lead.id}:${suffix}`];

  const intentValue = stringFromMeta(meta, "intent");
  const serviceValue = stringFromMeta(meta, "service_interest");
  const geographyValue = stringFromMeta(meta, "geography");
  const campaignValue = stringFromMeta(meta, "campaign");
  const languageValue = conversation?.language ?? stringFromMeta(meta, "language");

  const consentEvidence = consent?.evidenceIds?.length
    ? [...consent.evidenceIds]
    : consent?.provenance
      ? leadEvidence("consent")
      : [];

  const lastResponse =
    conversation?.lastOutboundAt ?? lead.last_interaction_at ?? null;

  return {
    tenantId: lead.tenant_id,
    leadId: lead.id,
    source: known(lead.source, leadEvidence("source")),
    campaign: campaignValue ? known(campaignValue, leadEvidence("metadata.campaign")) : unknownField(),
    contact: {
      name: lead.contact_name ? known(lead.contact_name, leadEvidence("contact_name")) : unknownField(),
      phone: lead.contact_phone ? known(lead.contact_phone, leadEvidence("contact_phone")) : unknownField(),
      email: lead.contact_email ? known(lead.contact_email, leadEvidence("contact_email")) : unknownField(),
      language: languageValue ? known(languageValue, leadEvidence("language")) : unknownField(),
    },
    intent: intentValue ? known(intentValue, leadEvidence("metadata.intent")) : unknownField(),
    serviceInterest: serviceValue
      ? known(serviceValue, leadEvidence("metadata.service_interest"))
      : unknownField(),
    geography: geographyValue ? known(geographyValue, leadEvidence("metadata.geography")) : unknownField(),
    urgency: urgencyFromMeta(meta),
    qualification: resolveQualification(lead.status),
    lifecycleStage: resolveLifecycleStage(input),
    consent: {
      whatsappMarketing:
        consent?.optedIn === true
          ? known(true, consentEvidence)
          : consent?.optedIn === false
            ? known(false, consentEvidence)
            : unknownField(),
      provenance: consent?.provenance
        ? known(consent.provenance, consentEvidence)
        : unknownField(),
      optedOut:
        consent?.optedOut === true
          ? known(true, consentEvidence)
          : consent?.optedOut === false
            ? known(false, consentEvidence)
            : unknownField(),
    },
    assignedOwner: lead.assigned_to ? known(lead.assigned_to, leadEvidence("assigned_to")) : unknownField(),
    lastResponseAt: lastResponse ? known(lastResponse, leadEvidence("last_response")) : unknownField(),
    nextAction: lead.next_follow_up_at
      ? known(lead.next_follow_up_at, leadEvidence("next_follow_up_at"))
      : unknownField(),
    crmStatus: lead.status,
    generatedAtIso,
  };
}
