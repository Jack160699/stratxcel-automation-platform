import type { QaCheckResult, TrustArtifact } from "../types.ts";

const DEFAULT_PROHIBITED = [
  "guaranteed results",
  "100% cure",
  "risk-free forever",
  "fda approved",
  "clinically proven without citation",
] as const;

export interface FactClaimCheckInput {
  artifact: TrustArtifact;
  reviewerDepartment?: string;
  reviewerRole?: string;
  prohibitedPhrases?: readonly string[];
  requireEvidenceForFactualClaims?: boolean;
}

function containsPhrase(content: string, phrase: string): boolean {
  return content.toLowerCase().includes(phrase.toLowerCase());
}

function hasFactualClaimLanguage(content: string): boolean {
  return /\b(studies show|research proves|data shows|clinically|guarantee|percent|%)\b/i.test(content);
}

export function checkFactClaims(input: FactClaimCheckInput): QaCheckResult {
  const reviewerDepartment = input.reviewerDepartment ?? "compliance";
  const reviewerRole = input.reviewerRole ?? "claim_checker";
  const content = input.artifact.content;
  const findings: QaCheckResult["findings"][number][] = [];
  const phrases = input.prohibitedPhrases ?? DEFAULT_PROHIBITED;

  for (const phrase of phrases) {
    if (containsPhrase(content, phrase)) {
      findings.push({
        kind: "fact_claim",
        severity: "block",
        reasonCode: "prohibited_claim",
        message: `Prohibited claim detected: "${phrase}"`,
      });
    }
  }

  const needsEvidence =
    input.requireEvidenceForFactualClaims ?? hasFactualClaimLanguage(content);

  if (needsEvidence && (input.artifact.evidenceIds?.length ?? 0) === 0) {
    findings.push({
      kind: "fact_claim",
      severity: "block",
      reasonCode: "missing_evidence",
      message: "Factual claim language requires supporting evidence",
    });
  }

  const factualityScore =
    findings.some((f) => f.reasonCode === "prohibited_claim") ? 20 :
    findings.some((f) => f.reasonCode === "missing_evidence") ? 35 :
    85;

  const originalityScore = /\b(innovative|bold|fresh|unique)\b/i.test(content) ? 92 : 70;
  if (originalityScore > 90 && factualityScore < 60) {
    findings.push({
      kind: "fact_claim",
      severity: "block",
      reasonCode: "high_creativity_low_factuality",
      message: "High creativity cannot compensate for low factuality",
    });
  }

  const suggestedDecision =
    findings.some((f) => f.severity === "block") ? "BLOCK" :
    findings.length > 0 ? "REVISE" :
    "PASS";

  return {
    reviewerDepartment,
    reviewerRole,
    findings,
    suggestedDecision,
  };
}

export function scoreFactualityFromClaims(result: QaCheckResult): number {
  if (result.findings.some((f) => f.reasonCode === "prohibited_claim")) return 15;
  if (result.findings.some((f) => f.reasonCode === "missing_evidence")) return 30;
  if (result.findings.some((f) => f.reasonCode === "high_creativity_low_factuality")) return 35;
  return 88;
}
