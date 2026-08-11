import type {
  ComplianceDecision,
  ComplianceOutcome,
  ComplianceReasonCode,
  QaCheckResult,
} from "../types.ts";

export interface BuildComplianceOutcomeInput {
  qaResults: readonly QaCheckResult[];
  reviewerDepartment: string;
  reviewerRole: string;
  crossTenantBlocked?: boolean;
  creatorIsSoleReviewer?: boolean;
  versionMismatch?: boolean;
  hardBlockReasons?: readonly ComplianceReasonCode[];
}

const BLOCK_CODES: ReadonlySet<ComplianceReasonCode> = new Set([
  "prohibited_claim",
  "missing_evidence",
  "cross_tenant_artifact",
  "unsupported_claim",
  "visual_defect",
  "technical_defect",
  "factuality_hard_gate",
  "high_creativity_low_factuality",
  "mediocrity",
  "creator_is_sole_reviewer",
  "compliance_hard_block",
]);

const REVISE_CODES: ReadonlySet<ComplianceReasonCode> = new Set([
  "brand_violation",
  "policy_violation",
  "version_mismatch",
]);

function collectReasonCodes(input: BuildComplianceOutcomeInput): ComplianceReasonCode[] {
  const codes = new Set<ComplianceReasonCode>();

  for (const qa of input.qaResults) {
    for (const finding of qa.findings) {
      codes.add(finding.reasonCode);
    }
  }

  if (input.crossTenantBlocked) codes.add("cross_tenant_artifact");
  if (input.creatorIsSoleReviewer) codes.add("creator_is_sole_reviewer");
  if (input.versionMismatch) codes.add("version_mismatch");
  for (const code of input.hardBlockReasons ?? []) codes.add(code);

  return [...codes];
}

function decideFromReasonCodes(codes: readonly ComplianceReasonCode[]): ComplianceDecision {
  if (codes.some((c) => BLOCK_CODES.has(c))) return "BLOCK";
  if (codes.some((c) => REVISE_CODES.has(c))) return "REVISE";
  return "PASS";
}

export function buildComplianceOutcome(input: BuildComplianceOutcomeInput): ComplianceOutcome {
  const reasonCodes = collectReasonCodes(input);
  const decision = decideFromReasonCodes(reasonCodes);
  const notes = input.qaResults.flatMap((qa) => qa.findings.map((f) => f.message));

  if (input.crossTenantBlocked) {
    notes.push("Cross-tenant artifact rejected");
  }
  if (input.creatorIsSoleReviewer) {
    notes.push("Creator cannot be sole reviewer");
  }
  if (input.versionMismatch) {
    notes.push("Reviewed version does not match artifact version");
  }

  return {
    decision,
    reasonCodes,
    legalCertification: false,
    reviewerDepartment: input.reviewerDepartment,
    reviewerRole: input.reviewerRole,
    notes,
  };
}

export function complianceBlocksRelease(outcome: ComplianceOutcome): boolean {
  return outcome.decision === "BLOCK";
}

export function complianceRequiresHumanReview(outcome: ComplianceOutcome): boolean {
  return outcome.decision === "HUMAN_REVIEW";
}

export function mergeComplianceDecisions(
  ...decisions: readonly ComplianceDecision[]
): ComplianceDecision {
  if (decisions.includes("BLOCK")) return "BLOCK";
  if (decisions.includes("HUMAN_REVIEW")) return "HUMAN_REVIEW";
  if (decisions.includes("REVISE")) return "REVISE";
  return "PASS";
}

export function assertLegalCertificationNeverGranted(outcome: ComplianceOutcome): void {
  if (outcome.legalCertification !== false) {
    throw new Error("legal_certification_must_remain_false");
  }
}
