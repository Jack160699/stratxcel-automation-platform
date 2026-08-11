import type { QaCheckResult, TrustArtifact } from "../types.ts";

export interface BrandCheckInput {
  artifact: TrustArtifact;
  brandRules?: readonly string[];
  reviewerDepartment?: string;
  reviewerRole?: string;
  brandFitScore?: number;
}

const DEFAULT_BRAND_RULES = [
  "no competitor bashing",
  "maintain professional tone",
  "avoid slang unless brand allows",
] as const;

export function checkBrandCompliance(input: BrandCheckInput): QaCheckResult {
  const reviewerDepartment = input.reviewerDepartment ?? "compliance";
  const reviewerRole = input.reviewerRole ?? "brand_rule_checker";
  const content = input.artifact.content.toLowerCase();
  const rules = input.brandRules ?? DEFAULT_BRAND_RULES;
  const findings: QaCheckResult["findings"][number][] = [];

  for (const rule of rules) {
    const normalized = rule.toLowerCase();
    if (normalized.includes("competitor") && /\b(worst|trash|stupid|idiot)\b/.test(content)) {
      findings.push({
        kind: "brand",
        severity: "warn",
        reasonCode: "brand_violation",
        message: `Brand rule violated: ${rule}`,
      });
    }
    if (normalized.includes("professional tone") && /\b(lmao|wtf|damn)\b/.test(content)) {
      findings.push({
        kind: "brand",
        severity: "warn",
        reasonCode: "brand_violation",
        message: `Brand rule violated: ${rule}`,
      });
    }
    if (normalized.includes("avoid slang") && /\b(yolo|lit|fam)\b/.test(content)) {
      findings.push({
        kind: "brand",
        severity: "warn",
        reasonCode: "brand_violation",
        message: `Brand rule violated: ${rule}`,
      });
    }
  }

  if (input.brandFitScore !== undefined && input.brandFitScore < 75 && input.brandFitScore >= 50) {
    findings.push({
      kind: "brand",
      severity: "warn",
      reasonCode: "brand_violation",
      message: "Brand fit below threshold but above hard reject",
    });
  }

  const suggestedDecision = findings.length > 0 ? "REVISE" : "PASS";

  return {
    reviewerDepartment,
    reviewerRole,
    findings,
    suggestedDecision,
  };
}

export function scoreBrandFitFromCheck(result: QaCheckResult, override?: number): number {
  if (override !== undefined) return override;
  if (result.findings.some((f) => f.reasonCode === "brand_violation")) return 62;
  return 85;
}
