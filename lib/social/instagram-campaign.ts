/**
 * Instagram campaigns: one content variant per campaign asset. The facts that
 * decide whether an asset may publish -- feed format eligibility, claim-review
 * outcome, the Instagram account it is bound to -- are recorded on the
 * variant's creative_spec. An item's status is always derived from those facts
 * plus its real publishing job, never stored as a separate, driftable claim.
 */

export type CampaignItemStatus =
  | "PUBLISHED"
  | "SCHEDULED"
  | "BLOCKED_BY_PLATFORM_LIMIT"
  | "BLOCKED_CLAIM_REVIEW"
  | "BLOCKED_CAPTION_VALIDATION"
  | "FORMAT_INELIGIBLE_FOR_INSTAGRAM_FEED"
  | "FAILED"
  | "NOT_ATTEMPTED";

export interface InstagramCampaignItemSpec {
  campaign_id: string;
  campaign_key: string;
  sequence: number;
  asset_id: string;
  asset_name: string;
  width: number;
  height: number;
  format_status: "FEED_ELIGIBLE" | "FORMAT_INELIGIBLE_FOR_INSTAGRAM_FEED";
  claim_review: { status: "CLEARED" | "HOLD"; reasons: string[] };
  headline: string;
  cta_type: "website" | "whatsapp" | "call";
  hashtag_group: string;
  /** Unique text carried in the caption; finds an already-published copy on Instagram. */
  dedupe_marker: string;
  /** The only Instagram account this item may ever publish to. */
  expected_provider_account_id: string;
  platform_limit?: { blocked_at: string; quota_usage: number; quota_total: number } | null;
  /** Structured CTA (text, destination, tracking) -- the caption shows only its platform display text. */
  cta?: { type: string; displayText: string; destinationUrl: string; trackingUrl: string | null; platform: string } | null;
  /** Contact text printed on the creative, checked against the business profile. */
  creative_text?: string | null;
  /** Latest pre-publish caption validation result. */
  caption_validation?: { ok: boolean; issues: Array<{ code: string; evidence: string }>; validated_at: string } | null;
}

export interface CampaignJobFacts {
  status: string;
  scheduled_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  result: Record<string, unknown> | null;
}

export interface DerivedCampaignItemStatus {
  status: CampaignItemStatus;
  detail: string | null;
  at: string | null;
  mediaId: string | null;
  permalink: string | null;
  providerVerified: boolean;
}

// Instagram feed images must fall between 4:5 portrait and 1.91:1 landscape.
const FEED_MIN_RATIO = 4 / 5;
const FEED_MAX_RATIO = 1.91;

export function isInstagramFeedAspectRatio(width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return false;
  const ratio = width / height;
  return ratio >= FEED_MIN_RATIO - 1e-6 && ratio <= FEED_MAX_RATIO + 1e-6;
}

export function parseCampaignItemSpec(spec: unknown): InstagramCampaignItemSpec | null {
  if (!spec || typeof spec !== "object") return null;
  const s = spec as Partial<InstagramCampaignItemSpec>;
  if (typeof s.campaign_id !== "string" || typeof s.asset_id !== "string" || typeof s.expected_provider_account_id !== "string") return null;
  if (s.format_status !== "FEED_ELIGIBLE" && s.format_status !== "FORMAT_INELIGIBLE_FOR_INSTAGRAM_FEED") return null;
  if (!s.claim_review || (s.claim_review.status !== "CLEARED" && s.claim_review.status !== "HOLD")) return null;
  return s as InstagramCampaignItemSpec;
}

const LIVE_MODES = new Set(["live", "verification_live"]);
const ACTIVE_JOB_STATUSES = new Set(["SCHEDULED", "CLAIMED", "RUNNING"]);

function isLivePublication(job: CampaignJobFacts): boolean {
  if (job.status !== "PUBLISHED") return false;
  const result = job.result ?? {};
  const externalId = result.external_post_id;
  return LIVE_MODES.has(String(result.mode)) && typeof externalId === "string" && !externalId.startsWith("SHADOW-");
}

export function deriveCampaignItemStatus(spec: InstagramCampaignItemSpec, job: CampaignJobFacts | null): DerivedCampaignItemStatus {
  const base = { detail: null, at: null, mediaId: null, permalink: null, providerVerified: false };

  if (spec.format_status === "FORMAT_INELIGIBLE_FOR_INSTAGRAM_FEED") {
    return { ...base, status: "FORMAT_INELIGIBLE_FOR_INSTAGRAM_FEED", detail: `${spec.width}x${spec.height} is outside Instagram's feed aspect range` };
  }
  if (spec.claim_review.status === "HOLD") {
    return { ...base, status: "BLOCKED_CLAIM_REVIEW", detail: spec.claim_review.reasons.join("; ") || "Held for claim review" };
  }

  if (job) {
    if (isLivePublication(job)) {
      const result = job.result ?? {};
      const verification = (result.provider_verification ?? null) as { verified?: boolean; timestamp?: string } | null;
      return {
        ...base,
        status: "PUBLISHED",
        at: verification?.timestamp ?? job.completed_at,
        mediaId: String(result.external_post_id),
        permalink: typeof result.permalink === "string" ? result.permalink : null,
        providerVerified: verification?.verified === true,
      };
    }
    if (ACTIVE_JOB_STATUSES.has(job.status)) {
      return { ...base, status: "SCHEDULED", at: job.scheduled_at };
    }
    if (job.status === "FAILED") {
      return { ...base, status: "FAILED", at: job.completed_at, detail: maskProviderError(job.last_error) };
    }
    if (job.status === "PUBLISHED") {
      // A shadow-mode run records PUBLISHED without touching Instagram.
      return { ...base, status: "NOT_ATTEMPTED", detail: "Simulated in shadow mode only; not on Instagram" };
    }
  }

  if (spec.caption_validation && spec.caption_validation.ok === false) {
    return {
      ...base,
      status: "BLOCKED_CAPTION_VALIDATION",
      at: spec.caption_validation.validated_at,
      detail: spec.caption_validation.issues.map((issue) => `${issue.code}: ${issue.evidence}`).join("; ") || "Caption failed pre-publish validation",
    };
  }
  if (spec.platform_limit) {
    return {
      ...base,
      status: "BLOCKED_BY_PLATFORM_LIMIT",
      at: spec.platform_limit.blocked_at,
      detail: `Instagram publishing quota reached (${spec.platform_limit.quota_usage}/${spec.platform_limit.quota_total})`,
    };
  }
  return { ...base, status: "NOT_ATTEMPTED" };
}

/** True when the item may be published now: eligible, cleared, and never published or attempted. */
export function isPublishableCampaignItem(spec: InstagramCampaignItemSpec, job: CampaignJobFacts | null): boolean {
  return spec.format_status === "FEED_ELIGIBLE" && spec.claim_review.status === "CLEARED" && spec.caption_validation?.ok !== false && job === null;
}

export interface CampaignSummary {
  total: number;
  feedEligible: number;
  formatIneligible: number;
  published: number;
  providerVerified: number;
  scheduled: number;
  blocked: number;
  blockedByPlatformLimit: number;
  blockedClaimReview: number;
  blockedCaptionValidation: number;
  failed: number;
  notAttempted: number;
}

export function summarizeCampaignItems(items: DerivedCampaignItemStatus[]): CampaignSummary {
  const count = (status: CampaignItemStatus) => items.filter((item) => item.status === status).length;
  const formatIneligible = count("FORMAT_INELIGIBLE_FOR_INSTAGRAM_FEED");
  const blockedByPlatformLimit = count("BLOCKED_BY_PLATFORM_LIMIT");
  const blockedClaimReview = count("BLOCKED_CLAIM_REVIEW");
  const blockedCaptionValidation = count("BLOCKED_CAPTION_VALIDATION");
  return {
    total: items.length,
    feedEligible: items.length - formatIneligible,
    formatIneligible,
    published: count("PUBLISHED"),
    providerVerified: items.filter((item) => item.status === "PUBLISHED" && item.providerVerified).length,
    scheduled: count("SCHEDULED"),
    blocked: blockedByPlatformLimit + blockedClaimReview + blockedCaptionValidation,
    blockedByPlatformLimit,
    blockedClaimReview,
    blockedCaptionValidation,
    failed: count("FAILED"),
    notAttempted: count("NOT_ATTEMPTED"),
  };
}

/** Provider errors can echo request URLs; never let a token reach a UI, log or report. */
export function maskProviderError(message: string | null | undefined): string | null {
  if (!message) return null;
  return message
    .replace(/access_token=[^&\s"']+/gi, "access_token=[redacted]")
    .replace(/\b(?:EAA|IGAA|IGQV)[A-Za-z0-9_-]{16,}\b/g, "[redacted-token]")
    .slice(0, 240);
}
