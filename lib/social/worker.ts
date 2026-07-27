import crypto from "node:crypto";
import { createSupabaseServiceClient } from "../supabase/service";
import { decryptToken } from "./crypto";
import { getProvider } from "./providers";
import { MetaApiError } from "./errors";

/**
 * Shared publishing-worker batch logic. Called from two places:
 *  - app/api/social/worker/route.ts (Vercel Cron, authenticated with CRON_SECRET)
 *  - app/admin/social/actions.ts runWorkerNowAction (admin-triggered, in-process)
 * Neither caller re-implements job claiming — both go through this single
 * code path so there is exactly one place where "claim a job" happens.
 *
 * SAFETY: actual publish only happens if BOTH the job's own mode is 'live'
 * AND the global social_settings.publishing_mode is 'live'. Otherwise the
 * job runs the full pipeline (fetch content, decrypt token, build payload)
 * but records a shadow publication instead of calling the provider.
 */

const BATCH_SIZE = 5;
const WORKER_ID = () => `worker-${crypto.randomUUID().slice(0, 8)}`;

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export interface WorkerBatchResult {
  workerId: string;
  mode: "shadow" | "live";
  processed: number;
  results: Array<{ jobId: string; outcome: string }>;
}

export async function runWorkerBatch(): Promise<WorkerBatchResult> {
  const service = createSupabaseServiceClient();
  const workerId = WORKER_ID();

  const { data: settingRow } = await service
    .from("social_settings")
    .select("value")
    .eq("key", "publishing_mode")
    .maybeSingle();
  const globalMode: "shadow" | "live" = (settingRow?.value as string) === "live" ? "live" : "shadow";

  const { data: candidates } = await service
    .from("social_jobs")
    .select("id")
    .eq("status", "pending")
    .lte("run_after", new Date().toISOString())
    .order("run_after", { ascending: true })
    .limit(BATCH_SIZE);

  const results: WorkerBatchResult["results"] = [];

  for (const candidate of candidates ?? []) {
    // Atomic claim: only succeeds if still 'pending' at the moment this runs.
    // If two invocations race for the same row, exactly one UPDATE matches
    // the WHERE status='pending' predicate — Postgres row locking serializes
    // the two statements and the loser's predicate no longer matches.
    const { data: claimed } = await service
      .from("social_jobs")
      .update({ status: "claimed", claimed_by: workerId, claimed_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .select("id, scheduled_post_id, attempt, max_attempts, mode")
      .maybeSingle();

    if (!claimed) continue; // lost the race to another worker invocation

    const outcome = await processJob(service, claimed, globalMode);
    results.push({ jobId: claimed.id, outcome });
  }

  return { workerId, mode: globalMode, processed: results.length, results };
}

async function processJob(
  service: ServiceClient,
  job: { id: string; scheduled_post_id: string; attempt: number; max_attempts: number; mode: string },
  globalMode: "shadow" | "live"
): Promise<string> {
  await service.from("social_jobs").update({ status: "running" }).eq("id", job.id);

  let accountId: string | undefined;

  try {
    const { data: post } = await service
      .from("social_scheduled_posts")
      .select("id, content_item_id, account_id, provider, status")
      .eq("id", job.scheduled_post_id)
      .single();
    if (!post) throw new Error("scheduled_post not found");
    if (post.status === "cancelled") {
      await service.from("social_jobs").update({ status: "dead_letter", last_error: "post cancelled" }).eq("id", job.id);
      return "skipped_cancelled";
    }
    if (post.status === "published") {
      // Already-published guard: if a retry somehow re-enters processJob for a
      // post that already succeeded (e.g. manual re-trigger racing a prior
      // success), don't publish a second time.
      await service.from("social_jobs").update({ status: "succeeded", result: { note: "already published" } }).eq("id", job.id);
      return "already_published";
    }

    const { data: content } = await service
      .from("social_content_items")
      .select("base_caption, hashtags, cta, media_urls, platform_variants")
      .eq("id", post.content_item_id)
      .single();
    if (!content) throw new Error("content_item not found");

    const { data: account } = await service
      .from("social_accounts")
      .select(
        "id, external_account_id, status, access_token_ciphertext, access_token_iv, access_token_tag"
      )
      .eq("id", post.account_id)
      .single();
    if (!account) throw new Error("social_account not found");
    accountId = account.id;
    if (account.status !== "connected") throw new Error(`account status is ${account.status}`);
    if (!account.access_token_ciphertext) throw new Error("no stored access token");

    const variant = (content.platform_variants as Record<string, { caption?: string }>)?.[post.provider];
    const caption = [variant?.caption ?? content.base_caption, content.hashtags?.map((h: string) => `#${h}`).join(" "), content.cta]
      .filter(Boolean)
      .join("\n\n");

    const isLive = globalMode === "live" && job.mode === "live";

    let externalPostId = `SHADOW-${crypto.randomUUID()}`;
    let permalink: string | undefined;
    let raw: unknown = { shadow: true, note: "No provider call made — publishing mode is not live." };

    if (isLive) {
      const accessToken = decryptToken({
        ciphertext: account.access_token_ciphertext,
        iv: account.access_token_iv!,
        tag: account.access_token_tag!,
      });
      const provider = getProvider(post.provider);
      const result = await provider.publish({
        accessToken,
        externalAccountId: account.external_account_id,
        caption,
        mediaUrls: content.media_urls ?? [],
      });
      externalPostId = result.externalPostId;
      permalink = result.permalink;
      raw = result.raw;
    }

    // Mark the scheduled post published FIRST, inside the same logical step as
    // recording the publication, so a retry that re-enters this job sees
    // status='published' and takes the already_published short-circuit above
    // instead of publishing twice.
    await service.from("social_publications").insert({
      scheduled_post_id: post.id,
      account_id: account.id,
      provider: post.provider,
      mode: isLive ? "live" : "shadow",
      external_post_id: externalPostId,
      permalink: permalink ?? null,
      raw_response: raw,
    });
    await service.from("social_scheduled_posts").update({ status: "published" }).eq("id", post.id);
    await service.from("social_jobs").update({ status: "succeeded", result: { mode: isLive ? "live" : "shadow" } }).eq("id", job.id);

    return isLive ? "published_live" : "published_shadow";
  } catch (err) {
    const isMetaError = err instanceof MetaApiError;
    const message = err instanceof Error ? err.message : "unknown error";
    const nextAttempt = job.attempt + 1;
    // A non-retryable Meta error (bad/expired token, permission denied, OAuth
    // denial) goes straight to dead_letter instead of burning through the
    // retry budget on something a retry can't fix.
    const bounded = (isMetaError && !err.retryable) || nextAttempt >= job.max_attempts;

    await service
      .from("social_jobs")
      .update({
        status: bounded ? "dead_letter" : "pending",
        attempt: nextAttempt,
        last_error: message,
        run_after: bounded
          ? undefined
          : new Date(Date.now() + Math.min(2 ** nextAttempt, 60) * 60 * 1000).toISOString(),
      })
      .eq("id", job.id);

    if (isMetaError && err.category === "invalid_token" && accountId) {
      await service
        .from("social_accounts")
        .update({ status: "reauth_required", last_error: message })
        .eq("id", accountId);
    }

    await service.from("social_system_events").insert({
      category: "publish",
      level: "error",
      message: `Job ${job.id} failed: ${message}`,
      meta: { attempt: nextAttempt, bounded, errorCategory: isMetaError ? err.category : "generic" },
    });

    return bounded ? "dead_letter" : "retry_scheduled";
  }
}
