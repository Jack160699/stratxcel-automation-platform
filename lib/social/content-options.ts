import type { PublishPrivacyStatus } from "./providers/types.ts";
import { normalizeYouTubePrivacyStatus } from "./providers/youtube-visibility.ts";

/**
 * Canonical values from the production `content_master_objective_check`
 * constraint. Keep the database, every server-side write, Agent tool schemas,
 * and the Create form on this shared contract.
 */
export const CONTENT_OBJECTIVES = [
  { value: "REACH", label: "Reach" },
  { value: "ENGAGEMENT", label: "Engagement" },
  { value: "FOLLOWERS", label: "Followers" },
  { value: "TRAFFIC", label: "Traffic" },
  { value: "LEADS", label: "Leads" },
  { value: "SALES", label: "Sales" },
  { value: "AUTHORITY", label: "Authority" },
  { value: "COMMUNITY", label: "Community" },
  { value: "RETENTION", label: "Retention" },
] as const;

export const CONTENT_OBJECTIVE_VALUES = CONTENT_OBJECTIVES.map((option) => option.value);
export type ContentObjective = (typeof CONTENT_OBJECTIVES)[number]["value"];

export const CONTENT_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "threads", label: "Threads" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number]["value"];

export const CONTENT_FORMATS = [
  { value: "post", label: "Post" },
  { value: "carousel", label: "Carousel" },
  { value: "reel", label: "Reel/Video" },
  { value: "story", label: "Story" },
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number]["value"];

export const YOUTUBE_PRIVACY_OPTIONS = [
  { value: "private", label: "Private (safest)" },
  { value: "unlisted", label: "Unlisted" },
  { value: "public", label: "Public" },
] as const;

const OBJECTIVE_SET = new Set<string>(CONTENT_OBJECTIVE_VALUES);
const PLATFORM_SET = new Set<string>(CONTENT_PLATFORMS.map((option) => option.value));
const FORMAT_SET = new Set<string>(CONTENT_FORMATS.map((option) => option.value));
const YOUTUBE_PRIVACY_SET = new Set<string>(YOUTUBE_PRIVACY_OPTIONS.map((option) => option.value));

export class ContentDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentDraftValidationError";
  }
}

export function requireContentObjective(value: string): ContentObjective {
  if (!OBJECTIVE_SET.has(value)) {
    throw new ContentDraftValidationError("Choose a valid objective.");
  }
  return value as ContentObjective;
}

/**
 * Canonical platform normalization — the single boundary function every
 * write path and comparison must go through. Historical rows and
 * model-generated tool arguments can carry any casing ("THREADS", "Threads",
 * "threads"); this maps all of them to the one lowercase internal value so
 * `platform === platform` comparisons never depend on caller casing.
 */
export function normalizePlatform(value: unknown): ContentPlatform | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return PLATFORM_SET.has(normalized) ? (normalized as ContentPlatform) : null;
}

export function requirePlatform(value: unknown, field = "Platform"): ContentPlatform {
  const normalized = normalizePlatform(value);
  if (!normalized) {
    throw new ContentDraftValidationError(
      `${field} must be one of: ${CONTENT_PLATFORMS.map((option) => option.value).join(", ")}.`
    );
  }
  return normalized;
}

/** Canonical-to-canonical comparison — safe against casing on either side, including legacy stored rows. */
export function platformsMatch(a: unknown, b: unknown): boolean {
  const normalizedA = normalizePlatform(a);
  const normalizedB = normalizePlatform(b);
  return normalizedA !== null && normalizedA === normalizedB;
}

export interface CreateContentDraftInput {
  campaignId: string | null;
  title: string;
  masterIdea: string;
  objective: ContentObjective;
  contentPillar: string;
  platform: ContentPlatform;
  format: ContentFormat;
  caption: string;
  hashtags: string[];
  mediaUrls: string[];
  youtubePrivacyStatus: PublishPrivacyStatus;
}

function requiredText(formData: FormData, key: string, message: string): string {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new ContentDraftValidationError(message);
  return value;
}

export function parseCreateContentDraft(
  formData: FormData,
  canonicalContentPillars: readonly string[]
): CreateContentDraftInput {
  const contentPillar = requiredText(formData, "content_pillar", "Choose a content pillar.");
  if (canonicalContentPillars.length > 0 && !canonicalContentPillars.includes(contentPillar)) {
    throw new ContentDraftValidationError("Choose a content pillar saved in Brand Brain.");
  }

  const platformValue = String(formData.get("platform") ?? "");
  if (!PLATFORM_SET.has(platformValue)) {
    throw new ContentDraftValidationError("Choose a valid platform.");
  }

  const formatValue = String(formData.get("format") ?? "");
  if (!FORMAT_SET.has(formatValue)) {
    throw new ContentDraftValidationError("Choose a valid content format.");
  }

  const youtubePrivacyValue = String(formData.get("youtube_privacy_status") ?? "private");
  if (platformValue === "youtube" && !YOUTUBE_PRIVACY_SET.has(youtubePrivacyValue)) {
    throw new ContentDraftValidationError("Choose a valid YouTube visibility.");
  }

  return {
    campaignId: String(formData.get("campaign_id") ?? "").trim() || null,
    title: requiredText(formData, "title", "Enter an internal title."),
    masterIdea: requiredText(formData, "master_idea", "Enter the master idea."),
    objective: requireContentObjective(String(formData.get("objective") ?? "")),
    contentPillar,
    platform: platformValue as ContentPlatform,
    format: formatValue as ContentFormat,
    caption: requiredText(formData, "caption", "Enter a caption."),
    hashtags: String(formData.get("hashtags") ?? "")
      .split(/[,\s]+/)
      .map((hashtag) => hashtag.replace(/^#/, "").trim())
      .filter(Boolean),
    mediaUrls: String(formData.get("media_urls") ?? "")
      .split(/\s+/)
      .map((url) => url.trim())
      .filter(Boolean),
    youtubePrivacyStatus: normalizeYouTubePrivacyStatus(youtubePrivacyValue),
  };
}
