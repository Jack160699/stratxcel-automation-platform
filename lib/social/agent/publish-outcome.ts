import { createSupabaseServiceClient } from "../../supabase/service";
import { runWorkerBatch } from "../worker";
import { getJobService, type PublishingJobRow } from "../repositories/publishing";
import { outcomeNoteFor } from "./publish-outcome-classify";

export { PUBLISH_INTENT_TOOLS, isProvenLivePublish, describePublishAttempt } from "./publish-outcome-classify";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * How close `scheduledAt` must be to "now" to count as a "post it now"
 * request that should run synchronously instead of waiting for the next
 * worker cron tick.
 */
const IMMEDIATE_WINDOW_MS = 2 * 60 * 1000;

export interface PublishNowResult {
  jobId: string;
  scheduledAt: string;
  /** Real, tool-observed job status — never invented. */
  jobStatus: string;
  /** "live" | "shadow" | "verification_live" | undefined when the job hasn't run yet. */
  mode?: string;
  externalPostId?: string;
  permalink?: string;
  lastError?: string | null;
  publishedAt?: string | null;
  platform?: string;
  accountLabel?: string;
  /** Human-safe summary the model should report faithfully rather than paraphrase into an unproven "Done." */
  outcomeNote: string;
}

/**
 * After creating a SCHEDULED publishing job, decide whether the request was
 * close enough to "now" to justify synchronously running one worker batch —
 * the same in-process path as the admin "Run worker now" action — so the
 * tool can return the REAL terminal state instead of the Agent guessing.
 * Future-scheduled jobs are left for the normal cron worker and reported as
 * queued, never as published. `context` (platform/accountLabel) is purely
 * cosmetic — real for-real evidence (permalink/externalPostId/job status)
 * always comes from the job row itself.
 */
export async function runPublishNow(
  service: ServiceClient,
  jobId: string,
  scheduledAt: string,
  ownerId: string,
  context: { platform?: string; accountLabel?: string } = {}
): Promise<PublishNowResult> {
  const scheduledMs = new Date(scheduledAt).getTime();
  const isImmediate = Number.isFinite(scheduledMs) && scheduledMs <= Date.now() + IMMEDIATE_WINDOW_MS;

  if (isImmediate) {
    // Bounded, single synchronous attempt — never polled indefinitely. If
    // this throws, the job simply stays SCHEDULED and is reported as such.
    await runWorkerBatch({ ownerId }).catch(() => {});
  }

  const job: PublishingJobRow | null = await getJobService(service, jobId);
  const result = (job?.result ?? {}) as Record<string, unknown>;
  return {
    jobId,
    scheduledAt,
    jobStatus: job?.status ?? "UNKNOWN",
    mode: typeof result.mode === "string" ? result.mode : undefined,
    externalPostId: typeof result.external_post_id === "string" ? result.external_post_id : undefined,
    permalink: typeof result.permalink === "string" ? result.permalink : undefined,
    lastError: job?.last_error ?? null,
    publishedAt: job?.completed_at ?? null,
    platform: context.platform,
    accountLabel: context.accountLabel,
    outcomeNote: outcomeNoteFor(job, isImmediate, context),
  };
}
