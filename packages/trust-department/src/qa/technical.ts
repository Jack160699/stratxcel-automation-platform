import type { QaCheckResult, TrustArtifact } from "../types.ts";

export interface TechnicalCheckInput {
  artifact: TrustArtifact;
  technicalDefects?: readonly string[];
  technicalQualityScore?: number;
  reviewerDepartment?: string;
  reviewerRole?: string;
}

const DEFAULT_TECHNICAL_DEFECTS = [
  "missing error handling",
  "no retry policy",
  "single point of failure",
  "unbounded timeout",
  "missing observability",
] as const;

export function checkTechnicalQuality(input: TechnicalCheckInput): QaCheckResult {
  const reviewerDepartment = input.reviewerDepartment ?? "engineering";
  const reviewerRole = input.reviewerRole ?? "reliability_reviewer";
  const content = input.artifact.content.toLowerCase();
  const defects = input.technicalDefects ?? [];
  const findings: QaCheckResult["findings"][number][] = [];

  for (const defect of [...DEFAULT_TECHNICAL_DEFECTS, ...defects]) {
    if (content.includes(defect.toLowerCase())) {
      findings.push({
        kind: "technical",
        severity: "block",
        reasonCode: "technical_defect",
        message: `Technical reliability issue: ${defect}`,
      });
    }
  }

  if (input.technicalQualityScore !== undefined && input.technicalQualityScore < 55) {
    findings.push({
      kind: "technical",
      severity: "block",
      reasonCode: "technical_defect",
      message: "Technical quality score below hard gate",
    });
  }

  const suggestedDecision = findings.some((f) => f.severity === "block") ? "BLOCK" : "PASS";

  return {
    reviewerDepartment,
    reviewerRole,
    findings,
    suggestedDecision,
  };
}

export function scoreTechnicalQualityFromCheck(result: QaCheckResult, override?: number): number {
  if (override !== undefined) return override;
  if (result.findings.some((f) => f.reasonCode === "technical_defect")) return 42;
  return 84;
}
