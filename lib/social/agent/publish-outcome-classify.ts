// Pure, dependency-free classification helpers for publish-intent tool
// outcomes (mirrors activity-labels.ts / brand-sections.ts) — kept separate
// from publish-outcome.ts's DB/worker-touching runPublishNow() so this half
// can be unit tested standalone without hitting the extension-less relative
// imports elsewhere in the module graph that `node --experimental-strip-types`
// can't resolve on its own (same constraint noted in copilot-telemetry.test.ts).
import type { PublishingJobRow } from "../repositories/publishing";

/**
 * Tools whose success/failure this turn determines whether a "publish"
 * mission actually succeeded. The orchestrator uses this to refuse a
 * false "Done."/"Posted."/"Published." reply when the real outcome of the
 * most recent one of these calls was not a proven live publication.
 */
export const PUBLISH_INTENT_TOOLS = new Set([
  "schedule_post",
  "execute_youtube_verification",
  "execute_private_youtube_verification",
]);

/** True when a publish-intent tool's own output proves a real live publication. */
export function isProvenLivePublish(output: unknown): boolean {
  if (!output || typeof output !== "object") return false;
  const record = output as Record<string, unknown>;
  if (record.jobStatus === "PUBLISHED" && record.mode && record.mode !== "shadow") return true;
  // execute_youtube_verification / execute_private_youtube_verification shape.
  if (record.status === "PUBLISHED" && typeof record.externalPostId === "string") return true;
  return false;
}

/**
 * Human-safe outcome summary for a completed publish-intent tool call,
 * derived only from the tool's own return value — used by the orchestrator
 * as the deterministic fallback/correction when the model's own reply would
 * otherwise claim an unproven "Done."/"Posted."/"Published."
 */
export function describePublishAttempt(toolName: string, output: unknown): { succeeded: boolean; note: string } {
  const succeeded = isProvenLivePublish(output);
  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    if (typeof record.outcomeNote === "string") return { succeeded, note: record.outcomeNote };
    if (record.status === "PUBLISHED" && typeof record.permalink === "string") {
      return { succeeded: true, note: `Published successfully. Live permalink: ${record.permalink}` };
    }
    if (record.status === "PUBLISHED") return { succeeded: true, note: "Published successfully." };
  }
  return { succeeded, note: `${toolName} did not confirm a live publication.` };
}

export function outcomeNoteFor(job: PublishingJobRow | null, wasImmediate: boolean): string {
  if (!job) return "The publishing job could not be found after scheduling — treat this as not published.";
  const result = (job.result ?? {}) as Record<string, unknown>;
  if (job.status === "PUBLISHED") {
    if (result.mode === "shadow") {
      return "Draft prepared successfully, but Social Autopilot is in Shadow Mode, so nothing was published externally — there is no live post or permalink.";
    }
    const permalink = typeof result.permalink === "string" ? result.permalink : undefined;
    return permalink
      ? `Published successfully. Live permalink: ${permalink}`
      : "Published successfully, but the provider did not return a live permalink for this platform.";
  }
  if (job.status === "FAILED") {
    return `Publishing failed: ${job.last_error || "unknown error"}. No post was created — do not say it was posted or done.`;
  }
  if (job.status === "SCHEDULED" || job.status === "CLAIMED" || job.status === "RUNNING") {
    return wasImmediate
      ? "The publishing job has not reached a terminal state yet. Do not claim it was published — report it as still in progress/queued."
      : "Queued for publishing at the requested future time. It is not live yet.";
  }
  return `Publishing job status: ${job.status}. Treat this as not published unless status is PUBLISHED.`;
}
