/**
 * Social trust ↔ release gate.
 * Wraps @stratxcel/trust-department assessReleaseReadiness / canProceedToPublish semantics
 * for Social publish authorization (quality + compliance PASS/PASS only).
 *
 * Publish eligibility requires exact artifact binding:
 * PREVIEW = REVIEWED VERSION = APPROVED VERSION = PUBLISH PAYLOAD VERSION
 */
import {
  assessReleaseReadiness,
  canProceedToPublish,
  type ReleaseReadiness,
  type TrustEvaluationResult,
} from "@stratxcel/trust-department";

const PASS = "PASS";

function isPresentVersion(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
}

export interface SocialTrustReleaseGateInput {
  qualityStatus: string;
  complianceStatus: string;
  releaseReadiness?: {
    readyToRelease: boolean;
    reviewedArtifactVersion?: string | number;
  };
  exactArtifactVersion?: string | number;
}

export interface SocialTrustReleaseGateResult {
  allowed: boolean;
  reason: string;
  readyToRelease: boolean;
}

/**
 * ONLY qualityStatus === "PASS" AND complianceStatus === "PASS" may proceed.
 * ALL other values (REJECT, BLOCK, REVISE, HUMAN_REVIEW, not_reviewed, missing, unknown) BLOCK.
 *
 * Additionally requires:
 * - releaseReadiness.readyToRelease === true
 * - reviewedArtifactVersion present/non-empty
 * - exactArtifactVersion present/non-empty
 * - reviewedArtifactVersion === exactArtifactVersion
 *
 * Manual approval and package AUTO_PUBLISH must not bypass this gate.
 */
export function evaluateSocialTrustReleaseGate(
  input: SocialTrustReleaseGateInput,
): SocialTrustReleaseGateResult {
  if (input.qualityStatus !== PASS) {
    return {
      allowed: false,
      reason: "quality_not_pass",
      readyToRelease: false,
    };
  }
  if (input.complianceStatus !== PASS) {
    return {
      allowed: false,
      reason: "compliance_not_pass",
      readyToRelease: false,
    };
  }

  if (!input.releaseReadiness || input.releaseReadiness.readyToRelease !== true) {
    return {
      allowed: false,
      reason: "release_not_ready",
      readyToRelease: false,
    };
  }

  const reviewed = input.releaseReadiness.reviewedArtifactVersion;
  const exact = input.exactArtifactVersion;

  if (!isPresentVersion(reviewed)) {
    return {
      allowed: false,
      reason: "reviewed_artifact_version_required",
      readyToRelease: false,
    };
  }
  if (!isPresentVersion(exact)) {
    return {
      allowed: false,
      reason: "artifact_version_required",
      readyToRelease: false,
    };
  }
  if (String(reviewed).trim() !== String(exact).trim()) {
    return {
      allowed: false,
      reason: "artifact_version_mismatch",
      readyToRelease: false,
    };
  }

  return {
    allowed: true,
    reason: "trust_pass_pass",
    readyToRelease: true,
  };
}

/**
 * Bridge to trust-department assessReleaseReadiness for Social callers that have a full evaluation.
 * Note: canProceedToPublish always returns false in trust-department (advisory ≠ authorization);
 * Social still requires its own explicit publish authorization after this readiness check.
 */
export function assessSocialReleaseReadiness(input: {
  evaluation: TrustEvaluationResult;
  reviewedVersion: number;
  reviewerDepartment: string;
  reviewerRole: string;
  finalReviewComplete?: boolean;
}): ReleaseReadiness {
  return assessReleaseReadiness(input);
}

/**
 * Trust-department canProceedToPublish is always false (quality ≠ publish auth).
 * Exposed so Social callers never confuse readiness with authorization.
 */
export function socialCanProceedToPublishFromTrust(readiness: ReleaseReadiness): false {
  return canProceedToPublish(readiness);
}
