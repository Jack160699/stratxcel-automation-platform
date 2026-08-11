import { createHash } from "node:crypto";
import type {
  QualityComplianceStatus,
  ScheduleIntent,
  SocialPlatform,
  SocialReleaseArtifact,
  UpstreamFinalCreative,
} from "./types.ts";
import { SOCIAL_SUPPORTED_PLATFORMS } from "./types.ts";

export class SocialReleaseArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialReleaseArtifactError";
  }
}

export function isSupportedSocialPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_SUPPORTED_PLATFORMS as readonly string[]).includes(value.toLowerCase());
}

export function normalizeSocialPlatform(value: string): SocialPlatform {
  const key = value.trim().toLowerCase();
  if (!isSupportedSocialPlatform(key)) {
    throw new SocialReleaseArtifactError("fabricated_or_unsupported_platform");
  }
  return key;
}

export function fingerprintReleasePayload(parts: {
  tenantId: string;
  missionId: string;
  platform: string;
  accountId: string;
  finalCaption: string;
  mediaAssetIds: readonly string[];
  cta: string | null;
  accessibilityText: string | null;
  hashtags: readonly string[];
  scheduledAtIso: string | null;
}): string {
  const canonical = JSON.stringify({
    tenantId: parts.tenantId,
    missionId: parts.missionId,
    platform: parts.platform,
    accountId: parts.accountId,
    finalCaption: parts.finalCaption,
    mediaAssetIds: [...parts.mediaAssetIds],
    cta: parts.cta,
    accessibilityText: parts.accessibilityText,
    hashtags: [...parts.hashtags],
    scheduledAtIso: parts.scheduledAtIso,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface BuildSocialReleaseArtifactInput {
  upstream: UpstreamFinalCreative;
  platform: string;
  accountId: string;
  scheduleIntent: ScheduleIntent;
  adaptedCaption?: string;
  adaptedHashtags?: readonly string[];
  adaptedCta?: string | null;
  adaptedAccessibilityText?: string | null;
  releaseId?: string;
  qualityStatus?: QualityComplianceStatus;
  complianceStatus?: QualityComplianceStatus;
}

/**
 * Map upstream final creative → Social release artifact.
 * Media IDs and factual copy are preserved unless explicitly adapted.
 */
export function buildSocialReleaseArtifact(input: BuildSocialReleaseArtifactInput): SocialReleaseArtifact {
  const { upstream } = input;
  if (!upstream.tenantId || !upstream.missionId || !upstream.artifactId) {
    throw new SocialReleaseArtifactError("upstream_identity_required");
  }
  if (!input.accountId) throw new SocialReleaseArtifactError("account_required");
  if (!upstream.caption?.trim()) throw new SocialReleaseArtifactError("final_caption_required");

  const platform = normalizeSocialPlatform(input.platform);
  const finalCaption = (input.adaptedCaption ?? upstream.caption).trim();
  const mediaAssetIds = [...upstream.mediaAssetIds];
  const hashtags = [...(input.adaptedHashtags ?? upstream.hashtags ?? [])];
  const cta = input.adaptedCta !== undefined ? input.adaptedCta : (upstream.cta ?? null);
  const accessibilityText =
    input.adaptedAccessibilityText !== undefined
      ? input.adaptedAccessibilityText
      : (upstream.accessibilityText ?? null);

  const payloadFingerprint = fingerprintReleasePayload({
    tenantId: upstream.tenantId,
    missionId: upstream.missionId,
    platform,
    accountId: input.accountId,
    finalCaption,
    mediaAssetIds,
    cta,
    accessibilityText,
    hashtags,
    scheduledAtIso: input.scheduleIntent.scheduledAtIso,
  });

  const upstreamIds = [upstream.artifactId, ...(upstream.parentArtifactIds ?? [])];

  return {
    id: input.releaseId ?? crypto.randomUUID(),
    tenantId: upstream.tenantId,
    missionId: upstream.missionId,
    upstreamArtifactIds: [...new Set(upstreamIds)],
    brandBrainVersion: upstream.brandBrainVersion ?? null,
    platform,
    accountId: input.accountId,
    finalCaption,
    mediaAssetIds,
    cta,
    accessibilityText,
    hashtags,
    scheduleIntent: input.scheduleIntent,
    qualityStatus: input.qualityStatus ?? upstream.qualityStatus ?? "not_reviewed",
    complianceStatus: input.complianceStatus ?? upstream.complianceStatus ?? "not_reviewed",
    payloadFingerprint,
    createdAtIso: new Date().toISOString(),
  };
}

/** Approval and publish must receive the identical artifact payload. */
export function assertIdenticalReleasePayload(
  preview: SocialReleaseArtifact,
  approvalOrPublish: SocialReleaseArtifact,
): void {
  if (preview.payloadFingerprint !== approvalOrPublish.payloadFingerprint) {
    throw new SocialReleaseArtifactError("release_payload_substitution_rejected");
  }
  if (preview.finalCaption !== approvalOrPublish.finalCaption) {
    throw new SocialReleaseArtifactError("caption_substitution_rejected");
  }
  if (JSON.stringify(preview.mediaAssetIds) !== JSON.stringify(approvalOrPublish.mediaAssetIds)) {
    throw new SocialReleaseArtifactError("media_substitution_rejected");
  }
}
