import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveCampaignItemStatus,
  isPublishableCampaignItem,
  maskProviderError,
  parseCampaignItemSpec,
  type CampaignJobFacts,
  type InstagramCampaignItemSpec,
} from "./instagram-campaign.ts";
import { OAuthAccountMismatchError, assertBoundProviderAccount } from "./oauth-account-binding.ts";
import type { InstagramMedia, InstagramPublishingLimit } from "./providers/instagram.ts";
import type { BusinessContactProfile } from "./business-contact.ts";
import type { StructuredCta } from "./caption-cta.ts";
import { summarizeCaptionIssues, validateCaptionForPublish } from "./caption-validation.ts";

/**
 * Paced Instagram campaign publishing: exactly ONE campaign item per call.
 * Every call re-checks, in order, that
 *   1. the tenant's own Instagram connection is CONNECTED/HEALTHY,
 *   2. it is the account the item is bound to (never another tenant's),
 *   3. the owner is in live mode (a shadow run would only simulate),
 *   4. the token can read the publishing quota (live proof of the publish
 *      permission) and the quota is not exhausted,
 *   5. the exact caption passes pre-publish validation (platform link rules,
 *      canonical contact numbers, absolute claims) -- a failing item is
 *      recorded as blocked and skipped, never published,
 *   6. the item is not already on Instagram (a lost response must not become
 *      a duplicate post),
 * then publishes through the normal worker path and reads the post back from
 * Instagram before reporting it published.
 */

export type CampaignPublishOutcome =
  | "published"
  | "already_published"
  | "nothing_to_publish"
  | "blocked_by_platform_limit"
  | "connection_not_ready"
  | "account_mismatch"
  | "shadow_mode"
  | "validation_failed"
  | "failed";

export interface CampaignPublishStep {
  outcome: CampaignPublishOutcome;
  variantId?: string;
  assetName?: string;
  jobId?: string;
  mediaId?: string;
  permalink?: string;
  providerVerified?: boolean;
  quota?: { usage: number; total: number };
  message?: string;
}

export interface CampaignPublisherDeps {
  loadContact(tenantId: string): Promise<BusinessContactProfile | null>;
  getAccessToken(account: { id: string; platform: string }): Promise<string>;
  fetchPublishingLimit(accessToken: string, igUserId: string): Promise<InstagramPublishingLimit>;
  listRecentMedia(accessToken: string, igUserId: string): Promise<InstagramMedia[]>;
  fetchMedia(accessToken: string, mediaId: string): Promise<InstagramMedia>;
  runJob(jobId: string): Promise<unknown>;
  audit(entry: { actorId: string | null; action: string; summary: string; targetId?: string; meta?: Record<string, unknown> }): Promise<void>;
  now(): Date;
}

interface CampaignItemRow {
  variantId: string;
  caption: string;
  hashtags: string[];
  spec: InstagramCampaignItemSpec;
  job: (CampaignJobFacts & { id: string }) | null;
}

async function loadCampaignItems(service: SupabaseClient, tenantId: string, campaignId: string, accountId: string): Promise<CampaignItemRow[]> {
  const { data: masters, error: mErr } = await service
    .from("content_master")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("campaign_id", campaignId);
  if (mErr) throw new Error(`Failed to load campaign content: ${mErr.message}`);
  const masterIds = (masters ?? []).map((m) => m.id as string);
  if (masterIds.length === 0) return [];

  const { data: variants, error: vErr } = await service
    .from("content_variants")
    .select("id, caption, hashtags, creative_spec")
    .in("master_id", masterIds)
    .eq("platform", "instagram");
  if (vErr) throw new Error(`Failed to load campaign variants: ${vErr.message}`);

  const items = (variants ?? [])
    .map((v) => ({
      variantId: v.id as string,
      caption: (v.caption as string) ?? "",
      hashtags: (v.hashtags as string[] | null) ?? [],
      spec: parseCampaignItemSpec(v.creative_spec),
    }))
    .filter((v): v is { variantId: string; caption: string; hashtags: string[]; spec: InstagramCampaignItemSpec } => v.spec !== null && v.spec.campaign_id === campaignId);
  if (items.length === 0) return [];

  // Jobs only count when they belong to this tenant's own account.
  const { data: jobs, error: jErr } = await service
    .from("social_publishing_jobs")
    .select("id, variant_id, account_id, status, scheduled_at, completed_at, last_error, result, created_at")
    .in("variant_id", items.map((i) => i.variantId))
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (jErr) throw new Error(`Failed to load campaign jobs: ${jErr.message}`);
  const latestJobByVariant = new Map<string, CampaignItemRow["job"]>();
  for (const job of jobs ?? []) {
    if (latestJobByVariant.has(job.variant_id as string)) continue;
    latestJobByVariant.set(job.variant_id as string, {
      id: job.id as string,
      status: job.status as string,
      scheduled_at: job.scheduled_at as string | null,
      completed_at: job.completed_at as string | null,
      last_error: job.last_error as string | null,
      result: job.result as Record<string, unknown> | null,
    });
  }

  return items
    .map((item) => ({ ...item, job: latestJobByVariant.get(item.variantId) ?? null }))
    .sort((a, b) => a.spec.sequence - b.spec.sequence);
}

function normalizeUsername(username: string | null | undefined): string {
  return (username ?? "").replace(/^@/, "").trim().toLowerCase();
}

export async function publishNextCampaignItem(
  service: SupabaseClient,
  input: { tenantId: string; campaignId: string; actorUserId: string | null },
  deps: CampaignPublisherDeps
): Promise<CampaignPublishStep> {
  const { data: account, error: aErr } = await service
    .from("social_accounts")
    .select("id, owner_id, tenant_id, platform, provider_account_id, username, status, token_health")
    .eq("tenant_id", input.tenantId)
    .eq("platform", "instagram")
    .maybeSingle();
  if (aErr) throw new Error(`Failed to load the tenant's Instagram account: ${aErr.message}`);
  if (!account || account.tenant_id !== input.tenantId) {
    return { outcome: "connection_not_ready", message: "This tenant has no Instagram connection." };
  }
  if (account.status !== "CONNECTED" || account.token_health !== "HEALTHY") {
    return { outcome: "connection_not_ready", message: `Instagram connection is ${account.status}/${account.token_health}; reconnect before publishing.` };
  }

  const items = await loadCampaignItems(service, input.tenantId, input.campaignId, account.id as string);
  const next = items.find((item) => isPublishableCampaignItem(item.spec, item.job));
  if (!next) return { outcome: "nothing_to_publish", message: "No eligible, cleared, unattempted item remains in this campaign." };

  const stepBase = { variantId: next.variantId, assetName: next.spec.asset_name };

  try {
    assertBoundProviderAccount("instagram", next.spec.expected_provider_account_id, account.provider_account_id as string);
  } catch (err) {
    if (err instanceof OAuthAccountMismatchError) {
      return { ...stepBase, outcome: "account_mismatch", message: `Tenant Instagram account ${err.actualAccountId} is not the campaign's bound account ${err.expectedAccountId}.` };
    }
    throw err;
  }

  const { data: settings } = await service
    .from("social_automation_settings")
    .select("shadow_mode")
    .eq("owner_id", account.owner_id as string)
    .maybeSingle();
  if (settings?.shadow_mode !== false) {
    return { ...stepBase, outcome: "shadow_mode", message: "Owner is in shadow mode; a publish would only be simulated." };
  }

  // The exact text the worker will publish: caption, then hashtags.
  const publishedCaption = [next.caption, next.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")].filter(Boolean).join("\n\n");
  const captionCheck = validateCaptionForPublish({
    platform: "instagram",
    caption: publishedCaption,
    contact: await deps.loadContact(input.tenantId),
    creativeText: next.spec.creative_text ?? null,
    cta: (next.spec.cta as StructuredCta | null | undefined) ?? null,
  });
  if (!captionCheck.ok) {
    const validatedAt = deps.now().toISOString();
    await service
      .from("content_variants")
      .update({
        creative_spec: { ...next.spec, caption_validation: { ok: false, issues: captionCheck.issues.map(({ code, evidence }) => ({ code, evidence })), validated_at: validatedAt } },
        updated_at: validatedAt,
      })
      .eq("id", next.variantId);
    const message = summarizeCaptionIssues(captionCheck.issues);
    await deps.audit({
      actorId: input.actorUserId,
      action: "social.campaign.validation_failed",
      summary: `${next.spec.asset_name} blocked before publishing: ${message}`.slice(0, 500),
      meta: { tenant_id: input.tenantId, campaign_id: input.campaignId, variant_id: next.variantId, codes: captionCheck.issues.map((i) => i.code) },
    });
    return { ...stepBase, outcome: "validation_failed", message };
  }

  const igUserId = account.provider_account_id as string;
  let accessToken: string;
  let limit: InstagramPublishingLimit;
  try {
    accessToken = await deps.getAccessToken({ id: account.id as string, platform: "instagram" });
    limit = await deps.fetchPublishingLimit(accessToken, igUserId);
  } catch (err) {
    return { ...stepBase, outcome: "failed", message: maskProviderError(err instanceof Error ? err.message : String(err)) ?? "Token or permission check failed" };
  }
  const quota = { usage: limit.quotaUsage, total: limit.quotaTotal };

  if (limit.quotaUsage >= limit.quotaTotal) {
    const blockedAt = deps.now().toISOString();
    const remaining = items.filter((item) => isPublishableCampaignItem(item.spec, item.job));
    for (const item of remaining) {
      await service
        .from("content_variants")
        .update({ creative_spec: { ...item.spec, platform_limit: { blocked_at: blockedAt, quota_usage: limit.quotaUsage, quota_total: limit.quotaTotal } }, updated_at: blockedAt })
        .eq("id", item.variantId);
    }
    await deps.audit({
      actorId: input.actorUserId,
      action: "social.campaign.platform_limit",
      summary: `Instagram publishing quota reached (${limit.quotaUsage}/${limit.quotaTotal}); ${remaining.length} campaign item(s) marked BLOCKED_BY_PLATFORM_LIMIT`,
      meta: { tenant_id: input.tenantId, campaign_id: input.campaignId, quota },
    });
    return { ...stepBase, outcome: "blocked_by_platform_limit", quota };
  }

  // The item is publishable only while it has no job, so a stale
  // platform_limit marker from an earlier window is cleared as it proceeds.
  const spec: InstagramCampaignItemSpec = {
    ...next.spec,
    platform_limit: null,
    caption_validation: { ok: true, issues: [], validated_at: deps.now().toISOString() },
  };

  const recent = await deps.listRecentMedia(accessToken, igUserId);
  const existing = recent.find((media) => typeof media.caption === "string" && media.caption.includes(spec.dedupe_marker));
  const idempotencyKey = `campaign:${input.campaignId}:${next.variantId}`;

  if (existing) {
    const verification = {
      verified: normalizeUsername(existing.username) === normalizeUsername(account.username as string),
      media_id: existing.id,
      timestamp: existing.timestamp ?? null,
      username: existing.username ?? null,
      permalink: existing.permalink ?? null,
      account_id: igUserId,
      verified_at: deps.now().toISOString(),
    };
    const { data: job, error } = await service
      .from("social_publishing_jobs")
      .insert({
        account_id: account.id,
        variant_id: next.variantId,
        idempotency_key: idempotencyKey,
        scheduled_at: deps.now().toISOString(),
        status: "PUBLISHED",
        max_attempts: 1,
        completed_at: deps.now().toISOString(),
        result: { mode: "live", external_post_id: existing.id, permalink: existing.permalink ?? null, deduplicated: true, provider_verification: verification },
      })
      .select("id")
      .single();
    if (error || !job) throw new Error(`Failed to record the existing Instagram post: ${error?.message ?? "no row"}`);
    await service.from("content_variants").update({ status: "PUBLISHED", published_at: existing.timestamp ?? deps.now().toISOString(), creative_spec: spec }).eq("id", next.variantId);
    await deps.audit({
      actorId: input.actorUserId,
      action: "social.campaign.already_published",
      summary: `${spec.asset_name} was already on Instagram (${existing.id}); recorded instead of publishing again`,
      targetId: job.id as string,
      meta: { tenant_id: input.tenantId, campaign_id: input.campaignId, media_id: existing.id },
    });
    return { ...stepBase, outcome: "already_published", jobId: job.id as string, mediaId: existing.id, permalink: existing.permalink, providerVerified: verification.verified, quota };
  }

  await service.from("content_variants").update({ creative_spec: spec, updated_at: deps.now().toISOString() }).eq("id", next.variantId);
  const { data: created, error: cErr } = await service
    .from("social_publishing_jobs")
    .insert({
      account_id: account.id,
      variant_id: next.variantId,
      idempotency_key: idempotencyKey,
      scheduled_at: deps.now().toISOString(),
      status: "SCHEDULED",
      // No automatic retry: a failure is recorded and only retried deliberately,
      // after the duplicate check above, so a lost response can't double-post.
      max_attempts: 1,
    })
    .select("id")
    .single();
  if (cErr || !created) throw new Error(`Failed to create the publishing job: ${cErr?.message ?? "no row"}`);
  const jobId = created.id as string;

  try {
    await deps.runJob(jobId);
  } catch (err) {
    return { ...stepBase, outcome: "failed", jobId, quota, message: maskProviderError(err instanceof Error ? err.message : String(err)) ?? "Publish run failed" };
  }

  const { data: after, error: rErr } = await service
    .from("social_publishing_jobs")
    .select("status, scheduled_at, completed_at, last_error, result")
    .eq("id", jobId)
    .single();
  if (rErr || !after) throw new Error(`Failed to reload the publishing job: ${rErr?.message ?? "no row"}`);
  const derived = deriveCampaignItemStatus(spec, after as CampaignJobFacts);

  if (derived.status !== "PUBLISHED" || !derived.mediaId) {
    await deps.audit({
      actorId: input.actorUserId,
      action: "social.campaign.publish_failed",
      summary: `${spec.asset_name} did not publish: ${derived.detail ?? derived.status}`,
      targetId: jobId,
      meta: { tenant_id: input.tenantId, campaign_id: input.campaignId, job_status: after.status },
    });
    return { ...stepBase, outcome: "failed", jobId, quota, message: derived.detail ?? `Job ended ${after.status}` };
  }

  let verification: Record<string, unknown>;
  try {
    const media = await deps.fetchMedia(accessToken, derived.mediaId);
    verification = {
      verified: media.id === derived.mediaId && normalizeUsername(media.username) === normalizeUsername(account.username as string),
      media_id: media.id,
      timestamp: media.timestamp ?? null,
      username: media.username ?? null,
      permalink: media.permalink ?? null,
      media_type: media.media_type ?? null,
      account_id: igUserId,
      verified_at: deps.now().toISOString(),
    };
  } catch (err) {
    verification = { verified: false, media_id: derived.mediaId, error: maskProviderError(err instanceof Error ? err.message : String(err)), account_id: igUserId, verified_at: deps.now().toISOString() };
  }

  const result = { ...((after.result as Record<string, unknown>) ?? {}), provider_verification: verification, permalink: verification.permalink ?? derived.permalink };
  await service.from("social_publishing_jobs").update({ result }).eq("id", jobId);
  await deps.audit({
    actorId: input.actorUserId,
    action: "social.campaign.published",
    summary: `${spec.asset_name} published to Instagram as ${derived.mediaId} (provider verified: ${verification.verified === true})`,
    targetId: jobId,
    meta: { tenant_id: input.tenantId, campaign_id: input.campaignId, media_id: derived.mediaId, provider_verified: verification.verified === true },
  });

  return {
    ...stepBase,
    outcome: "published",
    jobId,
    mediaId: derived.mediaId,
    permalink: (verification.permalink as string | null) ?? derived.permalink ?? undefined,
    providerVerified: verification.verified === true,
    quota: { usage: limit.quotaUsage + 1, total: limit.quotaTotal },
  };
}
