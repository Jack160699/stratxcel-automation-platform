/**
 * Social Department — WorkforceCore execution types.
 * PREVIEW = APPROVAL PAYLOAD = PUBLISH PAYLOAD (no substitution).
 */

export const SOCIAL_SUPPORTED_PLATFORMS = [
  "instagram",
  "facebook",
  "threads",
  "linkedin",
  "youtube",
] as const;

export type SocialPlatform = (typeof SOCIAL_SUPPORTED_PLATFORMS)[number];

export type SocialPublicationStatus =
  | "PLANNED"
  | "PREPARED"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "SHADOW_COMPLETED"
  | "CANCELLED"
  | "UNKNOWN";

export type QualityComplianceStatus = "PASS" | "REVISE" | "REJECT" | "not_reviewed" | "PENDING";

export type ScheduleIntentKind = "NOW" | "AT" | "PACKAGE_SLOT";

export interface ScheduleIntent {
  kind: ScheduleIntentKind;
  /** Required when kind is AT or PACKAGE_SLOT — real UTC ISO instant. */
  scheduledAtIso: string | null;
  timeZone: string;
  /** Wall-clock label in tenant timezone for calendar display (never "this week" alone). */
  wallClockLabel?: string | null;
}

/**
 * Exact Social release artifact.
 * Upstream final creative is canonical; this is the platform-bound execution form.
 */
export interface SocialReleaseArtifact {
  id: string;
  tenantId: string;
  missionId: string;
  /** Upstream Workforce artifact IDs (content, media, quality, compliance, brand, …). */
  upstreamArtifactIds: readonly string[];
  brandBrainVersion: number | null;
  platform: SocialPlatform;
  accountId: string;
  finalCaption: string;
  mediaAssetIds: readonly string[];
  cta: string | null;
  accessibilityText: string | null;
  hashtags: readonly string[];
  scheduleIntent: ScheduleIntent;
  qualityStatus: QualityComplianceStatus;
  complianceStatus: QualityComplianceStatus;
  /** Fingerprint of preview/approval/publish identity — must not change across gates. */
  payloadFingerprint: string;
  createdAtIso: string;
}

/** Upstream finalized creative handed to Social (not regenerated here). */
export interface UpstreamFinalCreative {
  tenantId: string;
  missionId: string;
  artifactId: string;
  caption: string;
  mediaAssetIds: readonly string[];
  cta?: string | null;
  accessibilityText?: string | null;
  hashtags?: readonly string[];
  brandBrainVersion?: number | null;
  parentArtifactIds?: readonly string[];
  qualityStatus?: QualityComplianceStatus;
  complianceStatus?: QualityComplianceStatus;
}

export interface ConnectedSocialAccount {
  id: string;
  tenantId: string;
  platform: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR" | string;
  displayName?: string | null;
}

export interface TenantScopedAsset {
  id: string;
  tenantId: string;
}

/** Canonical publish receipt for Workforce + analytics handoff. */
export interface CanonicalPublishReceipt {
  tenantId: string;
  missionId: string;
  artifactId: string;
  platform: SocialPlatform | string;
  accountId: string;
  providerPublishId: string | null;
  publishedAtIso: string | null;
  liveUrl: string | null;
  scheduleJobId: string | null;
  usageAccountingRef: string | null;
  errorState: string | null;
  status: SocialPublicationStatus;
  shadow: boolean;
  payloadFingerprint: string;
}

export interface AnalyticsMeasurementTarget {
  tenantId: string;
  missionId: string;
  artifactId: string;
  receiptId: string;
  platform: string;
  providerPublishId: string | null;
  liveUrl: string | null;
  publishedAtIso: string | null;
  measurementHints: readonly string[];
}

export type PublishAuthorizationSource =
  | { kind: "MANUAL_EXPLICIT_APPROVAL"; actionId: string }
  | { kind: "PACKAGE_STANDING_AUTH"; authorizationId: string; mode: "AUTO_PUBLISH" | "REVIEW_BEFORE_PUBLISH" };

export type RetryClass = "TECHNICAL_PUBLISH" | "CREATIVE_REVISION";

export interface SocialPublicationQueryResult {
  status: SocialPublicationStatus;
  reference: string;
  liveUrl: string | null;
  providerPublishId: string | null;
  publishedAtIso: string | null;
  scheduleJobId: string | null;
  shadow: boolean;
  /** Never includes provider credentials. */
  safeDetail: string | null;
}
