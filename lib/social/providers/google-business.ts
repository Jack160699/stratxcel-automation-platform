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

/**
 * Classifies whether a stored `provider_account_id` for a Google Business
 * connection is a real, resolved location resource name
 * ("accounts/{id}/locations/{id}", the only shape the Business Information
 * and Local Posts APIs accept) or the OAuth-time fallback this file's own
 * exchangeCodeForToken() stores when GBP account/location discovery finds
 * nothing accessible for that identity (the bare Google account
 * id/`profileData.id`, or a bare account resource name with no location
 * segment).
 *
 * Found live against the real StratXcel tenant
 * (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 10): its stored
 * google_business provider_account_id is a bare 21-digit id with no
 * "accounts/" prefix — exactly this fallback shape — while status/
 * token_health still read CONNECTED/HEALTHY (OAuth genuinely succeeded;
 * only account/location discovery didn't). Every live read or write built
 * against provider_account_id assuming it is always a resolved resource
 * name (e.g. audit-connector-insights.ts's gatherGoogleBusiness, and
 * publish() above) would silently call an invalid resource path for a
 * connection in this state and surface a generic, unexplained error. This
 * function makes the distinction checkable and testable instead of
 * silently indistinguishable from a healthy connection.
 */
export function isResolvedGbpLocationResourceName(id: string): boolean {
  return /^accounts\/[^/]+\/locations\/[^/]+$/.test(id);
}

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

export interface GoogleBusinessRawReview {
  reviewId: string; // the resource name, e.g. accounts/1/locations/2/reviews/3
  reviewerName: string;
  starRating: number; // 1-5
  comment: string;
  createTime: string;
  hasExistingReply: boolean;
}

/**
 * Real, live Reviews.list call — same v4 Business API family this file's
 * own publish() already uses for Local Posts (Google never split reviews
 * out to a newer API the way it did Business Information/Account
 * Management). GET only; makes no mutation. `locationName` must already be
 * a resolved "accounts/{id}/locations/{id}" resource — call
 * isResolvedGbpLocationResourceName() before this, same guard
 * audit-connector-insights.ts's gatherGoogleBusiness already applies.
 */
export async function listLocationReviews(accessToken: string, locationName: string): Promise<GoogleBusinessRawReview[]> {
  const reviews: GoogleBusinessRawReview[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${locationName}/reviews`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        // ignore
      }
      throw new Error(`Google Business reviews list failed (${res.status}): ${detail || "no error body"}`);
    }
    const body = (await res.json()) as {
      reviews?: Array<{
        reviewId?: string;
        name?: string;
        reviewer?: { displayName?: string };
        starRating?: string; // Google returns an enum string: ONE..FIVE
        comment?: string;
        createTime?: string;
        reviewReply?: { comment?: string };
      }>;
      nextPageToken?: string;
    };
    const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    for (const r of body.reviews ?? []) {
      if (!r.name) continue; // no resource name means no usable reply target — skip rather than fabricate one
      reviews.push({
        reviewId: r.name,
        reviewerName: r.reviewer?.displayName || "Customer",
        starRating: r.starRating ? (STAR_MAP[r.starRating] ?? 0) : 0,
        comment: r.comment || "",
        createTime: r.createTime || "",
        hasExistingReply: Boolean(r.reviewReply?.comment),
      });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return reviews;
}

/**
 * Real, live Reviews.updateReply call. Throws a real, honest error on any
 * non-ok response — never fabricates a successful reply the way publish()
 * used to before it was fixed (see google-business-publish-honesty.test.ts).
 * `reviewName` is the resource name returned by listLocationReviews above,
 * e.g. "accounts/1/locations/2/reviews/3".
 */
export async function replyToLocationReview(accessToken: string, reviewName: string, comment: string): Promise<void> {
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`Google Business review reply failed (${res.status}): ${detail || "no error body"}`);
  }
}
