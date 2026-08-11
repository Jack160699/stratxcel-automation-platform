/**
 * Deterministic artifact authorization for capability execution.
 * Authority comes from trusted runtime policy / resolver — never model text.
 */
import type { CapabilityDefinition } from "./types.ts";
import type { ArtifactRecord, ArtifactUsagePolicy } from "./request.ts";
import type { CapabilityReasonCode } from "./reason-codes.ts";

/** Statuses that never satisfy final/external mutation input requirements. */
export const INVALID_FINAL_ARTIFACT_STATUSES = [
  "draft",
  "rejected",
  "superseded",
  "deleted",
  "revision_pending",
  "not_reviewed",
  "blocked",
] as const;

export type InvalidFinalArtifactStatus = (typeof INVALID_FINAL_ARTIFACT_STATUSES)[number];

export interface ArtifactAuthorizationInput {
  artifact: ArtifactRecord;
  requestMissionId: string;
  requestTenantId: string;
  capability: CapabilityDefinition;
  /** Trusted runtime policy only — never Hermes/model-supplied. */
  usagePolicy?: ArtifactUsagePolicy | null;
  /** Authoritative expected versions keyed by artifact id (trusted runtime). */
  expectedArtifactVersions?: Readonly<Record<string, string>> | null;
}

export interface ArtifactAuthorizationResult {
  ok: boolean;
  reasonCode?: CapabilityReasonCode;
  humanReason?: string;
}

function isReusableKindAuthorized(
  artifact: ArtifactRecord,
  policy: ArtifactUsagePolicy | null | undefined,
): boolean {
  if (!policy?.allowReusableTenantKinds?.length) return false;
  return policy.allowReusableTenantKinds.includes(artifact.kind);
}

function isExplicitlyAuthorizedArtifact(
  artifact: ArtifactRecord,
  policy: ArtifactUsagePolicy | null | undefined,
): boolean {
  if (!policy?.authorizedArtifactIds?.length) return false;
  return policy.authorizedArtifactIds.includes(artifact.id);
}

/**
 * Default: artifact.missionId must equal request.missionId.
 * Cross-mission reuse only when trusted runtime policy explicitly authorizes
 * the artifact id or reusable kind (e.g. Brand Brain, tenant media library).
 */
export function authorizeArtifactForCapability(
  input: ArtifactAuthorizationInput,
): ArtifactAuthorizationResult {
  const { artifact, requestMissionId, requestTenantId, capability, usagePolicy } = input;

  if (artifact.tenantId !== requestTenantId) {
    return {
      ok: false,
      reasonCode: "ARTIFACT_TENANT_MISMATCH",
      humanReason: "Input artifact belongs to a different tenant.",
    };
  }

  if (
    capability.supportedInputArtifacts.length > 0 &&
    !capability.supportedInputArtifacts.includes(artifact.kind)
  ) {
    return {
      ok: false,
      reasonCode: "ARTIFACT_KIND_UNSUPPORTED",
      humanReason: "Input artifact kind is not supported for this capability.",
    };
  }

  // Fail closed: missing missionId is NOT same-mission.
  // Missionless/tenant-level artifacts require explicit trusted reuse policy.
  const sameMission = artifact.missionId === requestMissionId;
  if (!sameMission) {
    const trustedReuse =
      isExplicitlyAuthorizedArtifact(artifact, usagePolicy) ||
      isReusableKindAuthorized(artifact, usagePolicy);
    if (!trustedReuse) {
      return {
        ok: false,
        reasonCode: "ARTIFACT_MISSION_MISMATCH",
        humanReason: artifact.missionId
          ? "Input artifact belongs to a different mission and is not authorized for cross-mission reuse by trusted runtime policy."
          : "Input artifact has no missionId and is not authorized for tenant-level reuse by trusted runtime policy.",
      };
    }
  }

  // Mutation capabilities require finalized/approved-like status when status is present.
  if (capability.externalMutation) {
    const status = artifact.status?.trim().toLowerCase();
    if (!status) {
      return {
        ok: false,
        reasonCode: "ARTIFACT_STATUS_INVALID",
        humanReason: "External mutation requires an artifact with a finalized status.",
      };
    }
    if (
      (INVALID_FINAL_ARTIFACT_STATUSES as readonly string[]).includes(status) ||
      status === "pending" ||
      status === "failed"
    ) {
      return {
        ok: false,
        reasonCode: "ARTIFACT_STATUS_INVALID",
        humanReason: `Artifact status "${artifact.status}" is not valid for external mutation.`,
      };
    }
    // Accept APPROVED / FINAL / READY / PUBLISHABLE / final / approved
    const okStatuses = new Set([
      "approved",
      "final",
      "ready",
      "publishable",
      "released",
      "active",
    ]);
    if (!okStatuses.has(status)) {
      return {
        ok: false,
        reasonCode: "ARTIFACT_STATUS_INVALID",
        humanReason: `Artifact status "${artifact.status}" is not valid for external mutation.`,
      };
    }
  }

  const expected = input.expectedArtifactVersions?.[artifact.id];
  if (expected != null && String(expected).trim().length > 0) {
    const actual = artifact.version;
    if (actual == null || String(actual).trim() === "") {
      return {
        ok: false,
        reasonCode: "ARTIFACT_VERSION_MISMATCH",
        humanReason: "Expected artifact version was authorized but resolver returned no version.",
      };
    }
    if (String(actual).trim() !== String(expected).trim()) {
      return {
        ok: false,
        reasonCode: "ARTIFACT_VERSION_MISMATCH",
        humanReason: `Authorized artifact version ${expected} does not match resolved version ${actual}.`,
      };
    }
  }

  return { ok: true };
}
