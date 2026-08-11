import type { SocialPublicationQueryResult, SocialPublicationStatus } from "./types.ts";

export interface PublicationStatusRecord {
  reference: string;
  rawStatus: string;
  liveUrl?: string | null;
  providerPublishId?: string | null;
  publishedAtIso?: string | null;
  scheduleJobId?: string | null;
  shadow?: boolean;
  resultMode?: string | null;
}

const JOB_STATUS_MAP: Record<string, SocialPublicationStatus> = {
  PLANNED: "PLANNED",
  PREPARED: "PREPARED",
  REVIEW_REQUIRED: "PREPARED",
  SCHEDULED: "SCHEDULED",
  CLAIMED: "PUBLISHING",
  RUNNING: "PUBLISHING",
  EXECUTING: "PUBLISHING",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
  SHADOW_COMPLETED: "SHADOW_COMPLETED",
  CANCELLED: "CANCELLED",
  SKIPPED: "CANCELLED",
  BLOCKED: "FAILED",
};

/**
 * Map Social job/queue rows into the controlled publication status surface.
 * Never returns provider credentials.
 */
export function mapToSocialPublicationStatus(rawStatus: string, shadowHint?: boolean): SocialPublicationStatus {
  const key = String(rawStatus || "").toUpperCase();
  if (shadowHint && (key === "PUBLISHED" || key === "SHADOW_COMPLETED")) {
    return "SHADOW_COMPLETED";
  }
  return JOB_STATUS_MAP[key] ?? "UNKNOWN";
}

export function queryPublicationStatusFromRecord(
  record: PublicationStatusRecord | null | undefined,
): SocialPublicationQueryResult {
  if (!record) {
    return {
      status: "UNKNOWN",
      reference: "",
      liveUrl: null,
      providerPublishId: null,
      publishedAtIso: null,
      scheduleJobId: null,
      shadow: false,
      safeDetail: "publication_reference_not_found",
    };
  }

  const shadow =
    Boolean(record.shadow) ||
    String(record.resultMode || "").toLowerCase() === "shadow" ||
    String(record.rawStatus).toUpperCase() === "SHADOW_COMPLETED";

  const status = mapToSocialPublicationStatus(record.rawStatus, shadow);

  return {
    status,
    reference: record.reference,
    liveUrl: record.liveUrl ?? null,
    providerPublishId: record.providerPublishId ?? null,
    publishedAtIso: record.publishedAtIso ?? null,
    scheduleJobId: record.scheduleJobId ?? null,
    shadow,
    safeDetail: null,
  };
}

/**
 * Hermes-facing safe payload — never includes OAuth tokens or provider secrets.
 */
export function toHermesPublicationStatusPayload(result: SocialPublicationQueryResult): Record<string, unknown> {
  return {
    status: result.status === "UNKNOWN" ? "unknown" : result.status.toLowerCase(),
    reference: result.reference || null,
    liveUrl: result.liveUrl,
    providerPublishId: result.providerPublishId,
    publishedAt: result.publishedAtIso,
    scheduleJobId: result.scheduleJobId,
    shadow: result.shadow,
  };
}
