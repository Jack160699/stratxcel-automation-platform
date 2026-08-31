import type {
  ConnectorSection,
  GoogleBusinessInsight,
  SocialAccountInsight,
  SocialConnectorInsightsProvider,
} from "@stratxcel/audit-engine";
import type { ConnectorAvailabilityState } from "@stratxcel/search-discovery";
import { createSupabaseServiceClient } from "../supabase/service.ts";
import { getDecryptedTokenState, saveRefreshedAccessToken } from "./repositories/accounts.ts";
import { facebookProvider } from "./providers/facebook.ts";
import { instagramProvider } from "./providers/instagram.ts";
import { googleBusinessProvider, isResolvedGbpLocationResourceName } from "./providers/google-business.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

const FETCH_TIMEOUT_MS = 6_000;
const POST_WINDOW_DAYS = 90;
const GRAPH_VERSION = "v21.0";

function unavailable<T>(state: ConnectorAvailabilityState, reason: string): ConnectorSection<T> {
  return { state, reason, retrievedAt: null, timeWindow: null, data: null };
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function classifyHttpError(status: number): ConnectorAvailabilityState {
  if (status === 401 || status === 403) return "permission_required";
  return "provider_error";
}

interface AccountRow {
  id: string;
  platform: string;
  provider_account_id: string;
  username: string | null;
  display_name: string | null;
  updated_at: string;
  created_at: string;
}

/**
 * Tenant-scoped access token resolution for one social_accounts row. Tries the
 * currently stored token first (cheap); on a 401/permission failure the caller
 * refreshes once via the platform's own refreshAccessToken and persists the
 * result through the existing saveRefreshedAccessToken path, then retries once.
 * Never returns a token for any account other than the one explicitly passed in.
 */
// Exported for reuse by app/api/internal/search/scheduler/route.ts's
// review-bot cycle, which needs the identical "try the stored token, refresh
// once on a real 401, never fabricate a usable token" resolution this file
// already implements — kept as one real implementation, not duplicated.
export async function resolveAccessToken(
  service: ServiceClient,
  accountId: string,
): Promise<{ accessToken: string; refreshToken: string | null } | null> {
  try {
    const state = await getDecryptedTokenState(service, accountId);
    return { accessToken: state.accessToken, refreshToken: state.refreshToken };
  } catch (err) {
    // Found live during E2E testing: this discarded the real error entirely,
    // so every account in this state surfaced only as the generic "Could not
    // read the stored X token." to the customer with zero trace of why --
    // a genuine decrypt/vault failure and a merely-missing row were
    // indistinguishable in the logs. Log the real (non-secret) failure
    // reason; the message itself never contains token material.
    console.error("audit-connector-insights: resolveAccessToken failed", {
      accountId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// Exported for the same reason as resolveAccessToken above.
export async function refreshToken(
  service: ServiceClient,
  accountId: string,
  refreshTokenValue: string,
  provider: { refreshAccessToken?(refreshToken: string): Promise<{ accessToken: string; expiresInSeconds?: number }> },
): Promise<string | null> {
  if (!provider.refreshAccessToken) return null;
  try {
    const refreshed = await provider.refreshAccessToken(refreshTokenValue);
    await saveRefreshedAccessToken(service, accountId, refreshed.accessToken, refreshed.expiresInSeconds);
    return refreshed.accessToken;
  } catch {
    return null;
  }
}

async function gatherFacebook(
  service: ServiceClient,
  account: AccountRow,
): Promise<ConnectorSection<SocialAccountInsight>> {
  const tokens = await resolveAccessToken(service, account.id);
  if (!tokens) return unavailable("provider_error", "Could not read the stored Facebook token.");
  const retrievedAt = new Date().toISOString();

  const run = async (accessToken: string) => {
    const profileRes = await fetchWithTimeout(
      `https://graph.facebook.com/${GRAPH_VERSION}/${account.provider_account_id}?fields=name,followers_count,fan_count&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!profileRes.ok) {
      const err = new Error(`facebook_profile_http_${profileRes.status}`);
      (err as Error & { status: number }).status = profileRes.status;
      throw err;
    }
    const profile = (await profileRes.json()) as { name?: string; followers_count?: number; fan_count?: number };

    const postsRes = await fetchWithTimeout(
      `https://graph.facebook.com/${GRAPH_VERSION}/${account.provider_account_id}/posts?fields=created_time&limit=25&access_token=${encodeURIComponent(accessToken)}`,
    );
    let posts: Array<{ created_time?: string }> = [];
    if (postsRes.ok) {
      const body = (await postsRes.json()) as { data?: Array<{ created_time?: string }> };
      posts = body.data ?? [];
    }
    const cutoff = Date.now() - POST_WINDOW_DAYS * 86_400_000;
    const recent = posts.filter((p) => p.created_time && new Date(p.created_time).getTime() >= cutoff);
    return {
      platform: "facebook" as const,
      username: profile.name ?? account.display_name ?? account.username,
      followerCount: profile.followers_count ?? profile.fan_count ?? null,
      recentPostCount: posts.length ? recent.length : null,
      mostRecentPostAt: posts[0]?.created_time ?? null,
      postWindowDays: POST_WINDOW_DAYS,
    };
  };

  try {
    const data = await run(tokens.accessToken);
    return { state: "available", reason: null, retrievedAt, timeWindow: `last ${POST_WINDOW_DAYS} days`, data };
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 401 && tokens.refreshToken) {
      const fresh = await refreshToken(service, account.id, tokens.refreshToken, facebookProvider);
      if (fresh) {
        try {
          const data = await run(fresh);
          return { state: "available", reason: null, retrievedAt, timeWindow: `last ${POST_WINDOW_DAYS} days`, data };
        } catch (err2) {
          const status2 = (err2 as Error & { status?: number }).status;
          return unavailable(status2 ? classifyHttpError(status2) : "provider_error", "Facebook read failed after token refresh.");
        }
      }
      return unavailable("permission_required", "Facebook access needs to be reconnected.");
    }
    return unavailable(status ? classifyHttpError(status) : "provider_error", err instanceof Error ? err.message : "Facebook read failed.");
  }
}

async function gatherInstagram(
  service: ServiceClient,
  account: AccountRow,
): Promise<ConnectorSection<SocialAccountInsight>> {
  const tokens = await resolveAccessToken(service, account.id);
  if (!tokens) return unavailable("provider_error", "Could not read the stored Instagram token.");
  const retrievedAt = new Date().toISOString();

  const run = async (accessToken: string) => {
    const profileRes = await fetchWithTimeout(
      `https://graph.instagram.com/${account.provider_account_id}?fields=username,followers_count,media_count&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!profileRes.ok) {
      const err = new Error(`instagram_profile_http_${profileRes.status}`);
      (err as Error & { status: number }).status = profileRes.status;
      throw err;
    }
    const profile = (await profileRes.json()) as { username?: string; followers_count?: number; media_count?: number };

    const mediaRes = await fetchWithTimeout(
      `https://graph.instagram.com/${account.provider_account_id}/media?fields=timestamp&limit=25&access_token=${encodeURIComponent(accessToken)}`,
    );
    let media: Array<{ timestamp?: string }> = [];
    if (mediaRes.ok) {
      const body = (await mediaRes.json()) as { data?: Array<{ timestamp?: string }> };
      media = body.data ?? [];
    }
    const cutoff = Date.now() - POST_WINDOW_DAYS * 86_400_000;
    const recent = media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= cutoff);
    return {
      platform: "instagram" as const,
      username: profile.username ?? account.username,
      followerCount: profile.followers_count ?? null,
      recentPostCount: media.length ? recent.length : null,
      mostRecentPostAt: media[0]?.timestamp ?? null,
      postWindowDays: POST_WINDOW_DAYS,
    };
  };

  try {
    const data = await run(tokens.accessToken);
    return { state: "available", reason: null, retrievedAt, timeWindow: `last ${POST_WINDOW_DAYS} days`, data };
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 401 && tokens.refreshToken) {
      const fresh = await refreshToken(service, account.id, tokens.refreshToken, instagramProvider);
      if (fresh) {
        try {
          const data = await run(fresh);
          return { state: "available", reason: null, retrievedAt, timeWindow: `last ${POST_WINDOW_DAYS} days`, data };
        } catch (err2) {
          const status2 = (err2 as Error & { status?: number }).status;
          return unavailable(status2 ? classifyHttpError(status2) : "provider_error", "Instagram read failed after token refresh.");
        }
      }
      return unavailable("permission_required", "Instagram access needs to be reconnected.");
    }
    return unavailable(status ? classifyHttpError(status) : "provider_error", err instanceof Error ? err.message : "Instagram read failed.");
  }
}

async function gatherGoogleBusiness(
  service: ServiceClient,
  account: AccountRow,
): Promise<ConnectorSection<GoogleBusinessInsight>> {
  // Found live against the real StratXcel tenant (see
  // isResolvedGbpLocationResourceName's own header comment and
  // docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 10): a
  // CONNECTED/HEALTHY row's provider_account_id can still be the OAuth-time
  // fallback bare id when GBP account/location discovery never resolved a
  // real location. Calling the location-read endpoint with that id below
  // was previously indistinguishable from a real transient failure — a
  // generic provider_error/permission_required with no actionable reason.
  // Checked before spending a token lookup or a doomed network call.
  if (!isResolvedGbpLocationResourceName(account.provider_account_id)) {
    return unavailable(
      "permission_required",
      "Google Business account/location was never resolved during connection (no accessible Business Profile found for this Google identity, or discovery failed) — reconnect Google Business to complete setup.",
    );
  }

  const tokens = await resolveAccessToken(service, account.id);
  if (!tokens) return unavailable("provider_error", "Could not read the stored Google Business token.");
  const retrievedAt = new Date().toISOString();

  // account.provider_account_id is the GBP location resource name captured at
  // connect time (e.g. "accounts/123/locations/456") — reusing the exact
  // readMask already proven working in this codebase's OAuth callback.
  const run = async (accessToken: string) => {
    const res = await fetchWithTimeout(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.provider_account_id}?readMask=title,storefrontAddress,websiteUri,categories`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const err = new Error(`gbp_location_http_${res.status}`);
      (err as Error & { status: number }).status = res.status;
      throw err;
    }
    const location = (await res.json()) as {
      title?: string;
      websiteUri?: string;
      storefrontAddress?: { addressLines?: string[]; locality?: string; regionCode?: string };
      categories?: { primaryCategory?: { displayName?: string } };
    };
    const address = location.storefrontAddress
      ? [location.storefrontAddress.addressLines?.join(", "), location.storefrontAddress.locality, location.storefrontAddress.regionCode]
          .filter(Boolean)
          .join(", ") || null
      : null;
    return {
      displayName: location.title ?? account.display_name ?? null,
      category: location.categories?.primaryCategory?.displayName ?? null,
      address,
      websiteUri: location.websiteUri ?? null,
      connectedSince: account.created_at,
    };
  };

  try {
    const data = await run(tokens.accessToken);
    return { state: "available", reason: null, retrievedAt, timeWindow: null, data };
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 401 && tokens.refreshToken) {
      const fresh = await refreshToken(service, account.id, tokens.refreshToken, googleBusinessProvider);
      if (fresh) {
        try {
          const data = await run(fresh);
          return { state: "available", reason: null, retrievedAt, timeWindow: null, data };
        } catch (err2) {
          const status2 = (err2 as Error & { status?: number }).status;
          return unavailable(status2 ? classifyHttpError(status2) : "provider_error", "Google Business read failed after token refresh.");
        }
      }
      return unavailable("permission_required", "Google Business access needs to be reconnected.");
    }
    return unavailable(status ? classifyHttpError(status) : "provider_error", err instanceof Error ? err.message : "Google Business read failed.");
  }
}

/**
 * Real implementation of the audit-engine's SocialConnectorInsightsProvider,
 * living here (not in packages/audit-engine) because it needs lib/social's
 * token decrypt/refresh machinery. Every query below is explicitly tenant-
 * scoped by tenant_id — never "find first connected account" — matching the
 * documented pattern in lib/social/repositories/accounts.ts.
 */
export function createSocialAuditConnectorInsightsProvider(
  serviceOverride?: ServiceClient,
): SocialConnectorInsightsProvider {
  return {
    async gather(tenantId: string) {
      const service = serviceOverride ?? createSupabaseServiceClient();
      const { data: accounts, error } = await service
        .from("social_accounts")
        .select("id, platform, provider_account_id, username, display_name, updated_at, created_at, status")
        .eq("tenant_id", tenantId)
        .in("platform", ["facebook", "instagram", "google_business"]);

      if (error || !accounts) {
        const failure = unavailable<never>("provider_error", "Could not read connected social accounts for this tenant.");
        return { facebook: failure, instagram: failure, googleBusiness: failure };
      }

      const byPlatform = new Map<string, AccountRow & { status: string }>();
      for (const row of accounts as Array<AccountRow & { status: string }>) {
        if (row.status === "CONNECTED") byPlatform.set(row.platform, row);
      }

      const [facebook, instagram, googleBusiness] = await Promise.all([
        byPlatform.has("facebook")
          ? gatherFacebook(service, byPlatform.get("facebook")!)
          : Promise.resolve(unavailable<SocialAccountInsight>("not_connected", "Facebook is not connected for this workspace.")),
        byPlatform.has("instagram")
          ? gatherInstagram(service, byPlatform.get("instagram")!)
          : Promise.resolve(unavailable<SocialAccountInsight>("not_connected", "Instagram is not connected for this workspace.")),
        byPlatform.has("google_business")
          ? gatherGoogleBusiness(service, byPlatform.get("google_business")!)
          : Promise.resolve(unavailable<GoogleBusinessInsight>("not_connected", "Google Business Profile is not connected for this workspace.")),
      ]);

      return { facebook, instagram, googleBusiness };
    },
  };
}
