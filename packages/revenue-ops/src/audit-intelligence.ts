import type {
  ConversionDiagnosis,
  LeadIntelligence,
  LeadQualificationArtifact,
  ResponseTimeDiagnosis,
  RevenueAuditIntelligence,
} from "./types.ts";

/** Expose revenue intelligence slices for Business Audit. */
export function buildRevenueAuditIntelligence(input: {
  tenantId: string;
  response: ResponseTimeDiagnosis;
  leads: readonly LeadIntelligence[];
  qualifications?: readonly LeadQualificationArtifact[];
  conversion?: ConversionDiagnosis | null;
  nowIso?: string;
}): RevenueAuditIntelligence {
  const missingOwner = input.leads.filter((l) => !l.assignedOwner.value).length;
  const missingNext = input.leads.filter((l) => !l.nextAction.value).length;
  const insufficient = (input.qualifications ?? []).filter((q) => q.decision === "insufficient_evidence").length;

  return {
    tenantId: input.tenantId,
    responseSpeed: {
      medianHours: input.response.medianResponseTimeHours,
      unansweredLeads: input.response.unansweredLeads,
      newLeadsWaiting: input.response.newLeadsWaiting,
      status: input.response.sampleSize > 0 || input.response.unansweredLeads > 0 ? "KNOWN" : "UNKNOWN",
    },
    crmHygiene: {
      leadsMissingOwner: missingOwner,
      leadsMissingNextAction: missingNext,
      status: input.leads.length ? "DERIVED" : "UNKNOWN",
    },
    followUpGaps: {
      overdueCount: input.response.overdueFollowUps,
      status: "KNOWN",
    },
    leadQualificationGaps: {
      insufficientEvidenceCount: insufficient,
      status: input.qualifications?.length ? "KNOWN" : "UNKNOWN",
    },
    conversionFunnelGaps: {
      primaryLeak: input.conversion?.primaryLeak ?? null,
      status: input.conversion ? "DERIVED" : "UNKNOWN",
    },
    generatedAtIso: input.nowIso ?? new Date().toISOString(),
  };
}
