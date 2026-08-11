import {
  CapabilityEscalationError,
  assertSameTenantArtifact,
  critiqueCandidate,
  narrowCapabilityClasses,
} from "@stratxcel/workforce-core";

import { auditGenericUnsupportedClaims } from "../audit/claim-guard.ts";
import { buildComplianceOutcome } from "../compliance/outcomes.ts";
import { checkCreativeMediocrity } from "../creative/mediocrity-gate.ts";
import { getArtifactTrustPolicy } from "../policies/artifact-policies.ts";
import { checkBrandCompliance, scoreBrandFitFromCheck } from "../qa/brand.ts";
import { checkFactClaims, scoreFactualityFromClaims } from "../qa/fact-claim.ts";
import { checkTechnicalQuality, scoreTechnicalQualityFromCheck } from "../qa/technical.ts";
import { checkVisualQuality, scoreVisualQualityFromCheck } from "../qa/visual.ts";
import { assertIndependentReviewer } from "../roles/reviewers.ts";
import {
  createRevisionRequest,
  enforceRevisionCap,
  nextRevisionNumber,
} from "../quality/revision.ts";
import type {
  CustomerApprovalInput,
  QaCheckResult,
  TrustEvaluationInput,
  TrustEvaluationResult,
} from "../types.ts";

export interface CustomerApprovalResult {
  approved: boolean;
  publishAuthorized: false;
  blockers: readonly string[];
}

export function evaluateTrustArtifact(input: TrustEvaluationInput): TrustEvaluationResult {
  const artifactPolicy = getArtifactTrustPolicy(input.artifact.kind);
  const policy = input.policy ?? artifactPolicy.policy;

  try {
    assertSameTenantArtifact(input.tenantId, input.artifact.tenantId);
  } catch {
    const compliance = buildComplianceOutcome({
      qaResults: [],
      reviewerDepartment: input.reviewerDepartment,
      reviewerRole: input.reviewerRole,
      crossTenantBlocked: true,
    });
    const quality = critiqueCandidate({
      candidate: input.artifact,
      policy,
      reviewerDepartment: input.reviewerDepartment,
      reviewerRole: input.reviewerRole,
      crossTenant: true,
    });
    return {
      artifactId: input.artifact.id,
      artifactVersion: input.artifact.version,
      quality,
      compliance,
      qaResults: [],
      modelConfidenceIgnored: true,
    };
  }

  let creatorIsSoleReviewer = false;
  try {
    assertIndependentReviewer(
      input.creatorDepartment,
      input.creatorRole,
      input.reviewerDepartment,
      input.reviewerRole,
    );
  } catch {
    creatorIsSoleReviewer = true;
  }

  const versionMismatch = input.reviewedVersion !== input.artifact.version;
  const qaResults: QaCheckResult[] = [];

  if (artifactPolicy.requiresClaimCheck) {
    qaResults.push(
      checkFactClaims({
        artifact: input.artifact,
        prohibitedPhrases: input.prohibitedPhrases,
      }),
    );
  }

  const claimGuard = auditGenericUnsupportedClaims({
    content: input.artifact.content,
    evidenceIds: input.artifact.evidenceIds,
    unsupportedClaimPatterns: input.unsupportedClaimPatterns,
  });
  if (claimGuard.rejected) {
    qaResults.push({
      reviewerDepartment: "compliance",
      reviewerRole: "claim_checker",
      findings: [
        {
          kind: "fact_claim",
          severity: "block",
          reasonCode: "unsupported_claim",
          message: `Unsupported generic claim: ${claimGuard.matchedPatterns.join(", ")}`,
        },
      ],
      suggestedDecision: "BLOCK",
    });
  }

  if (artifactPolicy.requiresBrandQa) {
    qaResults.push(
      checkBrandCompliance({
        artifact: input.artifact,
        brandRules: input.brandRules,
        brandFitScore: input.scoreOverrides?.brand_fit,
      }),
    );
  }

  if (artifactPolicy.requiresVisualQa) {
    qaResults.push(
      checkVisualQuality({
        artifact: input.artifact,
        visualDefects: input.visualDefects,
        visualQualityScore: input.scoreOverrides?.visual_quality,
      }),
    );
  }

  if (artifactPolicy.requiresTechnicalQa) {
    qaResults.push(
      checkTechnicalQuality({
        artifact: input.artifact,
        technicalDefects: input.technicalDefects,
        technicalQualityScore: input.scoreOverrides?.technical_quality,
      }),
    );
  }

  qaResults.push(
    checkCreativeMediocrity({
      content: input.artifact.content,
      originalityScore: input.scoreOverrides?.originality,
      clarityScore: input.scoreOverrides?.clarity,
      strategicFitScore: input.scoreOverrides?.strategic_fit,
    }),
  );

  const factClaimResult = qaResults.find((r) => r.reviewerRole === "claim_checker");
  const brandResult = qaResults.find((r) => r.reviewerRole === "brand_rule_checker");
  const visualResult = qaResults.find((r) => r.reviewerRole === "visual_qa");
  const technicalResult = qaResults.find((r) => r.reviewerRole === "reliability_reviewer");

  const missingEvidence =
    artifactPolicy.requiresEvidence &&
    (input.artifact.evidenceIds?.length ?? 0) === 0 &&
    /\b(studies show|research proves|data shows|percent|%)\b/i.test(input.artifact.content);

  const prohibitedClaim =
    factClaimResult?.findings.some((f) => f.reasonCode === "prohibited_claim") ?? false;

  const scoreOverrides = {
    ...input.scoreOverrides,
    factuality: input.scoreOverrides?.factuality ?? (factClaimResult ? scoreFactualityFromClaims(factClaimResult) : 80),
    brand_fit: input.scoreOverrides?.brand_fit ?? (brandResult ? scoreBrandFitFromCheck(brandResult) : 80),
    visual_quality:
      input.scoreOverrides?.visual_quality ?? (visualResult ? scoreVisualQualityFromCheck(visualResult) : 80),
    technical_quality:
      input.scoreOverrides?.technical_quality ??
      (technicalResult ? scoreTechnicalQualityFromCheck(technicalResult) : 80),
    evidence_quality:
      input.scoreOverrides?.evidence_quality ?? (missingEvidence ? 30 : 85),
    compliance:
      input.scoreOverrides?.compliance ??
      (qaResults.some((r) => r.suggestedDecision === "BLOCK") ? 40 : 88),
  };

  const quality = critiqueCandidate({
    candidate: input.artifact,
    policy,
    reviewerDepartment: input.reviewerDepartment,
    reviewerRole: input.reviewerRole,
    scoreOverrides,
    missingEvidence,
    prohibitedClaim,
    policyViolation: qaResults.some((r) =>
      r.findings.some((f) => f.reasonCode === "policy_violation"),
    ),
  });

  const compliance = buildComplianceOutcome({
    qaResults,
    reviewerDepartment: input.reviewerDepartment,
    reviewerRole: input.reviewerRole,
    creatorIsSoleReviewer,
    versionMismatch,
    hardBlockReasons:
      quality.decision === "REJECT"
        ? (quality.hardGateFailures?.map((f) =>
            f.includes("factuality") ? "factuality_hard_gate" as const :
            f.includes("prohibited_claim") ? "prohibited_claim" as const :
            f.includes("missing") ? "missing_evidence" as const :
            "compliance_hard_block" as const,
          ) ?? [])
        : [],
  });

  let revisionRequest;
  const revisionCount = input.revisionCount ?? 0;
  if (quality.decision === "REVISE" || compliance.decision === "REVISE") {
    enforceRevisionCap(policy, nextRevisionNumber(revisionCount));
    revisionRequest = createRevisionRequest({
      artifactId: input.artifact.id,
      artifactVersion: input.artifact.version,
      requestedByDepartment: input.reviewerDepartment,
      requestedByRole: input.reviewerRole,
      reasonCodes: compliance.reasonCodes.length > 0 ? compliance.reasonCodes : ["brand_violation"],
      requiredChanges: quality.requiredChanges.length > 0 ? quality.requiredChanges : compliance.notes,
      revisionNumber: nextRevisionNumber(revisionCount),
    });
  }

  return {
    artifactId: input.artifact.id,
    artifactVersion: input.artifact.version,
    quality,
    compliance,
    qaResults,
    revisionRequest,
    modelConfidenceIgnored: true,
  };
}

/** Customer approval cannot bypass compliance BLOCK or widen capabilities. */
export function evaluateCustomerApproval(input: CustomerApprovalInput): CustomerApprovalResult {
  assertSameTenantArtifact(input.tenantId, input.artifact.tenantId);

  const blockers: string[] = [];

  if (input.compliance.decision === "BLOCK") {
    blockers.push("approval_cannot_bypass_compliance_block");
  }

  if (input.qualityDecision === "PASS") {
    blockers.push("quality_pass_does_not_authorize_publish");
  }

  try {
    narrowCapabilityClasses(
      [...input.parentCapabilities],
      [...input.requestedCapabilities],
    );
  } catch (error) {
    if (error instanceof CapabilityEscalationError) {
      blockers.push("customer_approval_cannot_widen_capabilities");
    } else {
      throw error;
    }
  }

  return {
    approved: blockers.length === 0 && input.compliance.decision === "PASS",
    publishAuthorized: false,
    blockers,
  };
}

/** Approval stamp cannot override a compliance hard block. */
export function assertApprovalCannotBypassCompliance(
  complianceDecision: string,
  approvalGranted: boolean,
): void {
  if (complianceDecision === "BLOCK" && approvalGranted) {
    throw new Error("approval_cannot_bypass_compliance_block");
  }
}
