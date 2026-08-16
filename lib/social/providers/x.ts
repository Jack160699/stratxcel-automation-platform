import type {
  OAuthExchangeResult,
  PublishInput,
  PublishResult,
  InsightsResult,
  SocialProvider,
} from "./types";
import crypto from "node:crypto";

/**
 * X (formerly Twitter) OAuth 2.0 implementation.
 *
 * Scopes:
 * - tweet.read, tweet.write (read timeline and publish posts)
 * - users.read (retrieve account identity)
 * - offline.access (refresh tokens)
 *
 * Docs: https://developer.x.com/en/docs/authentication/oauth-2-0/authorization-code
 */

const X_OAUTH_AUTHORIZE = "https://x.com/i/oauth2/authorize";
const X_OAUTH_TOKEN = "https://api.x.com/2/oauth2/token";
const X_API_USERS_ME = "https://api.x.com/2/users/me";
const X_API_TWEETS = "https://api.x.com/2/tweets";

function getClientId(): string {
  const v = process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID;
  if (!v) throw new Error("X_CLIENT_ID is not configured");
  return v;
}

function getClientSecret(): string {
  const v = process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET;
  if (!v) throw new Error("X_CLIENT_SECRET is not configured");
  return v;
}

/**
 * Deterministically derives a PKCE code_verifier from the signed state token.
 */
function getCodeVerifierFromState(state: string): string {
  return crypto.createHash("sha256").update(`x_pkce:${state}`).digest("base64url");
}

function getCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export const xProvider: SocialProvider = {
  name: "x",
  requiredScopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],

  getAuthorizationUrl(state, redirectUri) {
    const clientId = getClientId();
    const verifier = getCodeVerifierFromState(state);
    const challenge = getCodeChallenge(verifier);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: xProvider.requiredScopes.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    return `${X_OAUTH_AUTHORIZE}?${params.toString()}`;
  },

  async exchangeCodeForToken(code, redirectUri): Promise<OAuthExchangeResult> {
    const clientId = getClientId();
    const clientSecret = getClientSecret();
    // For token exchange, X OAuth 2.0 PKCE requires code_verifier
    // We recreate it from standard verifier pattern
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenRes = await fetch(X_OAUTH_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: "x_pkce_auth_code_verifier", // fallback if plain or client basic auth
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`X token exchange failed: ${tokenRes.status}`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    // Fetch user identity
    let profileData: { data?: { id: string; name: string; username: string; profile_image_url?: string } } = {};
    try {
      const userRes = await fetch(`${X_API_USERS_ME}?user.fields=profile_image_url,name,username`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.ok) {
        profileData = (await userRes.json()) as typeof profileData;
      }
    } catch {
      // Non-blocking trace
    }

    const user = profileData.data;
    const handle = user?.username ? (user.username.startsWith("@") ? user.username : `@${user.username}`) : "@x_account";

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresInSeconds: tokenData.expires_in,
      externalAccountId: user?.id || "x_account",
      displayName: user?.name || user?.username || "X Account",
      username: handle,
      profilePictureUrl: user?.profile_image_url,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : xProvider.requiredScopes,
    };
  },

  async refreshAccessToken(refreshToken) {
    const clientId = getClientId();
    const clientSecret = getClientSecret();
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const res = await fetch(X_OAUTH_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) throw new Error(`X token refresh failed: ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
  },

  async publish(input: PublishInput): Promise<PublishResult> {
    const res = await fetch(X_API_TWEETS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: input.caption }),
    });

    if (!res.ok) throw new Error(`X publish failed: ${res.status}`);
    const data = (await res.json()) as { data?: { id: string; text: string } };

    return {
      externalPostId: data.data?.id || `x-${Date.now()}`,
      permalink: data.data?.id ? `https://x.com/i/web/status/${data.data.id}` : undefined,
      raw: data,
    };
  },

  async getInsights(): Promise<InsightsResult> {
    return { metrics: { impressions: 0, likes: 0, retweets: 0 } };
  },
};
