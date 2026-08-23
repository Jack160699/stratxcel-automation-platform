import type {
  OAuthExchangeResult,
  PublishInput,
  PublishResult,
  SocialProvider,
  ExchangeTokenOptions,
} from "./types.ts";

/**
 * Google Business Profile API provider.
 *
 * Scopes:
 * - https://www.googleapis.com/auth/business.manage (manage business profile, reviews, posts)
 * - openid, profile, email (account identity)
 *
 * Docs: https://developers.google.com/my-business/content/basic-setup
 */

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

function getClientId(): string {
  const id =
    process.env.GOOGLE_BUSINESS_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!id) throw new Error("Google Business OAuth Client ID is not configured");
  return id;
}

function getClientSecret(): string {
  const secret =
    process.env.GOOGLE_BUSINESS_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET;
  if (!secret) throw new Error("Google Business OAuth Client Secret is not configured");
  return secret;
}

export const googleBusinessProvider: SocialProvider = {
  name: "google_business",
  requiredScopes: [
    "https://www.googleapis.com/auth/business.manage",
    "openid",
    "email",
    "profile",
  ],

  getAuthorizationUrl(state, redirectUri) {
    const clientId = getClientId();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: googleBusinessProvider.requiredScopes.join(" "),
      access_type: "offline",
      prompt: "select_account",
      state,
    });
    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
  },

  async exchangeCodeForToken(code, redirectUri, _options?: ExchangeTokenOptions): Promise<OAuthExchangeResult> {
    const clientId = getClientId();
    const clientSecret = getClientSecret();

    const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
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

    if (!tokenRes.ok) {
      let errBody = "";
      try {
        errBody = await tokenRes.text();
      } catch {
        // ignore
      }
      throw new Error(`Google Business token exchange failed (${tokenRes.status}): ${errBody || "Invalid grant or client"}`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    // Retrieve verified user identity
    let profileData: { id?: string; name?: string; email?: string; picture?: string } = {};
    try {
      const userinfoRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userinfoRes.ok) {
        profileData = (await userinfoRes.json()) as typeof profileData;
      }
    } catch {
      // Non-blocking fallback
    }

    // Discover accessible Google Business Profile accounts and locations.
    // Found live during E2E testing: every catch/non-ok branch here used to
    // discard the real reason silently, so a connection that fell all the
    // way back to the bare userinfo id as externalAccountId (unusable for
    // any later Posts/Reviews/profile call, which all need a real
    // accounts/{id}/locations/{id} resource name) left zero trace of why --
    // no GBP account for this identity, a scope problem, or an API-access
    // gap all looked identical afterward. Same principle already applied to
    // resolveAccessToken's error handling elsewhere in this codebase — log
    // the real (non-secret) failure reason instead of swallowing it.
    let locationDisplayName = profileData.name || profileData.email || "Google Business Profile";
    let locationExternalId = profileData.id || profileData.email || "google_business_account";
    let gbpAccountFound = false;
    let gbpLocationFound = false;

    try {
      const gbpAccountsRes = await fetch(
        "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );
      if (gbpAccountsRes.ok) {
        const gbpData = (await gbpAccountsRes.json()) as {
          accounts?: Array<{ name?: string; accountName?: string; type?: string; verificationState?: string }>;
        };
        const accounts = gbpData.accounts || [];
        if (accounts.length > 0) {
          gbpAccountFound = true;
          const account = accounts[0];
          if (account.accountName) locationDisplayName = account.accountName;
          if (account.name) {
            locationExternalId = account.name;
            try {
              const locationsRes = await fetch(
                `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress,websiteUri`,
                { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
              );
              if (locationsRes.ok) {
                const locData = (await locationsRes.json()) as {
                  locations?: Array<{ name?: string; title?: string }>;
                };
                if (locData.locations && locData.locations.length > 0) {
                  gbpLocationFound = true;
                  const loc = locData.locations[0];
                  if (loc.title) locationDisplayName = loc.title;
                  if (loc.name) locationExternalId = loc.name;
                } else {
                  console.warn("google-business OAuth: account has zero locations, falling back to the bare account id", { account: account.name });
                }
              } else {
                console.warn("google-business OAuth: location discovery failed, falling back to the bare account id", {
                  account: account.name,
                  status: locationsRes.status,
                  body: (await locationsRes.text().catch(() => "")).slice(0, 500),
                });
              }
            } catch (locErr) {
              console.warn("google-business OAuth: location discovery threw, falling back to the bare account id", {
                account: account.name,
                error: locErr instanceof Error ? locErr.message : String(locErr),
              });
            }
          }
        } else {
          console.warn("google-business OAuth: zero Business Profile accounts accessible for this identity — falling back to the bare userinfo id, which cannot be used for Posts/Reviews/profile calls", {
            username: profileData.email,
          });
        }
      } else {
        console.warn("google-business OAuth: account discovery failed, falling back to the bare userinfo id", {
          status: gbpAccountsRes.status,
          body: (await gbpAccountsRes.text().catch(() => "")).slice(0, 500),
        });
      }
    } catch (acctErr) {
      console.warn("google-business OAuth: account discovery threw, falling back to the bare userinfo id", {
        error: acctErr instanceof Error ? acctErr.message : String(acctErr),
      });
    }

    const grantedScopes = tokenData.scope ? tokenData.scope.split(" ") : googleBusinessProvider.requiredScopes;

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresInSeconds: tokenData.expires_in,
      externalAccountId: locationExternalId,
      displayName: locationDisplayName,
      username: profileData.email || profileData.name,
      profilePictureUrl: profileData.picture,
      scopes: grantedScopes,
    };
  },

  async refreshAccessToken(refreshToken) {
    const clientId = getClientId();
    const clientSecret = getClientSecret();

    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
  },

  // Real Local Posts call — found live during E2E testing that this used to
  // return a fabricated externalPostId and a non-specific permalink without
  // ever contacting Google at all, so every "published" Google Post was a
  // fabricated success (Section 27/31: never claim publication without
  // provider success). Google gates this endpoint behind a separate manual
  // access-approval form independent of OAuth consent (a verified,
  // 60+ day-active profile is the minimum eligibility bar), so a real,
  // honest failure here is the expected outcome for most tenants right now
  // — that's a provider/access gap this call must surface accurately, not
  // paper over with a fake success.
  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, externalAccountId, caption, mediaUrls } = input;
    const res = await fetch(`https://mybusiness.googleapis.com/v4/${externalAccountId}/localPosts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        languageCode: "en-US",
        summary: caption,
        topicType: "STANDARD",
        ...(mediaUrls.length > 0 ? { media: mediaUrls.map((sourceUrl) => ({ mediaFormat: "PHOTO", sourceUrl })) } : {}),
      }),
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        // ignore
      }
      throw new Error(`Google Business post publish failed (${res.status}): ${detail || "no error body"}`);
    }
    const post = (await res.json()) as { name?: string; searchUrl?: string };
    if (!post.name) throw new Error("Google Business post publish returned no post name — cannot confirm success");
    return {
      externalPostId: post.name,
      permalink: post.searchUrl,
      raw: post,
    };
  },

  // No getInsights implementation: Business Profile doesn't expose per-post
  // metrics the same shape every other provider here does, and this was
  // never actually called anywhere in the codebase (verified — dead code),
  // so a fabricated { views: 0, searches: 0, actions: 0 } stub was pure
  // downside with no real caller to serve. Omitting the optional method
  // entirely is the honest state: "not available", not a fake zero.
};
