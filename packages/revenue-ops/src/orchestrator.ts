import { buildCrmFollowUpPlan } from "./follow-up-plan.ts";
import { buildLeadIntelligence, type LeadRowInput } from "./lead-intelligence.ts";
import { qualifyLead } from "./qualification.ts";
import { diagnoseResponseTime, type LeadTimingSample } from "./response-time.ts";
import { buildWhatsAppFollowUpSequence, type WhatsAppSequenceContext } from "./whatsapp-sequence.ts";
import { diagnoseConversion, buildConversionPlan } from "./conversion.ts";
import { buildRevenueAuditIntelligence } from "./audit-intelligence.ts";
import { evaluateHumanHandoff } from "./handoff.ts";
import { authorizeRevenueMutation } from "./authorization.ts";
import { assertSameTenant } from "./tenant-scope.ts";
import type {
  ConversionDiagnosis,
  ConversionPlan,
  CrmFollowUpPlanArtifact,
  HumanHandoffDecision,
  LeadIntelligence,
  LeadQualificationArtifact,
  MutationGateResult,
  ResponseTimeDiagnosis,
  RevenueAnalyticsEvent,
  RevenueAuditIntelligence,
  WhatsAppFollowUpSequenceArtifact,
} from "./types.ts";

export interface RevenueWorkflowInput {
  tenantId: string;
  leads: readonly LeadRowInput[];
  timingSamples: readonly LeadTimingSample[];
  events?: readonly RevenueAnalyticsEvent[];
  consentByLeadId?: Record<string, { optedIn: boolean | null; optedOut: boolean; provenance: string | null }>;
  conversationByLeadId?: Record<
    string,
    WhatsAppSequenceContext & {
      lastOutboundAt?: string | null;
      language?: string | null;
      appointmentScheduled?: boolean;
      proposalSent?: boolean;
      tenantId?: string;
    }
  >;
  businessContext?: { offeredServices?: readonly string[]; servedGeographies?: readonly string[] };
  latestCustomerMessageByLeadId?: Record<string, string>;
  nowIso?: string;
}

export interface RevenueWorkflowResult {
  workflowFocus: "crm_whatsapp_conversion";
  requiresSocial: false;
  response: ResponseTimeDiagnosis;
  intelligences: LeadIntelligence[];
  qualifications: LeadQualificationArtifact[];
  followUpPlans: CrmFollowUpPlanArtifact[];
  whatsappSequences: WhatsAppFollowUpSequenceArtifact[];
  conversion: ConversionDiagnosis;
  conversionPlan: ConversionPlan;
  audit: RevenueAuditIntelligence;
  handoffs: Array<{ leadId: string; decision: HumanHandoffDecision }>;
  productionMutations: [];
  sendAttempts: [];
}

/** End-to-end Revenue pass: diagnose → qualify → plan → draft. No production sends. */
export function runRevenueWorkflow(input: RevenueWorkflowInput): RevenueWorkflowResult {
  for (const lead of input.leads) assertSameTenant(input.tenantId, lead.tenant_id, "lead");

  const nowIso = input.nowIso ?? new Date().toISOString();
  const response = diagnoseResponseTime({ tenantId: input.tenantId, leads: input.timingSamples, nowIso });

  const intelligences: LeadIntelligence[] = [];
  const qualifications: LeadQualificationArtifact[] = [];
  const followUpPlans: CrmFollowUpPlanArtifact[] = [];
  const whatsappSequences: WhatsAppFollowUpSequenceArtifact[] = [];
  const handoffs: Array<{ leadId: string; decision: HumanHandoffDecision }> = [];

  for (const lead of input.leads) {
    const consent = input.consentByLeadId?.[lead.id];
    const conv = input.conversationByLeadId?.[lead.id];
    if (conv?.tenantId) assertSameTenant(input.tenantId, conv.tenantId, "conversation");

    const intel = buildLeadIntelligence({
      lead,
      nowIso,
      consent: consent
        ? {
            optedIn: consent.optedIn,
            optedOut: consent.optedOut,
            provenance: consent.provenance,
            evidenceIds: consent.provenance ? [`consent:${lead.id}`] : [],
          }
        : undefined,
      conversation: conv
        ? {
            lastOutboundAt: conv.lastOutboundAt ?? null,
            language: conv.language ?? null,
            appointmentScheduled: conv.appointmentScheduled,
            proposalSent: conv.proposalSent,
          }
        : undefined,
      overdueFollowUp: lead.next_follow_up_at
        ? new Date(lead.next_follow_up_at).getTime() < new Date(nowIso).getTime()
        : false,
    });
    intelligences.push(intel);

    const qualification = qualifyLead({ intelligence: intel, businessContext: input.businessContext, nowIso });
    qualifications.push(qualification);

    const plan = buildCrmFollowUpPlan({ intelligence: intel, qualification, nowIso });
    followUpPlans.push(plan);

    whatsappSequences.push(
      buildWhatsAppFollowUpSequence({
        intelligence: intel,
        plan,
        context: {
          conversationId: conv?.conversationId,
          automationMode: conv?.automationMode,
          insideSessionWindow: conv?.insideSessionWindow,
          approvedTemplates: conv?.approvedTemplates,
          customerLanguage: conv?.language ?? intel.contact.language.value,
          nowIso,
        },
      }),
    );

    handoffs.push({
      leadId: lead.id,
      decision: evaluateHumanHandoff({
        intelligence: intel,
        latestCustomerMessage: input.latestCustomerMessageByLeadId?.[lead.id],
        unclearIntent: qualification.decision === "insufficient_evidence",
        highValue: lead.metadata?.high_value === true,
      }),
    });
  }

  const conversion = diagnoseConversion({ tenantId: input.tenantId, events: input.events ?? [], nowIso });
  const conversionPlan = buildConversionPlan({ diagnosis: conversion, nowIso });
  const audit = buildRevenueAuditIntelligence({
    tenantId: input.tenantId,
    response,
    leads: intelligences,
    qualifications,
    conversion,
    nowIso,
  });

  return {
    workflowFocus: "crm_whatsapp_conversion",
    requiresSocial: false,
    response,
    intelligences,
    qualifications,
    followUpPlans,
    whatsappSequences,
    conversion,
    conversionPlan,
    audit,
    handoffs,
    productionMutations: [],
    sendAttempts: [],
  };
}

export function gateCrmWrite(input: {
  tenantId: string;
  leadTenantId: string;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | null;
  standingAuthorization?: boolean;
}): MutationGateResult {
  return authorizeRevenueMutation({
    tenantId: input.tenantId,
    resourceTenantId: input.leadTenantId,
    kind: "crm.write",
    approvalStatus: input.approvalStatus,
    standingAuthorization: input.standingAuthorization,
  });
}

export function gateWhatsAppSend(input: {
  tenantId: string;
  leadTenantId: string;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | null;
  standingAuthorization?: boolean;
  standingAuthorizationKind?: "crm.write" | "whatsapp.send";
  optedOut?: boolean;
  hasMarketingConsent?: boolean;
  outsideSessionWindow?: boolean;
  hermesProposedText?: string | null;
  conversationAutomationMode?: "automated" | "human_only" | "paused" | "handoff" | null;
  isHumanInitiated?: boolean;
}): MutationGateResult {
  const { leadTenantId, ...rest } = input;
  return authorizeRevenueMutation({
    ...rest,
    resourceTenantId: leadTenantId,
    kind: "whatsapp.send",
    standingAuthorizationKind:
      rest.standingAuthorizationKind ??
      (rest.standingAuthorization ? "whatsapp.send" : undefined),
  });
}
