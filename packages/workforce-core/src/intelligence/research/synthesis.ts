import type { ResearchPlanArtifact, ResearchSynthesisArtifact, ScopedEvidenceRecord } from "../types.ts";
import { buildEvidenceClaim, filterScopedEvidence, type EvidenceValidationContext } from "../evidence/model.ts";
import { applyContradictionVerdicts, detectContradictions } from "../evidence/contradiction.ts";

export interface ResearchSynthesisInput {
  tenantId: string; missionId: string; currentDateIso: string; plan: ResearchPlanArtifact;
  evidenceRecords: readonly ScopedEvidenceRecord[]; gapStatements?: readonly string[];
}

export function synthesizeResearchFindings(input: ResearchSynthesisInput): ResearchSynthesisArtifact {
  const ctx: EvidenceValidationContext = { tenantId: input.tenantId, missionId: input.missionId, nowIso: input.currentDateIso };
  const scoped = filterScopedEvidence(input.evidenceRecords, ctx);
  const raw = scoped.flatMap((record, idx) => record.supportedClaims.map((statement, j) => buildEvidenceClaim({
    claimId: `c_${idx}_${j}`, statement, domain: record.sourceType,
    requestedStatus: record.isFirstParty ? "KNOWN" : "DERIVED", supportingRecords: [record], ctx,
  })));
  const contradictions = detectContradictions({ claims: raw, records: scoped, ctx });
  const claims = applyContradictionVerdicts(raw, contradictions);
  return {
    id: `synthesis_${input.missionId}`, tenantId: input.tenantId, missionId: input.missionId,
    summary: claims.some((c) => c.qualityVerdict === "SUPPORTED") ? `Synthesized ${claims.length} claims` : "Insufficient evidence — retain RESEARCH_REQUIRED",
    claims, gaps: input.gapStatements ?? [], evidenceIds: scoped.map((r) => r.id), generatedAtIso: input.currentDateIso,
  };
}
