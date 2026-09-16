import type {
  OAuthExchangeResult,
  PublishInput,
  PublishResult,
  InsightsResult,
  SocialProvider,
  ExchangeTokenOptions,
} from "./types.ts";
import { toMetaApiError } from "../errors.ts";

/**
 * Instagram Business API via Instagram Login (not the legacy Facebook Login
 * path) — matches the permissions already provisioned on the Meta app:
 * instagram_business_basic, instagram_business_content_publish,
 * instagram_business_manage_insights, instagram_business_manage_comments,
 * instagram_business_manage_messages.
 *
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */

const GRAPH_VERSION = "v21.0";
const IG_GRAPH = `https://graph.instagram.com`;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export interface InstagramMedia {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  username?: string;
  media_type?: string;
}

const MEDIA_FIELDS = "id,caption,permalink,timestamp,username,media_type";

/** Reads a media object back from Instagram -- the provider's own confirmation that a post exists. */
export async function fetchInstagramMedia(accessToken: string, mediaId: string): Promise<InstagramMedia> {
  const params = new URLSearchParams({ fields: MEDIA_FIELDS, access_token: accessToken });
  const res = await fetch(`${IG_GRAPH}/${GRAPH_VERSION}/${encodeURIComponent(mediaId)}?${params.toString()}`);
  if (!res.ok) throw await toMetaApiError(res, "Instagram media lookup");
  return (await res.json()) as InstagramMedia;
}

/** Most recent media on the account, newest first. Used to detect an already-published post before publishing again. */
export async function listRecentInstagramMedia(accessToken: string, igUserId: string, limit = 50): Promise<InstagramMedia[]> {
  const params = new URLSearchParams({ fields: MEDIA_FIELDS, limit: String(limit), access_token: accessToken });
  const res = await fetch(`${IG_GRAPH}/${GRAPH_VERSION}/${encodeURIComponent(igUserId)}/media?${params.toString()}`);
  if (!res.ok) throw await toMetaApiError(res, "Instagram recent media");
  const body = (await res.json()) as { data?: InstagramMedia[] };
  return body.data ?? [];
}

export interface InstagramPublishingLimit {
  quotaUsage: number;
  quotaTotal: number;
  quotaDurationSeconds: number | null;
}

/**
 * The account's real API publishing quota for the current rolling window.
 * Requires instagram_business_content_publish, so a successful read is also
 * live proof that the stored token carries the publishing permission.
 */
export async function fetchInstagramPublishingLimit(accessToken: string, igUserId: string): Promise<InstagramPublishingLimit> {
  const params = new URLSearchParams({ fields: "config,quota_usage", access_token: accessToken });
  const res = await fetch(`${IG_GRAPH}/${GRAPH_VERSION}/${encodeURIComponent(igUserId)}/content_publishing_limit?${params.toString()}`);
  if (!res.ok) throw await toMetaApiError(res, "Instagram publishing limit");
  const body = (await res.json()) as { data?: Array<{ quota_usage?: number; config?: { quota_total?: number; quota_duration?: number } }> };
  // The endpoint returns a single-element array describing this one account.
  const window = body.data?.[0];
  if (typeof window?.quota_usage !== "number" || typeof window.config?.quota_total !== "number") {
    throw new Error("Instagram publishing limit response did not include quota fields");
  }
  return {
    quotaUsage: window.quota_usage,
    quotaTotal: window.config.quota_total,
    quotaDurationSeconds: window.config.quota_duration ?? null,
  };
}

export const instagramProvider: SocialProvider = {
  name: "instagram",
  requiredScopes: [
    "instagram_business_basic",
    "instagram_business_content_publish",
    "instagram_business_manage_insights",
    "instagram_business_manage_comments",
    "instagram_business_manage_messages",
  ],

  getAuthorizationUrl(state, redirectUri) {
    const clientId = requireEnv("META_INSTAGRAM_APP_ID");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: instagramProvider.requiredScopes.join(","),
      state,
    });
    return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
  },

  async exchangeCodeForToken(code, redirectUri): Promise<OAuthExchangeResult> {
    const clientId = requireEnv("META_INSTAGRAM_APP_ID");
    const clientSecret = requireEnv("META_INSTAGRAM_APP_SECRET");

    // Step 1: short-lived token
    const shortLivedRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });
    if (!shortLivedRes.ok) {
      throw new Error(`Instagram token exchange failed: ${shortLivedRes.status}`);
    }
    const shortLived = (await shortLivedRes.json()) as {
      access_token: string;
      user_id: string;
    };

    // Step 2: exchange for a long-lived token (~60 days)
    const longLivedParams = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: clientSecret,
      access_token: shortLived.access_token,
    });
    const longLivedRes = await fetch(`${IG_GRAPH}/access_token?${longLivedParams.toString()}`);
    if (!longLivedRes.ok) {
      throw new Error(`Instagram long-lived token exchange failed: ${longLivedRes.status}`);
    }
    const longLived = (await longLivedRes.json()) as {
      access_token: string;
      expires_in: number;
    };

    // Step 3: profile info
    const profileRes = await fetch(
      `${IG_GRAPH}/me?fields=user_id,username,profile_picture_url,name&access_token=${longLived.access_token}`
    );
    const profile = profileRes.ok
      ? ((await profileRes.json()) as {
          user_id?: string;
          username?: string;
          profile_picture_url?: string;
          name?: string;
        })
      : {};

    return {
      accessToken: longLived.access_token,
      expiresInSeconds: longLived.expires_in,
      externalAccountId: profile.user_id ?? shortLived.user_id,
      displayName: profile.name,
      username: profile.username,
      profilePictureUrl: profile.profile_picture_url,
      scopes: instagramProvider.requiredScopes,
    };
  },

  async refreshAccessToken(refreshToken) {
    // Instagram long-lived tokens are refreshed with themselves, not a
    // separate refresh_token — "refreshToken" here is the current long-lived token.
    const params = new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: refreshToken,
    });
    const res = await fetch(`${IG_GRAPH}/refresh_access_token?${params.toString()}`);
    if (!res.ok) throw new Error(`Instagram token refresh failed: ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
  },

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, externalAccountId, caption, mediaUrls } = input;
    if (mediaUrls.length === 0) {
      throw new Error("Instagram publish requires at least one media URL");
    }

    // 1. Create media container
    const createParams = new URLSearchParams({
      image_url: mediaUrls[0],
      caption,
      access_token: accessToken,
    });
    const createRes = await fetch(
      `${IG_GRAPH}/${GRAPH_VERSION}/${externalAccountId}/media`,
      { method: "POST", body: createParams }
    );
    if (!createRes.ok) {
      throw await toMetaApiError(createRes, "Instagram container creation");
    }
    const { id: containerId } = (await createRes.json()) as { id: string };

    // 2. Poll container status until FINISHED (bounded)
    for (let attempt = 0; attempt < 10; attempt++) {
      const statusRes = await fetch(
        `${IG_GRAPH}/${containerId}?fields=status_code&access_token=${accessToken}`
      );
      const status = (await statusRes.json()) as { status_code?: string };
      if (status.status_code === "FINISHED") break;
      if (status.status_code === "ERROR") {
        throw new Error("Instagram media container failed to process");
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    // 3. Publish container
    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    });
    const publishRes = await fetch(
      `${IG_GRAPH}/${GRAPH_VERSION}/${externalAccountId}/media_publish`,
      { method: "POST", body: publishParams }
    );
    if (!publishRes.ok) {
      throw await toMetaApiError(publishRes, "Instagram publish");
    }
    const publishData = (await publishRes.json()) as { id: string };

    // Read the post back so the recorded result is the provider's own
    // confirmation, not just media_publish's return value. A failed read must
    // not fail the job: the post is already live, and a retry would duplicate it.
    const verification = await fetchInstagramMedia(accessToken, publishData.id).catch(() => null);

    return {
      externalPostId: publishData.id,
      permalink: verification?.permalink,
      raw: { ...publishData, mediaContainerId: containerId, verification },
    };
  },

  async getInsights(accessToken, externalPostId): Promise<InsightsResult> {
    const fields = "impressions,reach,likes,comments,saved";
    const res = await fetch(
      `${IG_GRAPH}/${externalPostId}/insights?metric=${fields}&access_token=${accessToken}`
    );
    if (!res.ok) return { metrics: {} };
    const data = (await res.json()) as { data?: { name: string; values: { value: number }[] }[] };
    const metrics: Record<string, number> = {};
    for (const m of data.data ?? []) {
      metrics[m.name] = m.values?.[0]?.value ?? 0;
    }
    return { metrics };
  },
};
