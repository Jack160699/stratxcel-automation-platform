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
export interface GbpAccount {
  name: string; // e.g. "accounts/1234567890"
  accountName: string; // e.g. "My Business Account"
  type?: "PERSONAL" | "LOCATION_GROUP" | "USER_GROUP" | "ORGANIZATION" | string;
  role?: "PRIMARY_OWNER" | "OWNER" | "MANAGER" | "SITE_MANAGER" | string;
  verificationState?: "VERIFIED" | "UNVERIFIED" | "VETTED_PARTNER" | string;
}

export interface GbpLocation {
  name: string; // e.g. "locations/987654321" or "accounts/1234567890/locations/987654321"
  title: string; // business title, e.g. "StratXcel"
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
  websiteUri?: string;
  categories?: {
    primaryCategory?: { name?: string; displayName?: string };
    additionalCategories?: Array<{ name?: string; displayName?: string }>;
  };
  phoneNumbers?: {
    primaryPhone?: string;
    additionalPhones?: string[];
  };
  metadata?: {
    mapsUri?: string;
    placeId?: string;
    hasVoiceOfMerchant?: boolean;
    canDelete?: boolean;
    duplicateLocation?: boolean;
  };
  profile?: {
    description?: string;
  };
  accountName?: string; // parent account name, e.g. "accounts/1234567890"
  accountRole?: string; // role in account, e.g. "OWNER" | "MANAGER"
  permissionLevel?: "OWNER_ACCESS" | "MANAGER_ACCESS" | "READ_ONLY";
}

/**
 * Normalizes location resource names to canonical format.
 * v4 APIs (Reviews, Local Posts) require `accounts/{accountId}/locations/{locationId}`.
 * v1 Business Information API accepts both `accounts/{accountId}/locations/{locationId}` and `locations/{locationId}`.
 */
export function getCanonicalGbpLocationResourceName(accountName?: string, locationName?: string): string {
  if (!locationName) return "";
  if (locationName.startsWith("accounts/")) return locationName;
  if (accountName && accountName.startsWith("accounts/")) {
    return `${accountName}/${locationName.replace(/^\/+/, "")}`;
  }
  return locationName;
}

/**
 * Classifies whether a stored `provider_account_id` for a Google Business
 * connection is a real, resolved location resource name
 * ("accounts/{id}/locations/{id}" or "locations/{id}").
 * Rejects bare numeric user IDs (e.g. 21-digit Google account ID), bare accounts without locations, or empty strings.
 */
export function isResolvedGbpLocationResourceName(id: string): boolean {
  if (!id) return false;
  return /^(accounts\/[^/]+\/)?locations\/[^/]+$/.test(id);
}

/**
 * Google's real Account resource has an output-only `verificationState`
 * field (real values, live-verified against Google's own current docs
 * fetched during this fix, not recalled: VERIFICATION_STATE_UNSPECIFIED,
 * VERIFIED, UNVERIFIED, VERIFICATION_REQUESTED -- "VETTED_PARTNER" in this
 * file's own GbpAccount type above is a separate, distinct field on the
 * real Account resource, `vettedState`, not a real verificationState value;
 * left as-is there since it's only a loose `| string` type hint, but never
 * treated as a real verification value here). Normalizes Google's raw enum
 * (or a genuinely unknown/missing value) into the small, honest set this
 * codebase actually acts on -- never invents "VERIFIED" from an absent or
 * unrecognized value. STRATXCEL — GOOGLE BUSINESS AUTONOMOUS SETUP brief,
 * Section 9: "Do NOT call an unverified profile CONNECTED_AND_VERIFIED."
 */
export type NormalizedGoogleVerificationState = "VERIFIED" | "UNVERIFIED" | "PENDING" | "UNKNOWN";

export function normalizeGoogleVerificationState(raw: unknown): NormalizedGoogleVerificationState {
  if (raw === "VERIFIED") return "VERIFIED";
  if (raw === "UNVERIFIED") return "UNVERIFIED";
  if (raw === "VERIFICATION_REQUESTED") return "PENDING";
  // VERIFICATION_STATE_UNSPECIFIED, missing, or any value this codebase
  // doesn't recognize yet -- honestly unknown, never assumed verified.
  return "UNKNOWN";
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

/**
 * Discovers all accessible Google Business Profile accounts for an access token.
 */
/**
 * Real, safe (never a secret) forensic evidence from the FIRST accounts.list
 * page -- the one call every later discovery step depends on. Root-caused
 * live (STRATXCEL — GOOGLE BUSINESS DISCOVERY CONTRADICTION brief): a real,
 * screenshot-proven, customer-managed Business Profile still produced
 * `accounts: []` from this exact endpoint for the exact right, verified-
 * matching Google identity -- "zero accounts" was being treated as proof a
 * profile doesn't exist, when a genuinely healthy 200 OK with zero accounts
 * is also the documented behavior of an OAuth client Google has not yet
 * granted Business Profile API access to (live-verified against Google's
 * own current docs: "The Google My Business API is only visible... to
 * users who submit and receive approval... through the access request
 * form" -- developers.google.com/my-business/content/prereqs/basic-setup).
 * Persisting the real status/error envelope turns "zero accounts" from an
 * assumption into evidence a human can actually act on.
 */
export interface GbpAccountsDiscoveryDiagnostic {
  httpStatus: number | null;
  ok: boolean | null;
  accountsReturned: number | null;
  providerErrorStatus: string | null;
  providerErrorMessage: string | null;
  checkedAt: string;
}

export async function discoverGoogleBusinessAccounts(
  accessToken: string,
  fetcher: typeof fetch = fetch
): Promise<{ accounts: GbpAccount[]; diagnostic: GbpAccountsDiscoveryDiagnostic }> {
  const accounts: GbpAccount[] = [];
  let pageToken: string | undefined;
  let diagnostic: GbpAccountsDiscoveryDiagnostic = {
    httpStatus: null,
    ok: null,
    accountsReturned: null,
    providerErrorStatus: null,
    providerErrorMessage: null,
    checkedAt: new Date().toISOString(),
  };
  let firstPage = true;

  try {
    do {
      const url = new URL("https://mybusinessaccountmanagement.googleapis.com/v1/accounts");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetcher(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        let errBody: { error?: { status?: string; message?: string } } = {};
        try {
          errBody = await res.json();
        } catch {
          // ignore -- non-JSON error body
        }
        if (firstPage) {
          diagnostic = {
            httpStatus: res.status,
            ok: false,
            accountsReturned: 0,
            providerErrorStatus: errBody.error?.status ?? null,
            // Google's own safe, non-secret error message -- never the token/header.
            providerErrorMessage: typeof errBody.error?.message === "string" ? errBody.error.message.slice(0, 300) : null,
            checkedAt: new Date().toISOString(),
          };
        }
        console.warn("discoverGoogleBusinessAccounts: account management API returned non-ok status", {
          status: res.status,
          providerErrorStatus: diagnostic.providerErrorStatus,
        });
        break;
      }

      const data = (await res.json()) as {
        accounts?: Array<{
          name?: string;
          accountName?: string;
          type?: string;
          role?: string;
          verificationState?: string;
        }>;
        nextPageToken?: string;
      };

      if (firstPage) {
        diagnostic = {
          httpStatus: res.status,
          ok: true,
          accountsReturned: (data.accounts || []).length,
          providerErrorStatus: null,
          providerErrorMessage: null,
          checkedAt: new Date().toISOString(),
        };
      }

      for (const acct of data.accounts || []) {
        if (acct.name) {
          accounts.push({
            name: acct.name,
            accountName: acct.accountName || acct.name,
            type: acct.type,
            role: acct.role,
            verificationState: acct.verificationState,
          });
        }
      }

      pageToken = data.nextPageToken;
      firstPage = false;
    } while (pageToken);
  } catch (err) {
    console.warn("discoverGoogleBusinessAccounts threw:", err);
    diagnostic = {
      httpStatus: null,
      ok: null,
      accountsReturned: null,
      providerErrorStatus: "NETWORK_ERROR",
      providerErrorMessage: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
      checkedAt: new Date().toISOString(),
    };
  }

  return { accounts, diagnostic };
}

/**
 * Discovers all accessible locations for a given Google Business account.
 */
export async function discoverGoogleBusinessLocationsForAccount(
  accessToken: string,
  accountName: string,
  accountRole?: string,
  fetcher: typeof fetch = fetch
): Promise<GbpLocation[]> {
  const locations: GbpLocation[] = [];
  let pageToken: string | undefined;

  const roleUpper = (accountRole || "").toUpperCase();
  const permissionLevel: "OWNER_ACCESS" | "MANAGER_ACCESS" | "READ_ONLY" =
    roleUpper.includes("OWNER")
      ? "OWNER_ACCESS"
      : roleUpper.includes("MANAGER")
      ? "MANAGER_ACCESS"
      : "OWNER_ACCESS"; // Default for personal/primary accounts

  try {
    do {
      const url = new URL(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`
      );
      url.searchParams.set(
        "readMask",
        "name,title,storefrontAddress,websiteUri,categories,phoneNumbers,metadata,profile"
      );
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetcher(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        console.warn("discoverGoogleBusinessLocationsForAccount: locations API non-ok", {
          accountName,
          status: res.status,
        });
        break;
      }

      const data = (await res.json()) as {
        locations?: Array<GbpLocation>;
        nextPageToken?: string;
      };

      for (const loc of data.locations || []) {
        if (loc.name) {
          locations.push({
            ...loc,
            accountName,
            accountRole,
            permissionLevel,
          });
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (err) {
    console.warn("discoverGoogleBusinessLocationsForAccount threw:", err);
  }

  return locations;
}

/**
 * Discovers all Google Business accounts and all locations across all accounts.
 */
export async function discoverAllGoogleBusinessLocations(
  accessToken: string,
  fetcher: typeof fetch = fetch
): Promise<{ accounts: GbpAccount[]; locations: GbpLocation[]; accountsDiagnostic: GbpAccountsDiscoveryDiagnostic }> {
  const { accounts, diagnostic: accountsDiagnostic } = await discoverGoogleBusinessAccounts(accessToken, fetcher);
  const allLocations: GbpLocation[] = [];

  for (const account of accounts) {
    const locs = await discoverGoogleBusinessLocationsForAccount(
      accessToken,
      account.name,
      account.role,
      fetcher
    );
    allLocations.push(...locs);
  }

  return { accounts, locations: allLocations, accountsDiagnostic };
}

/**
 * A location Google's own database already knows about, discovered via
 * googleLocations:search -- independent of whether the authenticated
 * identity has any accessible Business Profile account at all (unlike
 * discoverAllGoogleBusinessLocations above, this needs no accounts/{id}
 * parent). Real, live-verified endpoint
 * (developers.google.com/my-business/reference/businessinformation/rest/v1/googleLocations/search,
 * fetched during this fix, not recalled) -- exactly the "search for
 * existing profile before creating a new one" capability the STRATXCEL —
 * AUTONOMOUS BUSINESS PROFILE brief's Section 11/12/57 asks for.
 */
export interface GoogleLocationMatch {
  name: string; // "googleLocations/{id}" -- NOT an accounts-and-locations resource name; only usable via claimGoogleLocation below.
  title: string | null;
  websiteUri: string | null;
  // Present only when this listing is already claimed by some account
  // (any account, not necessarily this one) -- Google's own real,
  // documented mechanism for "request access to a listing someone else
  // manages". Null means the listing exists but is genuinely unclaimed.
  requestAdminRightsUri: string | null;
  // The sparse Location payload Google itself returned -- reusable
  // verbatim in claimGoogleLocation() below (accounts.locations.create)
  // to claim this exact listing rather than fabricating a new one.
  location: GbpLocation | null;
}

export async function searchGoogleLocations(
  accessToken: string,
  query: { title: string; websiteUri?: string | null; phoneNumber?: string | null },
  fetcher: typeof fetch = fetch
): Promise<GoogleLocationMatch[]> {
  const locationQuery: Record<string, unknown> = { title: query.title };
  if (query.websiteUri) locationQuery.websiteUri = query.websiteUri;
  // Real request shape (live-verified): phoneNumbers here is a plain
  // string array for matching, distinct from the full Location resource's
  // phoneNumbers.primaryPhone object shape used elsewhere in this file.
  if (query.phoneNumber) locationQuery.phoneNumbers = [query.phoneNumber];

  const res = await fetcher("https://mybusinessbusinessinformation.googleapis.com/v1/googleLocations:search", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pageSize: 5, location: locationQuery }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    const err = new Error(`Google location search failed (${res.status}): ${detail || "no error body"}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = (await res.json()) as {
    googleLocations?: Array<{ name?: string; location?: GbpLocation; requestAdminRightsUri?: string }>;
  };
  return (data.googleLocations ?? [])
    .filter((g): g is { name: string; location?: GbpLocation; requestAdminRightsUri?: string } => Boolean(g.name))
    .map((g) => ({
      name: g.name,
      title: g.location?.title ?? null,
      websiteUri: g.location?.websiteUri ?? null,
      requestAdminRightsUri: g.requestAdminRightsUri ?? null,
      location: g.location ?? null,
    }));
}

/**
 * Claims an existing, genuinely-unclaimed Google location -- never a new,
 * fabricated one -- by resubmitting Google's own returned `location`
 * payload from searchGoogleLocations() through the real, documented
 * accounts.locations.create endpoint. Per Google's own docs (live-verified,
 * not recalled): reusing an already-discovered, unclaimed location's exact
 * data through this endpoint is the real, supported claim mechanism --
 * there is no separate "claim" verb. Only ever call this with a `location`
 * object Google itself returned; never construct one from guessed/AI
 * business data (that would be genuine new-listing creation, a materially
 * different, higher-risk action this function does not perform).
 * `accountName` must be a real "accounts/{id}" resource this identity can
 * manage (from discoverGoogleBusinessAccounts) -- Personal accounts cannot
 * be created via this API (live-verified against accounts.create's own
 * docs), so a genuinely account-less identity (zero accounts, not zero
 * locations) has no valid parent to claim under at all; that is a real,
 * Google-side limitation, not something this function can work around.
 * `requestId` provides real idempotency (Google's own documented dedupe
 * key) against a retried claim attempt.
 */
export async function claimGoogleLocation(
  accessToken: string,
  accountName: string,
  location: GbpLocation,
  requestId: string,
  fetcher: typeof fetch = fetch
): Promise<{ name: string }> {
  const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`);
  url.searchParams.set("requestId", requestId);
  const res = await fetcher(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(location),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    const err = new Error(`Google Business location claim failed (${res.status}): ${detail || "no error body"}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const created = (await res.json()) as { name?: string };
  if (!created.name) throw new Error("Google Business location claim returned no location name -- cannot confirm success");
  return { name: created.name };
}

/**
 * Matches the optimal Google Business location using real verified evidence:
 * 1. Website URI hostname match against the tenant canonical website
 * 2. Business title / Brand name match
 * 3. Single available location auto-match
 */
export function matchGoogleBusinessLocation(
  locations: GbpLocation[],
  context: {
    websiteUrl?: string | null;
    brandName?: string | null;
    address?: string | null;
    phone?: string | null;
  }
): {
  matchedLocation: GbpLocation | null;
  matchConfidence: "HIGH" | "MEDIUM" | "SINGLE_LOCATION" | "NONE";
  reason: string;
} {
  if (!locations || locations.length === 0) {
    return {
      matchedLocation: null,
      matchConfidence: "NONE",
      reason: "No Google Business Profile locations discovered for this Google account.",
    };
  }

  // 1. Match by website URI (highest confidence signal)
  let targetHostname = "";
  if (context.websiteUrl) {
    try {
      const u = new URL(
        context.websiteUrl.startsWith("http") ? context.websiteUrl : `https://${context.websiteUrl}`
      );
      targetHostname = u.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      targetHostname = context.websiteUrl.toLowerCase().replace(/^www\./, "");
    }
  }

  if (targetHostname) {
    for (const loc of locations) {
      if (loc.websiteUri) {
        try {
          const locHost = new URL(
            loc.websiteUri.startsWith("http") ? loc.websiteUri : `https://${loc.websiteUri}`
          ).hostname.toLowerCase().replace(/^www\./, "");
          if (locHost === targetHostname) {
            return {
              matchedLocation: loc,
              matchConfidence: "HIGH",
              reason: `Matched by website domain: ${locHost} matches ${targetHostname}`,
            };
          }
        } catch {
          // Ignore invalid URL in location
        }
      }
    }
  }

  // 2. Match by Brand / Business Title
  const targetBrand = (context.brandName || "StratXcel").trim().toLowerCase();
  if (targetBrand) {
    for (const loc of locations) {
      const titleLower = (loc.title || "").trim().toLowerCase();
      if (titleLower === targetBrand || titleLower.includes(targetBrand) || targetBrand.includes(titleLower)) {
        return {
          matchedLocation: loc,
          matchConfidence: "MEDIUM",
          reason: `Matched by business name: "${loc.title}" matches "${context.brandName || "StratXcel"}"`,
        };
      }
    }
  }

  // 3. Single location fallback (if only 1 location exists across all accounts)
  if (locations.length === 1) {
    return {
      matchedLocation: locations[0],
      matchConfidence: "SINGLE_LOCATION",
      reason: `Auto-selected sole accessible Business Profile location: "${locations[0].title}"`,
    };
  }

  return {
    matchedLocation: null,
    matchConfidence: "NONE",
    reason: `Found ${locations.length} business locations, but none definitively matched website (${context.websiteUrl || "none"}) or brand (${context.brandName || "none"}). Manual location selection required.`,
  };
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
      include_granted_scopes: "true",
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

    // Discover accessible Google Business Profile accounts and locations across all accounts
    const { accounts, locations, accountsDiagnostic } = await discoverAllGoogleBusinessLocations(tokenData.access_token);

    // Match against the StratXcel business context
    const matchResult = matchGoogleBusinessLocation(locations, {
      websiteUrl: "https://www.stratxcel.in",
      brandName: "StratXcel",
    });

    const matched = matchResult.matchedLocation;
    let locationExternalId: string;
    let locationDisplayName: string;
    let locationUsername: string;

    if (matched) {
      locationExternalId = getCanonicalGbpLocationResourceName(matched.accountName, matched.name);
      locationDisplayName = matched.title || "StratXcel";
      locationUsername = matched.title || profileData.email || profileData.name || "StratXcel";
    } else {
      locationExternalId = profileData.id || profileData.email || "google_business_account";
      locationDisplayName = profileData.name || profileData.email || "Google Business Profile";
      locationUsername = profileData.email || profileData.name || "google_business_user";
    }

    const grantedScopes = tokenData.scope ? tokenData.scope.split(" ") : googleBusinessProvider.requiredScopes;

    const formattedAddress = matched?.storefrontAddress
      ? [
          matched.storefrontAddress.addressLines?.join(", "),
          matched.storefrontAddress.locality,
          matched.storefrontAddress.administrativeArea,
          matched.storefrontAddress.postalCode,
          matched.storefrontAddress.regionCode,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

    // Google's real, output-only Account.verificationState -- this account
    // discovery already fetched every account above (discoverAllGoogleBusinessLocations),
    // but until this fix nothing ever read verificationState off any of them.
    // Same account the rest of this metadata attributes the connection to
    // (the matched location's own parent account, falling back to the first
    // discovered account when no location matched yet -- mirrors
    // account_name's own fallback immediately below).
    const verificationAccount = accounts.find((a) => a.name === (matched?.accountName ?? accounts[0]?.name));

    const metadata: Record<string, unknown> = {
      google_user_id: profileData.id ?? null,
      google_email: profileData.email ?? null,
      google_name: profileData.name ?? null,
      location_resolved: Boolean(matched),
      location_resource_name: matched ? locationExternalId : null,
      location_name: matched?.name ?? null,
      account_name: matched?.accountName ?? (accounts[0]?.name ?? null),
      // Raw Google enum, never normalized before storage -- normalization
      // (canonical-status.ts's normalizeGoogleVerificationState call) always
      // happens at read time so a future, currently-unrecognized real Google
      // value is never silently frozen into a stale "UNKNOWN" forever.
      google_verification_state: verificationAccount?.verificationState ?? null,
      business_title: matched?.title ?? null,
      business_category: matched?.categories?.primaryCategory?.displayName ?? null,
      business_address: formattedAddress,
      business_website: matched?.websiteUri ?? null,
      business_phone: matched?.phoneNumbers?.primaryPhone ?? null,
      maps_url: matched?.metadata?.mapsUri ?? null,
      place_id: matched?.metadata?.placeId ?? null,
      permission_level: matched?.permissionLevel ?? (matched ? "OWNER_ACCESS" : "ACCOUNT_AUTHENTICATED"),
      match_reason: matchResult.reason,
      match_confidence: matchResult.matchConfidence,
      accounts_count: accounts.length,
      locations_count: locations.length,
      discovered_locations: locations.map((loc) => ({
        name: loc.name,
        canonicalResource: getCanonicalGbpLocationResourceName(loc.accountName, loc.name),
        title: loc.title,
        websiteUri: loc.websiteUri,
        accountName: loc.accountName,
        permissionLevel: loc.permissionLevel,
      })),
      // Real, safe (never a secret) forensic evidence from the accounts.list
      // call itself (STRATXCEL — GOOGLE BUSINESS DISCOVERY CONTRADICTION
      // brief) -- lets a future investigation distinguish a genuine "this
      // identity really has no accounts" from a healthy 200 OK that Google's
      // own API-access-tier restrictions can also produce for a real,
      // customer-managed profile, instead of re-guessing from scratch.
      accounts_discovery_diagnostic: accountsDiagnostic,
      discovery_status: matched
        ? "LOCATION_MATCHED"
        : locations.length > 0
        ? "LOCATION_SELECTION_REQUIRED"
        : accounts.length > 0
        ? "NO_LOCATIONS_IN_ACCOUNTS"
        : "NO_GBP_ACCOUNTS_FOUND",
      discovered_at: new Date().toISOString(),
    };

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresInSeconds: tokenData.expires_in,
      externalAccountId: locationExternalId,
      displayName: locationDisplayName,
      username: locationUsername,
      profilePictureUrl: profileData.picture,
      scopes: grantedScopes,
      metadata,
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

/**
 * Real, live accounts.get call -- the automatic-recheck half of the
 * verification gap this file's own exchangeCodeForToken() was found to have
 * (see normalizeGoogleVerificationState's own comment): a customer who
 * completes Google's own verification after connecting has no reason to
 * ever run this codebase's OAuth flow again, so the verification state
 * captured once at connect-time would otherwise sit stale forever.
 * `accountName` must be a real "accounts/{id}" resource (this codebase
 * already stores one on every resolved connection as
 * social_accounts.metadata.account_name -- see exchangeCodeForToken/the
 * google-business probe route). Returns the raw Google enum string (or null
 * on a 2xx response that genuinely omits the field) -- callers normalize it
 * with normalizeGoogleVerificationState(); throws a real, honest error on
 * any non-ok response so a caller's own 401-refresh-retry pattern (see
 * listLocationReviews/replyToLocationReview's real callers) applies
 * exactly the same way.
 */
export async function getAccountVerificationState(accessToken: string, accountName: string): Promise<string | null> {
  const res = await fetch(`https://mybusinessaccountmanagement.googleapis.com/v1/${accountName}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    const err = new Error(`Google Business account lookup failed (${res.status}): ${detail || "no error body"}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const account = (await res.json()) as { verificationState?: string };
  return account.verificationState ?? null;
}
