import type { ComplianceOutcome, ReleaseReadiness, TrustEvaluationResult } from "../types.ts";
import { complianceBlocksRelease } from "../compliance/outcomes.ts";
import { isFinalReviewer } from "../roles/reviewers.ts";

export interface AssessReleaseReadinessInput {
  evaluation: TrustEvaluationResult;
  reviewedVersion: number;
  reviewerDepartment: string;
  reviewerRole: string;
  finalReviewComplete?: boolean;
}

/**
 * Computes release readiness advisories only — never executes publish.
 * GENERATED ≠ APPROVED; quality PASS ≠ publish authorization.
 */
export function assessReleaseReadiness(input: AssessReleaseReadinessInput): ReleaseReadiness {
  const { evaluation } = input;
  const blockers: string[] = [];

  const qualityPassed = evaluation.quality.decision === "PASS";
  const compliancePassed = evaluation.compliance.decision === "PASS";
  const versionMatchesReview = input.reviewedVersion === evaluation.artifactVersion;
  const independentReviewComplete =
    input.finalReviewComplete ??
    isFinalReviewer(input.reviewerDepartment, input.reviewerRole);

  if (!qualityPassed) {
    blockers.push("quality_not_passed");
  }
  if (!compliancePassed) {
    blockers.push("compliance_not_passed");
  }
  if (complianceBlocksRelease(evaluation.compliance)) {
    blockers.push("compliance_hard_block");
  }
  if (!versionMatchesReview) {
    blockers.push("artifact_version_mismatch");
  }
  if (!independentReviewComplete) {
    blockers.push("final_review_incomplete");
  }
  if (evaluation.compliance.reasonCodes.includes("creator_is_sole_reviewer")) {
    blockers.push("creator_is_sole_reviewer");
  }
  if (evaluation.compliance.reasonCodes.includes("cross_tenant_artifact")) {
    blockers.push("cross_tenant_artifact");
  }

  const readyToRelease =
    qualityPassed &&
    compliancePassed &&
    versionMatchesReview &&
    independentReviewComplete &&
    blockers.length === 0;

  return {
    artifactId: evaluation.artifactId,
    artifactVersion: evaluation.artifactVersion,
    qualityPassed,
    compliancePassed,
    independentReviewComplete,
    versionMatchesReview,
    readyToRelease,
    publishAuthorized: false,
    blockers,
  };
}

export function summarizeReleaseBlockers(readiness: ReleaseReadiness): string {
  return readiness.blockers.join("; ");
}

export function assertReleaseDoesNotExecute(_readiness: ReleaseReadiness): true {
  /** Release readiness is advisory; callers must use a separate publish executor. */
  return true;
}

export function canProceedToPublish(readiness: ReleaseReadiness): false {
  /** Quality/compliance readiness never equals publish authorization in trust department. */
  return false;
}

export function mergeReadinessWithCompliance(
  readiness: ReleaseReadiness,
  compliance: ComplianceOutcome,
): ReleaseReadiness {
  if (compliance.decision === "BLOCK") {
    return {
      ...readiness,
      compliancePassed: false,
      readyToRelease: false,
      publishAuthorized: false,
      blockers: [...new Set([...readiness.blockers, "compliance_hard_block"])],
    };
  }
  return readiness;
}
