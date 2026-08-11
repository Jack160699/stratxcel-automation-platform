import { externalMutationDecision } from "../shadow-gate.ts";
import type { PublishAuthorizationSource } from "./types.ts";
import { evaluateSocialTrustReleaseGate } from "./trust-release-gate.ts";

export class SocialAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialAuthorizationError";
  }
}

/** Natural-language phrases that must NEVER authorize manual publish. */
export const MANUAL_PUBLISH_NATURAL_PHRASES = [
  "yes",
  "haan",
  "kar do",
  "go ahead",
  "push it",
  "post kar do",
] as const;

/**
 * Chat / natural language never authorizes manual publish.
 * Only explicit approval controls (UI / WhatsApp approve action / package claim) do.
 */
export function naturalLanguageAuthorizesManualPublish(_text: string): false {
  return false;
}

export function isNaturalPublishPhrase(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  return (MANUAL_PUBLISH_NATURAL_PHRASES as readonly string[]).some(
    (phrase) => normalized === phrase || normalized.includes(phrase),
  );
}

export interface ReleaseReadinessGateInput {
  readyToRelease: boolean;
  reviewedArtifactVersion?: string | number;
}

export interface ManualPublishGateInput {
  explicitApprovalControl: boolean;
  actionId?: string | null;
  chatText?: string | null;
  shadowMode: boolean;
  qualityStatus: string;
  complianceStatus: string;
  /** Optional trust-department release readiness (Social PASS/PASS + version). */
  releaseReadiness?: ReleaseReadinessGateInput;
  /** Exact artifact version being published; must match reviewed version when provided. */
  exactArtifactVersion?: string;
}

export interface PublishGateDecision {
  allowed: boolean;
  reason: string;
  shadowBlocked: boolean;
  authorization: PublishAuthorizationSource | null;
}

function trustQualityComplianceBlocks(input: {
  qualityStatus: string;
  complianceStatus: string;
  releaseReadiness?: ReleaseReadinessGateInput;
  exactArtifactVersion?: string;
}): PublishGateDecision | null {
  const trust = evaluateSocialTrustReleaseGate({
    qualityStatus: input.qualityStatus,
    complianceStatus: input.complianceStatus,
    releaseReadiness: input.releaseReadiness,
    exactArtifactVersion: input.exactArtifactVersion,
  });
  if (!trust.allowed) {
    return {
      allowed: false,
      reason: trust.reason,
      shadowBlocked: false,
      authorization: null,
    };
  }
  return null;
}

/**
 * Manual one-off path: explicit approval control required; natural phrases never publish.
 * Shadow remains a hard external mutation block (preparation can complete).
 * ONLY qualityStatus === "PASS" AND complianceStatus === "PASS" may proceed.
 */
export function decideManualPublishGate(input: ManualPublishGateInput): PublishGateDecision {
  if (input.chatText && isNaturalPublishPhrase(input.chatText) && !input.explicitApprovalControl) {
    return {
      allowed: false,
      reason: "natural_language_does_not_authorize_publish",
      shadowBlocked: false,
      authorization: null,
    };
  }

  if (!input.explicitApprovalControl || !input.actionId) {
    return {
      allowed: false,
      reason: "explicit_approval_required",
      shadowBlocked: false,
      authorization: null,
    };
  }

  const trustBlock = trustQualityComplianceBlocks(input);
  if (trustBlock) return trustBlock;

  const mutation = externalMutationDecision(input.shadowMode, "publish_post");
  if (!mutation.allowed) {
    return {
      allowed: false,
      reason: mutation.reason,
      shadowBlocked: true,
      authorization: {
        kind: "MANUAL_EXPLICIT_APPROVAL",
        actionId: input.actionId,
      },
    };
  }

  return {
    allowed: true,
    reason: "explicit_approval_live",
    shadowBlocked: false,
    authorization: {
      kind: "MANUAL_EXPLICIT_APPROVAL",
      actionId: input.actionId,
    },
  };
}

export interface PackagePublishGateInput {
  standingAuthorizationActive: boolean;
  authorizationId: string;
  publishingMode: "AUTO_PUBLISH" | "REVIEW_BEFORE_PUBLISH";
  reviewCompleted: boolean;
  shadowMode: boolean;
  missionSource: "MANUAL" | "PACKAGE";
  qualityStatus?: string;
  complianceStatus?: string;
  releaseReadiness?: ReleaseReadinessGateInput;
  exactArtifactVersion?: string;
}

/**
 * Package standing authorization is scoped to package queue items only.
 * Manual one-off missions never inherit AUTO_PUBLISH accidentally.
 * Quality/compliance must both be PASS when provided (and are required for live publish).
 */
export function decidePackagePublishGate(input: PackagePublishGateInput): PublishGateDecision {
  if (input.missionSource === "MANUAL") {
    return {
      allowed: false,
      reason: "manual_mission_does_not_inherit_package_standing_auth",
      shadowBlocked: false,
      authorization: null,
    };
  }

  if (!input.standingAuthorizationActive || !input.authorizationId) {
    return {
      allowed: false,
      reason: "standing_authorization_inactive",
      shadowBlocked: false,
      authorization: null,
    };
  }

  if (input.publishingMode === "REVIEW_BEFORE_PUBLISH" && !input.reviewCompleted) {
    return {
      allowed: false,
      reason: "package_review_required",
      shadowBlocked: false,
      authorization: {
        kind: "PACKAGE_STANDING_AUTH",
        authorizationId: input.authorizationId,
        mode: input.publishingMode,
      },
    };
  }

  if (
    input.publishingMode === "AUTO_PUBLISH" ||
    (input.publishingMode === "REVIEW_BEFORE_PUBLISH" && input.reviewCompleted)
  ) {
    const qualityStatus = input.qualityStatus ?? "not_reviewed";
    const complianceStatus = input.complianceStatus ?? "not_reviewed";
    const trustBlock = trustQualityComplianceBlocks({
      qualityStatus,
      complianceStatus,
      releaseReadiness: input.releaseReadiness,
      exactArtifactVersion: input.exactArtifactVersion,
    });
    if (trustBlock) {
      return {
        ...trustBlock,
        authorization: {
          kind: "PACKAGE_STANDING_AUTH",
          authorizationId: input.authorizationId,
          mode: input.publishingMode,
        },
      };
    }

    const mutation = externalMutationDecision(input.shadowMode, "publish_post");
    const auth: PublishAuthorizationSource = {
      kind: "PACKAGE_STANDING_AUTH",
      authorizationId: input.authorizationId,
      mode: input.publishingMode,
    };
    if (!mutation.allowed) {
      return {
        allowed: false,
        reason: mutation.reason,
        shadowBlocked: true,
        authorization: auth,
      };
    }
    return {
      allowed: true,
      reason: "package_standing_authorization",
      shadowBlocked: false,
      authorization: auth,
    };
  }

  throw new SocialAuthorizationError("invalid_package_publishing_mode");
}
