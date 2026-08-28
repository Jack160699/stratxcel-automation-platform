import { createSupabaseServiceClient } from "../supabase/service.ts";
import type { OwnerContext } from "./db-context.ts";
import { getAutomationSettings } from "./repositories/automation.ts";
import {
  attachMediaToVariant,
  getMediaAssetsByIds,
  updateContentVariant,
} from "./repositories/media-assets.ts";
import { getJobService, scheduleJob } from "./repositories/publishing.ts";
import { runAuthorizedVerificationJob } from "./worker.ts";

export async function executePrivateYoutubeVerification(
  ctx: OwnerContext,
  input: { accountId: string; variantId: string; assetId: string }
) {
  // Backwards-compatible wrapper that forces private visibility.
  return executeYoutubeVerification(ctx, { ...input, privacyStatus: "private" });
}

export async function executeYoutubeVerification(
  ctx: OwnerContext,
  input: { accountId: string; variantId: string; assetId: string; privacyStatus: "private" | "unlisted" }
) {
  const allowed = ["private", "unlisted"] as const;
  if (!allowed.includes(input.privacyStatus)) throw new Error("Invalid privacyStatus — must be 'private' or 'unlisted'.");

  const [settings, assets, accountResult, variantResult] = await Promise.all([
    getAutomationSettings(ctx),
    getMediaAssetsByIds(ctx, [input.assetId]),
    ctx.supabase
      .from("social_accounts")
      .select("id, platform, display_name, username, status, token_health")
      .eq("id", input.accountId)
      .maybeSingle(),
    ctx.supabase
      .from("content_variants")
      .select("id, master_id, platform, status, creative_spec")
      .eq("id", input.variantId)
      .maybeSingle(),
  ]);
  if (!settings.shadow_mode) throw new Error("The verification-only path is available only while global SHADOW mode is active.");
  const asset = assets[0];
  if (!asset || asset.mime_type !== "video/mp4") throw new Error("YouTube verification requires an owned READY MP4 asset.");
  const account = accountResult.data;
  if (!account || account.platform !== "youtube") throw new Error("Select an owned YouTube account.");
  if (account.status !== "CONNECTED" || account.token_health === "EXPIRED") {
    throw new Error("The selected YouTube account is disconnected or requires OAuth renewal.");
  }
  const variant = variantResult.data;
  if (!variant || variant.platform !== "youtube") throw new Error("Select an owned YouTube content variant.");
  if (variant.status === "PUBLISHED") throw new Error("This variant is already published; no duplicate upload was created.");

  await attachMediaToVariant(ctx, input.variantId, [asset.id], true);
  await updateContentVariant(ctx, {
    variantId: input.variantId,
    mediaAssetIds: [asset.id],
    youtubePrivacyStatus: input.privacyStatus,
  });

  const service = createSupabaseServiceClient();
  await service
    .from("social_verification_publish_authorizations")
    .update({ status: "EXPIRED" })
    .eq("owner_id", ctx.ownerId)
    .eq("account_id", input.accountId)
    .eq("variant_id", input.variantId)
    .eq("asset_id", asset.id)
    .eq("status", "ACTIVE")
    .lte("expires_at", new Date().toISOString());

  // Keep legacy purpose for compatibility; privacy_status is authoritative
  const purpose = "YOUTUBE_PRIVATE_VERIFICATION";

  const { data: authorization, error: authorizationError } = await ctx.supabase
    .from("social_verification_publish_authorizations")
    .insert({
      owner_id: ctx.ownerId,
      account_id: input.accountId,
      variant_id: input.variantId,
      asset_id: asset.id,
      platform: "youtube",
      purpose,
      privacy_status: input.privacyStatus,
      status: "ACTIVE",
    })
    .select("id")
    .single();
  if (authorizationError || !authorization) {
    throw new Error(authorizationError?.message ?? "Could not create the one-time verification authorization.");
  }

  let jobId: string;
  try {
    const keyPrefix = input.privacyStatus === "private" ? "youtube-private-verification" : "youtube-verification";
    jobId = await scheduleJob(service, {
      accountId: input.accountId,
      variantId: input.variantId,
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      idempotencyKey: `${keyPrefix}:${authorization.id}`,
    });
    const { error: bindError } = await service
      .from("social_verification_publish_authorizations")
      .update({ publishing_job_id: jobId })
      .eq("id", authorization.id)
      .eq("status", "ACTIVE");
    if (bindError) throw new Error(bindError.message);
  } catch (error) {
    await service.from("social_verification_publish_authorizations").delete().eq("id", authorization.id);
    throw error;
  }

  const execution = await runAuthorizedVerificationJob({
    ownerId: ctx.ownerId,
    jobId,
    authorizationId: authorization.id as string,
  });
  const job = await getJobService(service, jobId);
  if (!job) throw new Error("Verification publishing job disappeared.");
  if (execution.outcome !== "published_live" || job.status !== "PUBLISHED") {
    throw new Error(job.last_error || `YouTube verification failed (${execution.outcome}).`);
  }
  return {
    jobId,
    authorizationId: authorization.id,
    platform: "youtube",
    accountLabel: account.display_name || account.username,
    account: account.display_name || account.username,
    variantId: input.variantId,
    assetId: asset.id,
    privacyStatus: input.privacyStatus,
    status: job.status,
    externalPostId: job.result?.external_post_id,
    permalink: job.result?.permalink,
    publishedAt: job.completed_at,
  };
}
