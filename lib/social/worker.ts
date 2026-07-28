import crypto from "node:crypto";
import { createSupabaseServiceClient } from "../supabase/service";
import { getProvider } from "./providers";
import { MetaApiError } from "./errors";
import { evaluateAutomations } from "./automations";
import { getAccountService, getDecryptedAccessToken, markReauthRequired } from "./repositories/accounts";
import { getVariantForPublish, markVariantStatus } from "./repositories/content";
import {
  claimDueJobs,
  tryClaimJob,
  markJobRunning,
  markJobPublished,
  markJobRetry,
  moveJobToDeadLetter,
} from "./repositories/publishing";
import { recordMetrics } from "./repositories/analytics";
import { externalMutationDecision } from "./shadow-gate";
import { normalizeYouTubePrivacyStatus } from "./providers/youtube-visibility";

/**
 * Publishing worker for the stratxcel schema. Called from two places:
 *  - app/api/social/worker/route.ts (Vercel Cron, authenticated with CRON_SECRET)
 *  - app/admin/social/actions.ts runWorkerNowAction (admin-triggered, in-process)
 *
 * SAFETY: a job only actually calls the provider if the owner's
 * social_automation_settings row has shadow_mode=false. Otherwise the full
 * pipeline runs (fetch variant, decrypt token, build payload) but records a
 * shadow result instead of calling the provider — same dry-run guarantee
 * the original implementation had, expressed through this schema's own
 * shadow_mode column instead of a separate settings table.
 */

const BATCH_SIZE = 5;
const WORKER_ID = () => `worker-${crypto.randomUUID().slice(0, 8)}`;

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export interface WorkerBatchResult {
  workerId: string;
  processed: number;
  results: Array<{ jobId: string; outcome: string }>;
}

export async function runWorkerBatch(options: { ownerId?: string } = {}): Promise<WorkerBatchResult> {
  const service = createSupabaseServiceClient();
  const workerId = WORKER_ID();

  const candidates = await claimDueJobs(service, BATCH_SIZE, options.ownerId);
  const results: WorkerBatchResult["results"] = [];

  for (const candidate of candidates) {
    const claimed = await tryClaimJob(service, candidate.id, workerId);
    if (!claimed) continue; // lost the race to another worker invocation

    const outcome = await processJob(service, claimed);
    results.push({ jobId: claimed.id, outcome });
  }

  return { workerId, processed: results.length, results };
}

async function processJob(
  service: ServiceClient,
  job: { id: string; account_id: string; variant_id: string; attempts: number; max_attempts: number; idempotency_key: string }
): Promise<string> {
  await markJobRunning(service, job.id);

  let accountId: string | undefined;

  try {
    const variant = await getVariantForPublish(service, job.variant_id);
    if (!variant) throw new Error("content_variant not found");
    if (variant.status === "PUBLISHED") {
      // Already-published guard: if a retry somehow re-enters processJob for
      // a variant that already succeeded, don't publish a second time.
      await markJobPublished(service, job.id, { note: "already published" });
      return "already_published";
    }

    const account = await getAccountService(service, job.account_id);
    if (!account) throw new Error("social_account not found");
    accountId = account.id;
    if (account.status !== "CONNECTED") throw new Error(`account status is ${account.status}`);

    const { data: settings } = await service
      .from("social_automation_settings")
      .select("shadow_mode")
      .eq("owner_id", account.owner_id)
      .maybeSingle();
    const publishingDecision = externalMutationDecision(settings?.shadow_mode !== false, "publish_post");
    const isLive = publishingDecision.allowed;

    const caption = [variant.caption, variant.hashtags?.map((h: string) => `#${h}`).join(" ")].filter(Boolean).join("\n\n");

    let externalPostId = `SHADOW-${job.idempotency_key}`;
    let permalink: string | undefined;
    let raw: unknown = { shadow: true, note: publishingDecision.reason };

    if (isLive) {
      const accessToken = await getDecryptedAccessToken(service, account.id);
      const provider = getProvider(account.platform);
      const result = await provider.publish({
        accessToken,
        externalAccountId: account.provider_account_id,
        caption,
        mediaUrls: variant.media_urls ?? [],
        privacyStatus:
          account.platform === "youtube"
            ? normalizeYouTubePrivacyStatus(variant.creative_spec?.youtube_privacy_status)
            : undefined,
      });
      externalPostId = result.externalPostId;
      permalink = result.permalink;
      raw = result.raw;
    }

    // Mark the variant published FIRST, inside the same logical step as
    // recording the job result, so a retry that re-enters this job sees
    // status='PUBLISHED' and takes the already_published short-circuit
    // above instead of publishing twice.
    await markVariantStatus(service, job.variant_id, "PUBLISHED", { published_at: new Date().toISOString() });
    await markJobPublished(service, job.id, {
      mode: isLive ? "live" : "shadow",
      external_post_id: externalPostId,
      ...(permalink ? { permalink } : {}),
      raw,
    });
    await recordMetrics(service, job.variant_id, externalPostId, {});

    await evaluateAutomations("post_published", { provider: account.platform, jobId: job.id }).catch(() => {
      // Automation failures never block the publish path that already succeeded.
    });

    return isLive ? "published_live" : "published_shadow";
  } catch (err) {
    const isMetaError = err instanceof MetaApiError;
    const message = err instanceof Error ? err.message : "unknown error";
    const nextAttempt = job.attempts + 1;
    // A non-retryable Meta error (bad/expired token, permission denied,
    // OAuth denial) goes straight to dead-letter instead of burning through
    // the retry budget on something a retry can't fix.
    const bounded = (isMetaError && !err.retryable) || nextAttempt >= job.max_attempts;

    if (bounded) {
      await moveJobToDeadLetter(service, job.id, { attempts: nextAttempt, errorCategory: isMetaError ? err.category : "generic" }, message);
      await evaluateAutomations("job_dead_letter", { jobId: job.id, error: message }).catch(() => {});
    } else {
      await markJobRetry(service, job.id, nextAttempt, message);
    }

    if (isMetaError && err.category === "invalid_token" && accountId) {
      await markReauthRequired(service, accountId);
    }

    return bounded ? "dead_letter" : "retry_scheduled";
  }
}
