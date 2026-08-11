import { createMissionBudget } from "../../budgets/hierarchy.ts";
import { diagnoseBusinessGrowth, resolveEntryMode } from "../../planning/diagnosis.ts";
import type { BusinessGrowthDiagnosisFinding } from "../../planning/growth-types.ts";
import type { BusinessMaturity, BusinessStrength, IntelligenceDiagnosisInput, IntelligenceDiagnosisResult } from "../types.ts";
import { assessBrandReadiness } from "../brand/readiness.ts";
import { assessEvidenceQuality, filterScopedEvidence } from "../evidence/model.ts";

function maturity(input: IntelligenceDiagnosisInput, entry: ReturnType<typeof resolveEntryMode>): BusinessMaturity {
  const s = input.plannerInput.businessSignals ?? input.businessSignals ?? {};
  if (entry === "NEW_BUSINESS" || s.hasWebsite === false) return "PRE_LAUNCH";
  if (typeof s.monthlyInquiries === "number" && s.monthlyInquiries >= 100) return "GROWTH";
  if (s.websiteTrafficStrength === "high" || s.socialPresenceStrength === "high") return "ESTABLISHED";
  return "UNKNOWN";
}

function strengths(findings: readonly BusinessGrowthDiagnosisFinding[]): BusinessStrength[] {
  return findings.filter((f) => f.severity === "info" || f.recommendedActionClass.startsWith("preserve_")).map((f, i) => ({
    id: `st_${i + 1}`, label: f.domain, domain: f.domain, description: f.finding, evidenceIds: [...f.evidenceIds], confidence: f.confidence,
  }));
}

export function runIntelligenceDiagnosis(input: IntelligenceDiagnosisInput): IntelligenceDiagnosisResult {
  const plannerInput = { ...input.plannerInput, budgetEnvelope: input.plannerInput.budgetEnvelope ?? createMissionBudget(0) };
  const entryMode = resolveEntryMode(plannerInput);
  const diagnosis = diagnoseBusinessGrowth(plannerInput);
  assessBrandReadiness(plannerInput.brandBrain);
  const ctx = { tenantId: plannerInput.tenantId, missionId: plannerInput.missionId, nowIso: plannerInput.currentDateIso };
  const scoped = filterScopedEvidence(input.evidenceRecords ?? [], ctx);
  const quality = assessEvidenceQuality(scoped, ctx);
  const hasEvidence = (plannerInput.businessSignals?.signalEvidenceIds?.length ?? 0) > 0 || plannerInput.existingResearchEvidence.length > 0;
  const evidenceCoverage = quality === "INSUFFICIENT" && !hasEvidence ? "INSUFFICIENT_EVIDENCE" : "SUFFICIENT";
  const signals = plannerInput.businessSignals ?? {};
  const foundationStatus = entryMode === "NEW_BUSINESS" && signals.hasWebsite === false ? "MISSING_FOUNDATION" : signals.hasWebsite === false ? "PARTIAL" : "COMPLETE";
  return {
    tenantId: plannerInput.tenantId, missionId: plannerInput.missionId, entryMode, maturity: maturity(input, entryMode), strengths: strengths(diagnosis.findings),
    diagnosis: {
      ...diagnosis,
      executiveSummary: foundationStatus === "MISSING_FOUNDATION" ? "New business without website: MISSING_FOUNDATION before channel scale." : evidenceCoverage === "INSUFFICIENT_EVIDENCE" ? "Insufficient evidence — missing data is not poor performance." : diagnosis.executiveSummary,
      researchGaps: evidenceCoverage === "INSUFFICIENT_EVIDENCE" ? [...diagnosis.researchGaps, "Research required for external performance claims"] : diagnosis.researchGaps,
    },
    foundationStatus, evidenceCoverage,
    researchRequired: evidenceCoverage === "INSUFFICIENT_EVIDENCE" || diagnosis.researchGaps.length > 0,
    generatedAtIso: plannerInput.currentDateIso,
  };
}

export { resolveEntryMode, diagnoseBusinessGrowth };
