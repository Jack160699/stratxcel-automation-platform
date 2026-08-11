import type { RetryClass, SocialReleaseArtifact } from "./types.ts";
import { assertIdenticalReleasePayload } from "./release-artifact.ts";

export class SocialRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialRetryError";
  }
}

/**
 * Distinguish technical publishing retry from creative revision.
 * Technical retry MUST reuse the exact release artifact (no regeneration).
 */
export function classifyPublishFailure(errorCode: string): RetryClass {
  const code = errorCode.toLowerCase();
  if (/timeout|rate.?limit|5\d\d|network|temporary|provider_unavailable|econnreset|503|502|429/.test(code)) {
    return "TECHNICAL_PUBLISH";
  }
  if (/brand|claim|policy|quality|compliance|caption|creative|reject/.test(code)) {
    return "CREATIVE_REVISION";
  }
  return "TECHNICAL_PUBLISH";
}

export function prepareTechnicalRetry(original: SocialReleaseArtifact): SocialReleaseArtifact {
  return { ...original };
}

export function assertTechnicalRetryPreservesArtifact(
  original: SocialReleaseArtifact,
  retryPayload: SocialReleaseArtifact,
): void {
  assertIdenticalReleasePayload(original, retryPayload);
  if (original.id !== retryPayload.id) {
    throw new SocialRetryError("technical_retry_must_reuse_artifact_id");
  }
}

export function assertCreativeRevisionRequired(retryClass: RetryClass): void {
  if (retryClass !== "CREATIVE_REVISION") {
    throw new SocialRetryError("creative_revision_not_indicated");
  }
}
