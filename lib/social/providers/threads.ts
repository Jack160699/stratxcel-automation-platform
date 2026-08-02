import type {
  OAuthExchangeResult,
  PublishInput,
  PublishResult,
  InsightsResult,
  SocialProvider,
} from "./types";
import { toMetaApiError } from "../errors";

/**
 * Threads API — a distinct identity/token/publish path from Instagram and
 * Facebook, even though it's a Meta product. Permissions prepared:
 * threads_basic, threads_content_publish.
 *
 * Docs: https://developers.facebook.com/docs/threads
 */

const THREADS_GRAPH = "https://graph.threads.net";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export const threadsProvider: SocialProvider = {
  name: "threads",
  requiredScopes: ["threads_basic", "threads_content_publish"],

  getAuthorizationUrl(state, redirectUri) {
    const clientId = requireEnv("META_THREADS_APP_ID");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: threadsProvider.requiredScopes.join(","),
      state,
    });
    return `https://threads.net/oauth/authorize?${params.toString()}`;
  },

  async exchangeCodeForToken(code, redirectUri): Promise<OAuthExchangeResult> {
    const clientId = requireEnv("META_THREADS_APP_ID");
    const clientSecret = requireEnv("META_THREADS_APP_SECRET");

    const shortLivedRes = await fetch(`${THREADS_GRAPH}/oauth/access_token`, {
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
    if (!shortLivedRes.ok) throw new Error(`Threads token exchange failed: ${shortLivedRes.status}`);
    const shortLived = (await shortLivedRes.json()) as { access_token: string; user_id: string };

    const longLivedRes = await fetch(
      `${THREADS_GRAPH}/access_token?` +
        new URLSearchParams({
          grant_type: "th_exchange_token",
          client_secret: clientSecret,
          access_token: shortLived.access_token,
        }).toString()
    );
    const longLived = longLivedRes.ok
      ? ((await longLivedRes.json()) as { access_token: string; expires_in: number })
      : { access_token: shortLived.access_token, expires_in: undefined as unknown as number };

    const profileRes = await fetch(
      `${THREADS_GRAPH}/me?fields=id,username,threads_profile_picture_url,name&access_token=${longLived.access_token}`
    );
    const profile = profileRes.ok
      ? ((await profileRes.json()) as {
          id?: string;
          username?: string;
          threads_profile_picture_url?: string;
          name?: string;
        })
      : {};

    return {
      accessToken: longLived.access_token,
      expiresInSeconds: longLived.expires_in,
      externalAccountId: profile.id ?? shortLived.user_id,
      displayName: profile.name,
      username: profile.username,
      profilePictureUrl: profile.threads_profile_picture_url,
      scopes: threadsProvider.requiredScopes,
    };
  },

  async refreshAccessToken(refreshToken) {
    const params = new URLSearchParams({
      grant_type: "th_refresh_token",
      access_token: refreshToken,
    });
    const res = await fetch(`${THREADS_GRAPH}/refresh_access_token?${params.toString()}`);
    if (!res.ok) throw new Error(`Threads token refresh failed: ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
  },

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, externalAccountId, caption, mediaUrls } = input;

    const createParams = new URLSearchParams({
      access_token: accessToken,
      text: caption,
      media_type: mediaUrls.length > 0 ? "IMAGE" : "TEXT",
    });
    if (mediaUrls.length > 0) createParams.set("image_url", mediaUrls[0]);

    const createRes = await fetch(`${THREADS_GRAPH}/${externalAccountId}/threads`, {
      method: "POST",
      body: createParams,
    });
    if (!createRes.ok) {
      throw await toMetaApiError(createRes, "Threads container creation");
    }
    const { id: containerId } = (await createRes.json()) as { id: string };

    // brief settle delay before publish, per Threads API guidance
    await new Promise((r) => setTimeout(r, 3000));

    const publishRes = await fetch(
      `${THREADS_GRAPH}/${externalAccountId}/threads_publish`,
      {
        method: "POST",
        body: new URLSearchParams({ creation_id: containerId, access_token: accessToken }),
      }
    );
    if (!publishRes.ok) {
      throw await toMetaApiError(publishRes, "Threads publish");
    }
    const data = (await publishRes.json()) as { id: string };
    return { externalPostId: data.id, raw: data };
  },

  async getInsights(accessToken, externalPostId): Promise<InsightsResult> {
    const res = await fetch(
      `${THREADS_GRAPH}/${externalPostId}/insights?metric=views,likes,replies&access_token=${accessToken}`
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
