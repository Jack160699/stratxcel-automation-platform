/**
 * Canonical Social Copilot review artifact — database is the source of truth.
 * Reuses SocialReleaseArtifact fingerprinting + session action metadata.
 */

import { createHash } from "node:crypto";
import type { ScheduleIntent, SocialReleaseArtifact } from "../workforce/types.ts";

export type ReviewDisplayStatus =
  | "DRAFT"
  | "NEEDS_REVIEW"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "SHADOW_NOT_PUBLISHED"
  | "SUPERSEDED"
  | "FAILED";

export interface SocialCopilotReviewVariant {
  variantId: string;
  platform: string;
  format: string;
  caption: string;
  hashtags: string[];
  mediaAssetIds: string[];
  scheduledAtIso: string | null;
  timeZone: string | null;
  wallClockLabel: string | null;
  scheduleSource?: string | null;
  recommendationTier?: string | null;
  recommendationReason?: string | null;
  accountLabel?: string | null;
  actionId?: string | null;
  generationKey?: string | null;
}

export interface SocialCopilotReviewArtifact {
  reviewId: string;
  revision: number;
  tenantId: string;
  missionId: string;
  sessionId: string;
  sourceRunId: string | null;
  contentMasterId: string | null;
  variants: SocialCopilotReviewVariant[];
  brandBrainVersion: number | null;
  trustStatus: "PASS" | "REVISE" | "BLOCK" | "PENDING";
  capabilityReadiness: Record<string, string>;
  artifactVersion: string;
  payloadFingerprint: string;
  active: boolean;
  superseded: boolean;
  displayStatus: ReviewDisplayStatus;
  scheduleIntents: ScheduleIntent[];
  releaseArtifacts?: SocialReleaseArtifact[];
  createdAtIso: string;
}

export interface BuildReviewArtifactInput {
  tenantId: string;
  missionId: string;
  sessionId: string;
  sourceRunId?: string | null;
  contentMasterId?: string | null;
  revision: number;
  variants: SocialCopilotReviewVariant[];
  brandBrainVersion?: number | null;
  trustStatus: SocialCopilotReviewArtifact["trustStatus"];
  capabilityReadiness?: Record<string, string>;
  displayStatus: ReviewDisplayStatus;
  active?: boolean;
  createdAtIso?: string;
}

function fingerprintPayload(input: {
  reviewId: string;
  revision: number;
  variants: SocialCopilotReviewVariant[];
  trustStatus: string;
}): string {
  const canonical = JSON.stringify({
    reviewId: input.reviewId,
    revision: input.revision,
    trustStatus: input.trustStatus,
    variants: input.variants.map((v) => ({
      variantId: v.variantId,
      platform: v.platform,
      caption: v.caption,
      hashtags: v.hashtags,
      mediaAssetIds: v.mediaAssetIds,
      scheduledAtIso: v.scheduledAtIso,
      timeZone: v.timeZone,
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildSocialCopilotReviewArtifact(input: BuildReviewArtifactInput): SocialCopilotReviewArtifact {
  const reviewId = `review_${input.sessionId}_${input.revision}`;
  const artifactVersion = `v${input.revision}`;
  const payloadFingerprint = fingerprintPayload({
    reviewId,
    revision: input.revision,
    variants: input.variants,
    trustStatus: input.trustStatus,
  });
  const scheduleIntents: ScheduleIntent[] = input.variants
    .filter((v) => v.scheduledAtIso && v.timeZone)
    .map((v) => ({
      kind: "AT" as const,
      scheduledAtIso: v.scheduledAtIso!,
      timeZone: v.timeZone!,
      wallClockLabel: v.wallClockLabel,
    }));

  return {
    reviewId,
    revision: input.revision,
    tenantId: input.tenantId,
    missionId: input.missionId,
    sessionId: input.sessionId,
    sourceRunId: input.sourceRunId ?? null,
    contentMasterId: input.contentMasterId ?? null,
    variants: input.variants,
    brandBrainVersion: input.brandBrainVersion ?? null,
    trustStatus: input.trustStatus,
    capabilityReadiness: input.capabilityReadiness ?? {},
    artifactVersion,
    payloadFingerprint,
    active: input.active !== false,
    superseded: input.active === false,
    displayStatus: input.displayStatus,
    scheduleIntents,
    createdAtIso: input.createdAtIso ?? new Date().toISOString(),
  };
}

/** Message part the UI renders as artifact cards (no internal IDs required in copy). */
export function reviewArtifactMessagePart(artifact: SocialCopilotReviewArtifact): Record<string, unknown> {
  return {
    type: "social_copilot_review",
    reviewId: artifact.reviewId,
    revision: artifact.revision,
    artifactVersion: artifact.artifactVersion,
    displayStatus: artifact.displayStatus,
    trustStatus: artifact.trustStatus,
    active: artifact.active,
    payloadFingerprint: artifact.payloadFingerprint,
    variants: artifact.variants.map((v) => ({
      platform: v.platform,
      format: v.format,
      caption: v.caption,
      hashtags: v.hashtags,
      mediaAssetIds: v.mediaAssetIds,
      scheduledAt: v.scheduledAtIso,
      timeZone: v.timeZone,
      wallClockLabel: v.wallClockLabel,
      scheduleSource: v.scheduleSource,
      recommendationTier: v.recommendationTier,
      recommendationReason: v.recommendationReason,
      accountLabel: v.accountLabel,
      actionId: v.actionId,
      status: artifact.displayStatus,
    })),
  };
}

/** Derive platforms strictly from persisted variants — never from model prose. */
export function platformsFromReview(artifact: SocialCopilotReviewArtifact): string[] {
  return [...new Set(artifact.variants.map((v) => v.platform.toLowerCase()))];
}

export function narrativeFromReview(artifact: SocialCopilotReviewArtifact): string {
  if (artifact.displayStatus === "SHADOW_NOT_PUBLISHED") {
    return "Prepared successfully, but nothing was published externally because Shadow Mode is active.";
  }
  if (artifact.displayStatus === "FAILED") {
    return "Preparation failed. Please review and retry.";
  }
  if (artifact.displayStatus === "NEEDS_REVIEW" || artifact.trustStatus === "REVISE" || artifact.trustStatus === "BLOCK") {
    return "Prepared, but needs revision before approval.";
  }
  if (artifact.active) {
    return "Prepared for review.";
  }
  return "This review has been superseded.";
}
