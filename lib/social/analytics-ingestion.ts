import { createSupabaseServiceClient } from "../supabase/service.ts";
import { getValidProviderAccessToken } from "./worker.ts";
import { recordMetrics, type MetricsRow } from "./repositories/analytics.ts";
import type { SocialProvider } from "./providers/index.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * STRATXCEL two-gap closure brief, Gap 1: real analytics ingestion.
 *
 * The real seam this plugs into already existed and was already fully
 * wired for publishing, just never for reading back: every SocialProvider
 * (lib/social/providers/*.ts) already has a real getInsights(accessToken,
 * externalPostId) method calling the real platform Graph/Data API --
 * facebook.ts, instagram.ts, youtube.ts and threads.ts genuinely implement
 * it against real endpoints; linkedin.ts and (after this brief's fix)
 * x.ts honestly return no metrics because the required API tier isn't
 * authorized for this integration. worker.ts already records the real
 * provider_post_id for every publish via recordMetrics(service,
 * job.variant_id, externalPostId, {}) -- with an empty metrics object,
 * because nothing ever called getInsights afterward. grep confirmed
 * .getInsights( has ZERO callers anywhere in this codebase before this
 * file. This module is that missing caller.
 *
 * Real, evidence-checked platform availability for the real StratXcel
 * tenant specifically (queried live against social_accounts.permissions,
 * not assumed from scope names):
 *  - facebook: CONNECTED, has pages_read_engagement -> genuinely authorized.
 *  - instagram: CONNECTED, has instagram_business_manage_insights ->
 *    genuinely authorized.
 *  - youtube: CONNECTED; getInsights calls videos.list?part=statistics
 *    (public video statistics), which youtube.readonly (the scope this
 *    tenant actually has) genuinely covers -- NOT the separate YouTube
 *    Analytics API that would need yt-analytics.readonly.
 *  - google_business: CONNECTED, but google-business.ts implements no
 *    getInsights method at all -- NOT_APPLICABLE, not a permission gap.
 *  - threads, linkedin, x: not connected for this tenant at all.
 */

export type AnalyticsUnavailableReason =
  | "NOT_APPLICABLE" // the provider implements no getInsights at all (google_business today)
  | "NOT_AUTHORIZED" // a known, permanent capability gap (linkedin/x's real API-tier limitation) or a live reauth-required token
  | "TEMPORARILY_UNAVAILABLE" // real capability + real scope, but this specific fetch returned nothing this run
  | "PROVIDER_ERROR"; // a genuine thrown/network error, even after one bounded retry

export interface AnalyticsIngestionUnavailable {
  variantId: string;
  platform: string;
  reason: AnalyticsUnavailableReason;
  detail: string;
}

export interface IngestSocialPerformanceResult {
  tenantId: string;
  /** Real published posts with a real (non-shadow) provider_post_id found in the lookback window. */
  attempted: number;
  /** Of those, how many produced at least one real, non-fabricated metric value and were persisted. */
  ingested: number;
  unavailable: AnalyticsIngestionUnavailable[];
}

/** Providers with no live-API path to organic post insights today, given this integration's actual granted API tier -- documented per-provider in each file, not guessed here. */
const KNOWN_NOT_AUTHORIZED_PLATFORMS = new Set(["linkedin", "x"]);

/**
 * Maps a real provider metric key to this table's normalized column.
 * Deliberately conservative: a key with no confident, honest mapping (e.g.
 * Facebook's post_engaged_users, which is "people who engaged" -- not
 * cleanly any single one of likes/comments/shares) is left unmapped and
 * only kept in `raw`, never forced into a column it doesn't truly mean.
 */
const METRIC_KEY_TO_COLUMN: Record<string, keyof Omit<MetricsRow, "id" | "variant_id" | "provider_post_id" | "measured_at" | "observation_date" | "raw">> = {
  post_impressions: "impressions",
  impressions: "impressions",
  reach: "reach",
  likes: "likes",
  likeCount: "likes",
  comments: "comments",
  commentCount: "comments",
  saved: "saves",
  shares: "shares",
  retweets: "shares",
  viewCount: "views",
  views: "views",
};

function mapInsightsToMetricsColumns(metrics: Record<string, number | string>): { mapped: Partial<MetricsRow>; hadAnyRealValue: boolean } {
  const mapped: Partial<MetricsRow> = {};
  let hadAnyRealValue = false;
  for (const [key, rawValue] of Object.entries(metrics)) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) continue;
    hadAnyRealValue = true;
    const column = METRIC_KEY_TO_COLUMN[key];
    if (column) mapped[column] = value;
  }
  return { mapped, hadAnyRealValue };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("analytics_ingestion_timeout")), ms)),
  ]);
}

interface EligiblePost {
  variantId: string;
  providerPostId: string;
  accountId: string;
  platform: string;
}

async function findEligiblePosts(service: ServiceClient, tenantId: string, lookbackDays: number): Promise<EligiblePost[]> {
  const { data: accounts } = await service
    .from("social_accounts")
    .select("id, platform")
    .eq("tenant_id", tenantId)
    .eq("status", "CONNECTED");
  const accountIds = (accounts ?? []).map((a) => a.id as string);
  if (accountIds.length === 0) return [];
  const platformByAccountId = new Map((accounts ?? []).map((a) => [a.id as string, a.platform as string]));

  const cutoffIso = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
  const { data: jobs } = await service
    .from("social_publishing_jobs")
    .select("account_id, variant_id, result, completed_at")
    .in("account_id", accountIds)
    .eq("status", "PUBLISHED")
    .gte("completed_at", cutoffIso)
    .order("completed_at", { ascending: false })
    .limit(200);

  const eligible: EligiblePost[] = [];
  for (const job of jobs ?? []) {
    const result = job.result as Record<string, unknown> | null;
    const providerPostId = typeof result?.external_post_id === "string" ? result.external_post_id : null;
    // SHADOW-<idempotency_key> is worker.ts's own synthetic id for a
    // non-live (shadow-mode) publish -- there is no real remote post to
    // fetch insights for, so it must never be treated as an eligible
    // real post (would otherwise call a real provider with a fake id).
    if (!providerPostId || providerPostId.startsWith("SHADOW-")) continue;
    const platform = platformByAccountId.get(job.account_id as string);
    if (!platform) continue;
    eligible.push({ variantId: job.variant_id as string, providerPostId, accountId: job.account_id as string, platform });
  }
  return eligible;
}

export interface AnalyticsIngestionDeps {
  /** Defaults to the real, exported worker.ts token resolver. Overridable so tests never need real Supabase vault decryption or a real provider registry -- see analytics-ingestion.test.ts. */
  resolveAccessToken?: (service: ServiceClient, account: { id: string; platform: string }) => Promise<{ accessToken: string; provider: SocialProvider }>;
}

/**
 * Real, idempotent, bounded, per-tenant analytics ingestion. Never
 * fabricates a metric: a provider that returns no real values for a real
 * post is recorded as UNAVAILABLE (with a real, specific reason), never as
 * a stored zero. One platform/post's failure never aborts the others --
 * every real post found is attempted independently.
 */
export async function ingestSocialPerformanceForTenant(
  service: ServiceClient,
  tenantId: string,
  options?: { lookbackDays?: number },
  deps?: AnalyticsIngestionDeps
): Promise<IngestSocialPerformanceResult> {
  const resolveAccessToken = deps?.resolveAccessToken ?? getValidProviderAccessToken;
  const lookbackDays = options?.lookbackDays ?? 30;

  const posts = await findEligiblePosts(service, tenantId, lookbackDays);
  const unavailable: AnalyticsIngestionUnavailable[] = [];
  let ingested = 0;

  for (const post of posts) {
    if (KNOWN_NOT_AUTHORIZED_PLATFORMS.has(post.platform)) {
      unavailable.push({ variantId: post.variantId, platform: post.platform, reason: "NOT_AUTHORIZED", detail: `${post.platform} organic post insights require an API tier this integration is not authorized for.` });
      continue;
    }

    let accessToken: string;
    let provider: SocialProvider;
    try {
      const resolved = await resolveAccessToken(service, { id: post.accountId, platform: post.platform });
      accessToken = resolved.accessToken;
      provider = resolved.provider;
    } catch (err) {
      unavailable.push({ variantId: post.variantId, platform: post.platform, reason: "NOT_AUTHORIZED", detail: `Could not resolve a valid access token: ${err instanceof Error ? err.message : "unknown error"}` });
      continue;
    }

    if (!provider.getInsights) {
      unavailable.push({ variantId: post.variantId, platform: post.platform, reason: "NOT_APPLICABLE", detail: `${post.platform} has no real insights capability implemented.` });
      continue;
    }

    // Bounded retry: one retry on a genuine thrown/network error only --
    // every real provider already converts a non-ok HTTP response into an
    // honest empty { metrics: {} } internally rather than throwing, so a
    // throw here means a real transport failure, not "the platform said
    // no data."
    let insights: { metrics: Record<string, number | string> } | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2 && !insights; attempt++) {
      try {
        insights = await withTimeout(provider.getInsights(accessToken, post.providerPostId), 8_000);
      } catch (err) {
        lastError = err;
      }
    }
    if (!insights) {
      unavailable.push({ variantId: post.variantId, platform: post.platform, reason: "PROVIDER_ERROR", detail: lastError instanceof Error ? lastError.message : "insights fetch failed after 1 retry" });
      continue;
    }

    const { mapped, hadAnyRealValue } = mapInsightsToMetricsColumns(insights.metrics);
    if (!hadAnyRealValue) {
      // A real, permissioned provider returned nothing for this specific
      // post this run -- could be a transient/permission edge case or a
      // brand-new post with no engagement data published by the platform
      // yet. Recorded honestly as UNAVAILABLE, never stored as a
      // fabricated zero (brief Section 5.5).
      unavailable.push({ variantId: post.variantId, platform: post.platform, reason: "TEMPORARILY_UNAVAILABLE", detail: `${post.platform} returned no metrics for this post on this ingestion run.` });
      continue;
    }

    await recordMetrics(service, post.variantId, post.providerPostId, { ...mapped, raw: insights.metrics as Record<string, unknown> });
    ingested += 1;
  }

  return { tenantId, attempted: posts.length, ingested, unavailable };
}
