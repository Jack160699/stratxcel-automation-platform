import crypto from "node:crypto";
import { createSupabaseServiceClient } from "../supabase/service";
import { getProvider } from "./providers";
import type { SocialProvider } from "./providers";
import { MetaApiError } from "./errors";
import { evaluateAutomations } from "./automations";
import {
  getAccountService,
  getDecryptedTokenState,
  markReauthRequired,
  saveRefreshedAccessToken,
} from "./repositories/accounts";
import { accessTokenNeedsRefresh } from "./token-lifecycle";
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
import { resolveMediaForPublish } from "./repositories/media-assets";
import { recordAudit } from "./repositories/system";
import { verificationAuthorizationAllows } from "./verification-policy";

/**
 * Publishing worker for the stratxcel schema. Called from two places:
 *  - app/api/social/worker/route.ts (Vercel Cron, authenticated with CRON_SECRET)
 *  - app/admin/social/actions.ts runWorkerNowAction (admin-triggered, in-process)
 *
 * SAFETY: a job only actually calls the provider if the owner's
 * social_automation_settings row has shadow_mode=false, except for the exact
 * private YouTube verification path whose one-time owner/account/variant/
 * asset/job authorization is atomically consumed below. Ordinary SHADOW jobs
 * still record a dry-run result without calling the provider.
 */

const BATCH_SIZE = 5;
const WORKER_ID = () => `worker-${crypto.randomUUID().slice(0, 8)}`;

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export interface WorkerBatchResult {
  workerId: string;
  processed: number;
  results: Array<{ jobId: string; outcome: string }>;
}

interface VerificationExecution {
  authorizationId: string;
  ownerId: string;
}

async function getValidProviderAccessToken(
  service: ServiceClient,
  account: { id: string; platform: string }
): Promise<{ accessToken: string; provider: SocialProvider }> {
  const provider = getProvider(account.platform);
  const stored = await getDecryptedTokenState(service, account.id);
  if (!accessTokenNeedsRefresh(stored.expiresAt)) {
    return { accessToken: stored.accessToken, provider };
  }
  if (!stored.refreshToken || !provider.refreshAccessToken) {
    await markReauthRequired(service, account.id);
    throw new MetaApiError(
      `${account.platform} access expired and cannot be refreshed. Reconnect the account before publishing.`,
      "invalid_token",
      false,
      401
    );
  }

  try {
    const refreshed = await provider.refreshAccessToken(stored.refreshToken);
    await saveRefreshedAccessToken(service, account.id, refreshed.accessToken, refreshed.expiresInSeconds);
    return { accessToken: refreshed.accessToken, provider };
  } catch (error) {
    if (error instanceof MetaApiError && (error.category === "invalid_token" || error.category === "oauth_denied")) {
      await markReauthRequired(service, account.id);
    }
    throw error;
  }
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

export async function runAuthorizedVerificationJob(input: {
  ownerId: string;
  jobId: string;
  authorizationId: string;
}) {
  const service = createSupabaseServiceClient();
  const { data: job } = await service
    .from("social_publishing_jobs")
    .select("id, social_accounts!inner(owner_id)")
    .eq("id", input.jobId)
    .eq("social_accounts.owner_id", input.ownerId)
    .maybeSingle();
  if (!job) throw new Error("Owned verification job not found.");
  const claimed = await tryClaimJob(service, input.jobId, WORKER_ID());
  if (!claimed) throw new Error("Verification job is not available for execution.");
  const outcome = await processJob(service, claimed, {
    authorizationId: input.authorizationId,
    ownerId: input.ownerId,
  });
  return { jobId: input.jobId, outcome };
}

async function processJob(
  service: ServiceClient,
  job: { id: string; account_id: string; variant_id: string; attempts: number; max_attempts: number; idempotency_key: string },
  verification?: VerificationExecution
): Promise<string> {
  await markJobRunning(service, job.id);

  let accountId: string | undefined;
  let accountPlatform: string | undefined;

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
    accountPlatform = account.platform;
    if (account.status !== "CONNECTED") throw new Error(`account status is ${account.status}`);

    const { data: settings } = await service
      .from("social_automation_settings")
      .select("shadow_mode")
      .eq("owner_id", account.owner_id)
      .maybeSingle();
    const publishingDecision = externalMutationDecision(settings?.shadow_mode !== false, "publish_post");
    let isLive = publishingDecision.allowed;
    let verificationUpload = false;
    let preparedProvider: SocialProvider | undefined;
    let preparedAccessToken: string | undefined;

    const caption = [variant.caption, variant.hashtags?.map((h: string) => `#${h}`).join(" ")].filter(Boolean).join("\n\n");
    const resolvedMedia = await resolveMediaForPublish(service, variant);
    if (account.platform === "youtube" && resolvedMedia.urls.length === 0) {
      throw new Error("YouTube publishing requires a video media URL or attached READY MP4 media asset.");
    }
    if (
      account.platform === "youtube" &&
      resolvedMedia.assets.length > 0 &&
      !resolvedMedia.assets.some((asset) => asset.mime_type === "video/mp4")
    ) {
      throw new Error("YouTube publishing requires an attached READY MP4 media asset.");
    }

    if (!isLive && verification) {
      if (verification.ownerId !== account.owner_id) throw new Error("Verification authorization owner mismatch.");
      if (account.platform !== "youtube") throw new Error("Verification authorization is limited to YouTube.");
      if (normalizeYouTubePrivacyStatus(variant.creative_spec?.youtube_privacy_status) !== "private") {
        throw new Error("Verification authorization is limited to private YouTube uploads.");
      }
      const exactAsset = resolvedMedia.assets.find((asset) => asset.mime_type === "video/mp4");
      if (!exactAsset) throw new Error("The authorized MP4 is not attached to this variant.");
      const { data: authorization } = await service
        .from("social_verification_publish_authorizations")
        .select("owner_id, account_id, variant_id, asset_id, publishing_job_id, platform, purpose, status, expires_at")
        .eq("id", verification.authorizationId)
        .maybeSingle();
      if (!authorization || !verificationAuthorizationAllows(
        {
          ownerId: authorization.owner_id,
          accountId: authorization.account_id,
          variantId: authorization.variant_id,
          assetId: authorization.asset_id,
          jobId: authorization.publishing_job_id,
          platform: authorization.platform,
          purpose: authorization.purpose,
          status: authorization.status,
          expiresAt: authorization.expires_at,
        },
        {
          ownerId: account.owner_id,
          accountId: account.id,
          variantId: variant.id,
          assetId: exactAsset.id,
          jobId: job.id,
        },
        {
          accountPlatform: account.platform,
          privacyStatus: normalizeYouTubePrivacyStatus(variant.creative_spec?.youtube_privacy_status),
          assetMimeType: exactAsset.mime_type,
        }
      )) {
        throw new Error("The one-time verification authorization does not match this exact upload.");
      }
      // Refresh credentials before consuming the exact one-time permission.
      // A failed refresh therefore cannot burn the authorization without ever
      // reaching the authorized provider mutation.
      const prepared = await getValidProviderAccessToken(service, account);
      preparedProvider = prepared.provider;
      preparedAccessToken = prepared.accessToken;
      const { data: consumed, error: consumeError } = await service
        .from("social_verification_publish_authorizations")
        .update({ status: "CONSUMED", consumed_at: new Date().toISOString() })
        .eq("id", verification.authorizationId)
        .eq("owner_id", account.owner_id)
        .eq("account_id", account.id)
        .eq("variant_id", variant.id)
        .eq("asset_id", exactAsset.id)
        .eq("publishing_job_id", job.id)
        .eq("platform", "youtube")
        .eq("purpose", "YOUTUBE_PRIVATE_VERIFICATION")
        .eq("status", "ACTIVE")
        .gt("expires_at", new Date().toISOString())
        .select("id")
        .maybeSingle();
      if (consumeError || !consumed) throw new Error("The one-time verification authorization is missing, expired, or already consumed.");
      isLive = true;
      verificationUpload = true;
      await recordAudit({
        actorType: "SYSTEM",
        actorId: account.owner_id,
        action: "youtube.private_verification_authorization.consume",
        targetType: "social_publishing_job",
        targetId: job.id,
        summary: "Consumed one-time private YouTube verification authorization",
        meta: { authorizationId: verification.authorizationId, variantId: variant.id, accountId: account.id },
      });
    }

    let externalPostId = `SHADOW-${job.idempotency_key}`;
    let permalink: string | undefined;
    let raw: unknown = { shadow: true, note: publishingDecision.reason };

    if (isLive) {
      const prepared =
        preparedProvider && preparedAccessToken
          ? { provider: preparedProvider, accessToken: preparedAccessToken }
          : await getValidProviderAccessToken(service, account);
      const { provider, accessToken } = prepared;
      const result = await provider.publish({
        accessToken,
        externalAccountId: account.provider_account_id,
        caption,
        mediaUrls: resolvedMedia.urls,
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
      mode: isLive ? (verificationUpload ? "verification_live" : "live") : "shadow",
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
    // YouTube uploads are not automatically retried: a network failure can
    // happen after Google accepted the bytes but before its response reached
    // us, and replaying that request could create a duplicate video.
    const bounded =
      Boolean(verification) ||
      accountPlatform === "youtube" ||
      (isMetaError && !err.retryable) ||
      nextAttempt >= job.max_attempts;

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
