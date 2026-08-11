import type { QaCheckResult, TrustArtifact } from "../types.ts";

export interface VisualCheckInput {
  artifact: TrustArtifact;
  visualDefects?: readonly string[];
  visualQualityScore?: number;
  reviewerDepartment?: string;
  reviewerRole?: string;
}

const DEFAULT_DEFECT_MARKERS = [
  "text cutoff",
  "logo distortion",
  "aspect ratio mismatch",
  "low resolution",
  "off-brand colors",
] as const;

export function checkVisualQuality(input: VisualCheckInput): QaCheckResult {
  const reviewerDepartment = input.reviewerDepartment ?? "quality";
  const reviewerRole = input.reviewerRole ?? "visual_qa";
  const content = input.artifact.content.toLowerCase();
  const defects = input.visualDefects ?? [];
  const findings: QaCheckResult["findings"][number][] = [];

  for (const defect of [...DEFAULT_DEFECT_MARKERS, ...defects]) {
    if (content.includes(defect.toLowerCase())) {
      findings.push({
        kind: "visual",
        severity: "block",
        reasonCode: "visual_defect",
        message: `Visual defect detected: ${defect}`,
      });
    }
  }

  if (input.visualQualityScore !== undefined && input.visualQualityScore < 55) {
    findings.push({
      kind: "visual",
      severity: "block",
      reasonCode: "visual_defect",
      message: "Visual quality score below hard gate",
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

export function scoreVisualQualityFromCheck(result: QaCheckResult, override?: number): number {
  if (override !== undefined) return override;
  if (result.findings.some((f) => f.reasonCode === "visual_defect")) return 40;
  return 82;
}
