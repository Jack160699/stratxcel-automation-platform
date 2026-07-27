import type {
  OAuthExchangeResult,
  PublishInput,
  PublishResult,
  InsightsResult,
  SocialProvider,
} from "./types";

/**
 * Facebook Page publishing via standard Facebook Login.
 * Permissions already prepared on the Meta app: pages_show_list,
 * pages_read_engagement, pages_manage_posts.
 *
 * A user access token alone cannot post to a Page — after login we fetch
 * /me/accounts to get the Page-scoped access token, and that Page token is
 * what gets encrypted and stored (externalAccountId = the Page ID).
 */

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export const facebookProvider: SocialProvider = {
  name: "facebook",
  requiredScopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],

  getAuthorizationUrl(state, redirectUri) {
    const clientId = requireEnv("META_APP_ID");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: facebookProvider.requiredScopes.join(","),
      state,
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  },

  async exchangeCodeForToken(code, redirectUri): Promise<OAuthExchangeResult> {
    const clientId = requireEnv("META_APP_ID");
    const clientSecret = requireEnv("META_APP_SECRET");

    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        }).toString()
    );
    if (!tokenRes.ok) throw new Error(`Facebook token exchange failed: ${tokenRes.status}`);
    const userToken = (await tokenRes.json()) as { access_token: string; expires_in?: number };

    // Exchange for a long-lived user token
    const longLivedRes = await fetch(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: clientId,
          client_secret: clientSecret,
          fb_exchange_token: userToken.access_token,
        }).toString()
    );
    const longLived = longLivedRes.ok
      ? ((await longLivedRes.json()) as { access_token: string; expires_in?: number })
      : userToken;

    // Fetch the first managed Page + its Page access token (long-lived Page
    // tokens derived from a long-lived user token do not expire).
    const pagesRes = await fetch(
      `${GRAPH}/me/accounts?access_token=${longLived.access_token}`
    );
    if (!pagesRes.ok) throw new Error(`Facebook Page discovery failed: ${pagesRes.status}`);
    const pages = (await pagesRes.json()) as {
      data: { id: string; name: string; access_token: string; picture?: { data?: { url?: string } } }[];
    };
    const page = pages.data?.[0];
    if (!page) throw new Error("No Facebook Pages available for this account");

    return {
      accessToken: page.access_token,
      externalAccountId: page.id,
      displayName: page.name,
      scopes: facebookProvider.requiredScopes,
    };
  },

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, externalAccountId, caption, mediaUrls } = input;

    const endpoint = mediaUrls.length > 0 ? "photos" : "feed";
    const params = new URLSearchParams({ access_token: accessToken });
    if (mediaUrls.length > 0) {
      params.set("url", mediaUrls[0]);
      params.set("caption", caption);
    } else {
      params.set("message", caption);
    }

    const res = await fetch(`${GRAPH}/${externalAccountId}/${endpoint}`, {
      method: "POST",
      body: params,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Facebook publish failed: ${res.status} ${body}`);
    }
    const data = (await res.json()) as { id?: string; post_id?: string };
    const externalPostId = data.post_id ?? data.id ?? "unknown";
    return { externalPostId, raw: data };
  },

  async getInsights(accessToken, externalPostId): Promise<InsightsResult> {
    const res = await fetch(
      `${GRAPH}/${externalPostId}/insights?metric=post_impressions,post_engaged_users&access_token=${accessToken}`
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
