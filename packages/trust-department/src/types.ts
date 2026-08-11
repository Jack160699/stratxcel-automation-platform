import type {
  QualityCandidateArtifact,
  QualityCritiqueResult,
  QualityDecision,
  QualityPolicy,
  QualityScore,
} from "@stratxcel/workforce-core";

/** Compliance gate — distinct from quality PASS (GENERATED ≠ APPROVED). */
export type ComplianceDecision = "PASS" | "BLOCK" | "REVISE" | "HUMAN_REVIEW";

export type ComplianceReasonCode =
  | "prohibited_claim"
  | "missing_evidence"
  | "brand_violation"
  | "policy_violation"
  | "cross_tenant_artifact"
  | "unsupported_claim"
  | "visual_defect"
  | "technical_defect"
  | "factuality_hard_gate"
  | "high_creativity_low_factuality"
  | "mediocrity"
  | "creator_is_sole_reviewer"
  | "version_mismatch"
  | "compliance_hard_block";

export interface ComplianceOutcome {
  decision: ComplianceDecision;
  reasonCodes: readonly ComplianceReasonCode[];
  /** Trust department never grants legal certification. */
  legalCertification: false;
  reviewerDepartment: string;
  reviewerRole: string;
  notes: readonly string[];
}

export interface TrustArtifact extends QualityCandidateArtifact {
  tenantId: string;
  missionId: string;
  version: number;
  /** Model self-confidence — must not influence quality or compliance decisions. */
  modelConfidence?: number;
}

export interface RevisionRequest {
  artifactId: string;
  artifactVersion: number;
  requestedByDepartment: string;
  requestedByRole: string;
  reasonCodes: readonly ComplianceReasonCode[];
  requiredChanges: readonly string[];
  revisionNumber: number;
  createdAtIso: string;
}

export interface ReleaseReadiness {
  artifactId: string;
  artifactVersion: number;
  qualityPassed: boolean;
  compliancePassed: boolean;
  independentReviewComplete: boolean;
  versionMatchesReview: boolean;
  /** Advisory only — this module never executes publish. */
  readyToRelease: boolean;
  /** Always false: quality PASS ≠ publish authorization. */
  publishAuthorized: false;
  blockers: readonly string[];
}

export type QaCheckKind = "fact_claim" | "brand" | "visual" | "technical" | "policy" | "creative";

export interface QaFinding {
  kind: QaCheckKind;
  severity: "info" | "warn" | "block";
  reasonCode: ComplianceReasonCode;
  message: string;
}

export interface QaCheckResult {
  reviewerDepartment: string;
  reviewerRole: string;
  findings: readonly QaFinding[];
  suggestedDecision: ComplianceDecision;
}

export interface TrustEvaluationInput {
  artifact: TrustArtifact;
  tenantId: string;
  policy?: QualityPolicy;
  creatorDepartment: string;
  creatorRole: string;
  reviewerDepartment: string;
  reviewerRole: string;
  reviewedVersion: number;
  revisionCount?: number;
  scoreOverrides?: Partial<Record<QualityScore["dimension"], number>>;
  brandRules?: readonly string[];
  prohibitedPhrases?: readonly string[];
  unsupportedClaimPatterns?: readonly RegExp[];
  visualDefects?: readonly string[];
  technicalDefects?: readonly string[];
  customerApprovedCapabilities?: readonly string[];
  requestedCapabilities?: readonly string[];
}

export interface TrustEvaluationResult {
  artifactId: string;
  artifactVersion: number;
  quality: QualityCritiqueResult;
  compliance: ComplianceOutcome;
  qaResults: readonly QaCheckResult[];
  revisionRequest?: RevisionRequest;
  /** High model confidence must not override weak quality/compliance. */
  modelConfidenceIgnored: true;
}

export interface CustomerApprovalInput {
  tenantId: string;
  artifact: TrustArtifact;
  parentCapabilities: readonly string[];
  requestedCapabilities: readonly string[];
  compliance: ComplianceOutcome;
  qualityDecision: QualityDecision;
}

export type { QualityPolicy, QualityDecision, QualityScore, QualityCritiqueResult };
