import type { LeadIntelligence, LeadQualificationArtifact, QualificationDecision } from "./types.ts";

export interface QualifyLeadInput {
  intelligence: LeadIntelligence;
  businessContext?: {
    offeredServices?: readonly string[];
    servedGeographies?: readonly string[];
  };
  nowIso?: string;
}

type CriterionResult = "pass" | "fail" | "unknown";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matchesAny(value: string, options: readonly string[]): boolean {
  const needle = normalize(value);
  return options.some((option) => normalize(option) === needle);
}

/** Qualify a lead from known intelligence only — budget is never inferred. */
export function qualifyLead(input: QualifyLeadInput): LeadQualificationArtifact {
  const { intelligence: intel, businessContext } = input;
  const generatedAtIso = input.nowIso ?? new Date().toISOString();
  const criteria: LeadQualificationArtifact["criteria"] = [];
  const unknownFields: string[] = ["budget"];

  const intentUnknown = intel.intent.status === "unknown" || intel.intent.value === null;
  const serviceUnknown = intel.serviceInterest.status === "unknown" || intel.serviceInterest.value === null;

  criteria.push({
    key: "intent",
    result: intentUnknown ? "unknown" : "pass",
    evidenceIds: [...intel.intent.evidenceIds],
    note: intentUnknown ? "Intent not recorded on lead" : "Intent recorded on lead",
  });
  if (intentUnknown) unknownFields.push("intent");

  criteria.push({
    key: "service_interest",
    result: serviceUnknown ? "unknown" : "pass",
    evidenceIds: [...intel.serviceInterest.evidenceIds],
    note: serviceUnknown ? "Service interest not recorded on lead" : "Service interest recorded on lead",
  });
  if (serviceUnknown) unknownFields.push("service_interest");

  const geographyUnknown = intel.geography.status === "unknown" || intel.geography.value === null;
  if (businessContext?.servedGeographies?.length) {
    let geoResult: CriterionResult = "unknown";
    if (!geographyUnknown && intel.geography.value) {
      geoResult = matchesAny(intel.geography.value, businessContext.servedGeographies) ? "pass" : "fail";
    } else {
      unknownFields.push("geography");
    }
    criteria.push({
      key: "geography",
      result: geoResult,
      evidenceIds: [...intel.geography.evidenceIds],
      note: geographyUnknown
        ? "Geography not recorded on lead"
        : geoResult === "fail"
          ? "Geography outside served areas"
          : "Geography within served areas",
    });
  } else if (!geographyUnknown) {
    criteria.push({
      key: "geography",
      result: "pass",
      evidenceIds: [...intel.geography.evidenceIds],
      note: "Geography recorded; no business geography filter applied",
    });
  } else {
    unknownFields.push("geography");
    criteria.push({
      key: "geography",
      result: "unknown",
      evidenceIds: [],
      note: "Geography not recorded on lead",
    });
  }

  criteria.push({
    key: "budget",
    result: "unknown",
    evidenceIds: [],
    note: "Budget is never inferred — remains unknown until explicitly captured",
  });

  let decision: QualificationDecision;
  let rationale: string;

  if (intentUnknown || serviceUnknown) {
    decision = "insufficient_evidence";
    rationale = "Material qualification fields (intent and/or service interest) are unknown";
  } else if (
    businessContext?.offeredServices?.length &&
    intel.serviceInterest.value &&
    !matchesAny(intel.serviceInterest.value, businessContext.offeredServices)
  ) {
    decision = "unqualified";
    rationale = "Recorded service interest is outside offered services";
  } else if (
    businessContext?.servedGeographies?.length &&
    intel.geography.value &&
    !matchesAny(intel.geography.value, businessContext.servedGeographies)
  ) {
    decision = "unqualified";
    rationale = "Recorded geography is outside served areas";
  } else {
    decision = "qualified";
    rationale = "Intent and service interest are known and align with business context";
  }

  return {
    tenantId: intel.tenantId,
    leadId: intel.leadId,
    decision,
    criteria,
    inventedFacts: [],
    unknownFields,
    rationale,
    generatedAtIso,
  };
}
