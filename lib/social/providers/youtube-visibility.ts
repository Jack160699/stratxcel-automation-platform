import type { PublishPrivacyStatus } from "./types.ts";

const YOUTUBE_PRIVACY_STATUSES = new Set<PublishPrivacyStatus>(["private", "unlisted", "public"]);

export function normalizeYouTubePrivacyStatus(value: unknown): PublishPrivacyStatus {
  return typeof value === "string" && YOUTUBE_PRIVACY_STATUSES.has(value as PublishPrivacyStatus)
    ? (value as PublishPrivacyStatus)
    : "private";
}
