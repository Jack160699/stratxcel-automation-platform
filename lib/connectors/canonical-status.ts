import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import type { PlatformIconKey } from "@/components/audit/PlatformIcon";
// Relative, not "@/lib/..." -- this is a real runtime value import (unlike
// the type-only PlatformIconKey import above, which the type-strip step
// elides), and this repo's test convention runs .test.ts files directly
// under `node --experimental-strip-types`, which has no tsconfig path-alias
// resolution.
import { isResolvedGbpLocationResourceName } from "../social/providers/google-business.ts";
import {
  resolveVercelWriteCapability,
  type VercelWriteCapabilityState,
} from "../../packages/search-discovery/src/execution/cms/vercel-write-resolver.ts";

export type CanonicalConnectionState =
  | "CONNECTED"
  | "DISCOVERED_PUBLICLY"
  | "NOT_CONNECTED"
  | "REAUTH_REQUIRED"
  | "ERROR";

export type AuthState = "AUTHENTICATED" | "UNAUTHENTICATED" | "EXPIRED" | "REVOKED";
export type HealthState = "HEALTHY" | "DEGRADED" | "UNKNOWN" | "ERROR";

export const V1_DIGITAL_PRESENCE_PLATFORMS = [
  "website",
  "google_business",
  "instagram",
  "facebook",
  "youtube",
  "google_analytics",
  "google_search_console",
  "whatsapp",
] as const;

export type V1DigitalPresencePlatform = (typeof V1_DIGITAL_PRESENCE_PLATFORMS)[number];

export interface CanonicalConnectionStatus {
  provider: V1DigitalPresencePlatform;
  asset: "website" | "profile" | "page" | "channel" | "property" | "phone";
  title: string;
  tenantId: string;
  externalAccountId: string | null;
  displayName: string | null;
  handle: string | null;
  publicUrl: string | null;
  connectionState: CanonicalConnectionState;
  authState: AuthState;
  healthState: HealthState;
  capabilities: string[];
  lastSyncedAt: string | null;
  reauthRequired: boolean;
  isDiscoveredPublicly: boolean;
  isOAuth: boolean;
  provenance: "oauth_authenticated" | "otp_verified" | "customer_supplied" | "verified_public" | "discovered_public" | "unknown";
  error: string | null;
  writeCapability?: VercelWriteCapabilityState;
  platform?: string;
  hostingProvider?: string;
  projectName?: string;
}

export interface TenantDigitalPresenceSummary {
  tenantId: string;
  connections: Record<V1DigitalPresencePlatform, CanonicalConnectionStatus>;
  connectedCount: number;
  discoveredCount: number;
  lastUpdated: string;
}

const BLOCKED_SCHEMES = /^(javascript|data|file|blob|about|vbscript):/i;

function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return (url.protocol === "https:" || url.protocol === "http:") && !BLOCKED_SCHEMES.test(value);
  } catch {
    return false;
  }
}

// social_accounts_status_check only allows CONNECTED | DISCONNECTED | ERROR |
// RECONNECT_REQUIRED, and social_accounts_token_health_check only allows
// UNKNOWN | HEALTHY | EXPIRING | EXPIRED | REVOKED | ERROR (verified against
// the live schema). This resolver used to check status.includes("REAUTH")
// and token_health === "INVALID" -- neither value is legal under either
// constraint, so a row could never actually match and every provider's
// REAUTH_REQUIRED state was unreachable dead code. Persistence (see
// lib/social/repositories/accounts.ts markReauthRequired) writes
// RECONNECT_REQUIRED / EXPIRED; check those real values instead.
function isReauthRequired(
  row: { id?: unknown; status?: unknown; token_health?: unknown } | null | undefined,
  hasUsableToken?: (accountId: string) => boolean
): boolean {
  if (!row) return false;
  const status = String(row.status).toUpperCase();
  // A deliberate customer disconnect is terminal, not broken -- never surface
  // it as "needs reconnect" just because a leftover token_health value (e.g.
  // REVOKED, recorded at disconnect time) is still sitting on the row. Same
  // principle already applied to WhatsApp's disabled-vs-revoked distinction
  // below; social_accounts needed the same guard once REAUTH detection
  // actually became reachable.
  if (status === "DISCONNECTED") return false;
  if (status === "RECONNECT_REQUIRED") return true;
  const health = String(row.token_health).toUpperCase();
  if (health === "EXPIRED" || health === "REVOKED") return true;
  // Same gap this codebase already fixed once for GA4/Search Console (a
  // status: "connected" row with no encrypted_refresh_token_ref was reported
  // healthy) -- found live again here for social_accounts: a row can carry
  // status: CONNECTED / token_health: HEALTHY with zero matching row in
  // social_tokens at all, not merely an expired one. Every downstream
  // consumer (Connected Accounts, Home, Audit) inherited the false-healthy
  // answer. A CONNECTED row with no real, usable token behind it must fall
  // through to REAUTH_REQUIRED like every other unusable-token case here.
  if (status === "CONNECTED" && hasUsableToken && typeof row.id === "string" && !hasUsableToken(row.id)) return true;
  return false;
}

function cleanHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("@")) return trimmed;
  if (trimmed.startsWith("+")) return trimmed;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const path = url.pathname.replace(/\/+$/, "").replace(/^\/@?/, "");
    const segment = path.split("/")[0];
    if (segment) return `@${decodeURIComponent(segment)}`;
    return url.hostname.replace(/^www\./, "");
  } catch {
    return trimmed;
  }
}

function extractPublicProfile(provider: V1DigitalPresencePlatform, profiles: string[]): { url: string | null; handle: string | null } {
  const needle =
    provider === "instagram" ? "instagram.com"
    : provider === "facebook" ? "facebook.com"
    : provider === "youtube" ? "youtube.com"
    : provider === "google_business" ? "google.com/maps"
    : "";

  if (!needle) return { url: null, handle: null };

  const matched = profiles.find((item) => typeof item === "string" && item.toLowerCase().includes(needle));
  if (!matched) return { url: null, handle: null };

  const url = isSafeHttpUrl(matched) ? matched : null;
  return {
    url,
    handle: cleanHandle(matched),
  };
}

/**
 * Resolves the canonical connection status for all V1.5 digital presence assets
 * for a specific tenant from database ground truth.
 *
 * Ground Truth Rules:
 * 1. STATE 3 (OPERATIONALLY_READY / CONNECTED) strictly overrides PUBLIC DISCOVERY.
 * 2. An account is only CONNECTED if the database record is active, tenant-bound, and healthy.
 * 3. PUBLICLY_DISCOVERED is only set when no valid OAuth connection exists.
 * 4. LinkedIn, X, and Threads are excluded from this V1.5 canonical model.
 */
export const getTenantDigitalPresence = cache(async function getTenantDigitalPresence(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantDigitalPresenceSummary> {
  const now = new Date().toISOString();

  // 1. Parallel query of ground truth tables
  const [waRes, socialRes, googleRes, brandBrain] = await Promise.all([
    supabase
      .from("whatsapp_phone_bindings")
      .select("id, status, display_phone_number, verified_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("social_accounts")
      .select("id, platform, provider_account_id, username, display_name, status, token_health, last_sync_at, updated_at")
      .eq("tenant_id", tenantId),
    supabase
      .from("search_google_connections")
      .select("id, status, encrypted_refresh_token_ref, search_console_site_url, search_console_last_synced_at, ga4_property_id, ga4_property_display_name, ga4_last_synced_at, last_error, updated_at")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    getCurrentBrandBrain(supabase, tenantId).catch(() => null),
  ]);

  const socialRows = socialRes.data ?? [];
  const waRows = waRes.data ?? [];
  const googleRow = googleRes.data ?? null;

  // 2. Real token presence for the social_accounts-backed providers, checked
  // separately since it depends on the account ids just resolved above. A
  // row's own status/token_health columns are not proof a usable token
  // exists — see isReauthRequired()'s hasUsableToken branch.
  const accountIdsWithUsableToken = new Set<string>();
  if (socialRows.length > 0) {
    const { data: tokenRows } = await supabase
      .from("social_tokens")
      .select("account_id, access_token_encrypted")
      .in("account_id", socialRows.map((r) => r.id));
    for (const t of tokenRows ?? []) {
      if (t.access_token_encrypted) accountIdsWithUsableToken.add(t.account_id);
    }
  }
  const hasUsableToken = (accountId: string) => accountIdsWithUsableToken.has(accountId);

  const brandContent = (brandBrain?.content ?? {}) as Record<string, unknown>;
  const rawProfiles: string[] = [
    ...(Array.isArray(brandContent.online_profiles) ? brandContent.online_profiles : []),
    ...(Array.isArray(brandContent.channels) ? brandContent.channels : []),
    ...(Array.isArray(brandContent.verified_social_links)
      ? (brandContent.verified_social_links as Array<{ url?: string; handle?: string }>).map((s) => s.url || s.handle || "")
      : []),
  ];
  const onlineProfiles = [...new Set(rawProfiles.filter((v): v is string => typeof v === "string" && v.trim().length > 0))];

  // Helper to find social account row by platform
  const findSocialRow = (platform: string) =>
    socialRows.find((r) => String(r.platform).toLowerCase() === platform.toLowerCase());

  // 1. Website
  const rawWebsite = typeof brandContent.website_url === "string" ? brandContent.website_url.trim() : "";
  const validWebsiteUrl = isSafeHttpUrl(rawWebsite) ? (rawWebsite.startsWith("http") ? rawWebsite : `https://${rawWebsite}`) : (process.env.NEXT_PUBLIC_APP_URL || "https://www.stratxcel.in");

  const vercelWriteResult = await resolveVercelWriteCapability({
    tenantId,
    db: supabase,
    siteUrl: validWebsiteUrl || undefined,
  });

  const websiteStatus: CanonicalConnectionStatus = {
    provider: "website",
    asset: "website",
    title: "Website",
    tenantId,
    externalAccountId: "prj_81j5A5rArsPVVNspwSPGGfuhg9NZ",
    displayName: validWebsiteUrl ? new URL(validWebsiteUrl).hostname.replace(/^www\./, "") : "stratxcel.in",
    handle: validWebsiteUrl ? new URL(validWebsiteUrl).hostname.replace(/^www\./, "") : "stratxcel.in",
    publicUrl: validWebsiteUrl,
    connectionState: "CONNECTED",
    authState: "AUTHENTICATED",
    healthState: "HEALTHY",
    capabilities: ["domain_crawling", "seo_indexing", "content_extraction", "nextjs_rendering"],
    lastSyncedAt: brandBrain?.updated_at ?? now,
    reauthRequired: false,
    isDiscoveredPublicly: false,
    isOAuth: false,
    provenance: vercelWriteResult.provenance === "customer_tenant_connection" ? "customer_supplied" : "verified_public",
    error: null,
    writeCapability: vercelWriteResult.state,
    platform: vercelWriteResult.projectDetails.framework,
    hostingProvider: "vercel",
    projectName: vercelWriteResult.projectDetails.name,
  };

  // 2. Google Business Profile
  const gbSocial = findSocialRow("google_business") || findSocialRow("google");
  const gbPublic = extractPublicProfile("google_business", onlineProfiles);
  const gbConnected = gbSocial && String(gbSocial.status).toUpperCase() === "CONNECTED";
  const gbError = gbSocial && String(gbSocial.status).toUpperCase() === "ERROR";
  // Found live against the real StratXcel tenant
  // (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 10): a row can
  // be status: CONNECTED / token_health: HEALTHY with a genuinely usable
  // OAuth token, while provider_account_id is still the OAuth-time fallback
  // bare Google account id (GBP account/location discovery never resolved
  // a real accounts/{id}/locations/{id} resource for this identity). Every
  // GBP read/write call this codebase makes needs that resolved resource
  // name -- a connection in this state cannot actually do anything GBP-
  // specific yet, so it must not read as a healthy CONNECTED card here, the
  // exact "Google Business is fully ready" misrepresentation this was
  // found to produce on the real customer-facing home dashboard
  // (app/app/page.tsx reads connectionState directly).
  const gbLocationUnresolved = Boolean(gbConnected && !isResolvedGbpLocationResourceName(gbSocial?.provider_account_id ?? ""));
  const gbReauth = isReauthRequired(gbSocial, hasUsableToken) || gbLocationUnresolved;

  const googleBusinessStatus: CanonicalConnectionStatus = {
    provider: "google_business",
    asset: "profile",
    title: "Google Business",
    tenantId,
    externalAccountId: gbSocial?.provider_account_id ?? null,
    displayName: gbSocial?.display_name || gbSocial?.username || (gbConnected ? "Google Business Profile" : null),
    handle: gbSocial?.username ? cleanHandle(gbSocial.username) : gbPublic.handle,
    publicUrl: gbPublic.url,
    // gbReauth takes precedence over gbConnected: a row can be status=CONNECTED
    // with a REVOKED/EXPIRED token_health (the provider invalidated it without
    // the customer disconnecting) -- that must still surface as needing
    // reconnect, not as a healthy connection. isReauthRequired() already
    // excludes DISCONNECTED, so a deliberate disconnect still wins below.
    connectionState: gbReauth
      ? "REAUTH_REQUIRED"
      : gbConnected
      ? "CONNECTED"
      : gbError
      ? "ERROR"
      : gbPublic.url
      ? "DISCOVERED_PUBLICLY"
      : "NOT_CONNECTED",
    authState: gbReauth ? "EXPIRED" : gbConnected ? "AUTHENTICATED" : "UNAUTHENTICATED",
    healthState: gbReauth ? "DEGRADED" : gbConnected ? "HEALTHY" : gbError ? "DEGRADED" : "UNKNOWN",
    capabilities: ["local_seo", "review_sync", "business_hours"],
    lastSyncedAt: gbSocial?.last_sync_at ?? gbSocial?.updated_at ?? null,
    reauthRequired: Boolean(gbReauth),
    isDiscoveredPublicly: Boolean(gbPublic.url && !gbConnected),
    isOAuth: true,
    provenance: gbConnected ? "oauth_authenticated" : gbPublic.url ? "discovered_public" : "unknown",
    error: gbError
      ? "Google Business connection error. Please reconnect."
      : gbLocationUnresolved
      ? "Google Business is connected, but the business location wasn't found for this Google account — reconnect to complete setup."
      : null,
  };

  // 3. Instagram
  const igSocial = findSocialRow("instagram");
  const igPublic = extractPublicProfile("instagram", onlineProfiles);
  const igConnected = igSocial && String(igSocial.status).toUpperCase() === "CONNECTED";
  const igReauth = isReauthRequired(igSocial, hasUsableToken);
  const igError = igSocial && String(igSocial.status).toUpperCase() === "ERROR";

  const instagramStatus: CanonicalConnectionStatus = {
    provider: "instagram",
    asset: "profile",
    title: "Instagram",
    tenantId,
    externalAccountId: igSocial?.provider_account_id ?? null,
    displayName: igSocial?.display_name || igSocial?.username || (igConnected ? "Instagram Business" : null),
    handle: igSocial?.username ? cleanHandle(igSocial.username) : igPublic.handle,
    publicUrl: igConnected && igSocial?.username ? `https://instagram.com/${igSocial.username.replace(/^@/, "")}` : igPublic.url,
    connectionState: igReauth
      ? "REAUTH_REQUIRED"
      : igConnected
      ? "CONNECTED"
      : igError
      ? "ERROR"
      : igPublic.url
      ? "DISCOVERED_PUBLICLY"
      : "NOT_CONNECTED",
    authState: igReauth ? "EXPIRED" : igConnected ? "AUTHENTICATED" : "UNAUTHENTICATED",
    healthState: igReauth ? "DEGRADED" : igConnected ? "HEALTHY" : igError ? "DEGRADED" : "UNKNOWN",
    capabilities: ["direct_publishing", "reels_publishing", "insights_analytics", "comment_monitoring"],
    lastSyncedAt: igSocial?.last_sync_at ?? igSocial?.updated_at ?? null,
    reauthRequired: Boolean(igReauth),
    isDiscoveredPublicly: Boolean(igPublic.url && !igConnected),
    isOAuth: true,
    provenance: igConnected ? "oauth_authenticated" : igPublic.url ? "discovered_public" : "unknown",
    error: igError ? "Instagram authorization expired. Please reconnect." : null,
  };

  // 4. Facebook
  const fbSocial = findSocialRow("facebook");
  const fbPublic = extractPublicProfile("facebook", onlineProfiles);
  const fbConnected = fbSocial && String(fbSocial.status).toUpperCase() === "CONNECTED";
  const fbReauth = isReauthRequired(fbSocial, hasUsableToken);
  const fbError = fbSocial && String(fbSocial.status).toUpperCase() === "ERROR";

  const facebookStatus: CanonicalConnectionStatus = {
    provider: "facebook",
    asset: "page",
    title: "Facebook",
    tenantId,
    externalAccountId: fbSocial?.provider_account_id ?? null,
    displayName: fbSocial?.display_name || fbSocial?.username || (fbConnected ? "Facebook Page" : null),
    handle: fbSocial?.username ? cleanHandle(fbSocial.username) : fbPublic.handle,
    publicUrl: fbConnected && fbSocial?.username ? `https://facebook.com/${fbSocial.username.replace(/^@/, "")}` : fbPublic.url,
    connectionState: fbReauth
      ? "REAUTH_REQUIRED"
      : fbConnected
      ? "CONNECTED"
      : fbError
      ? "ERROR"
      : fbPublic.url
      ? "DISCOVERED_PUBLICLY"
      : "NOT_CONNECTED",
    authState: fbReauth ? "EXPIRED" : fbConnected ? "AUTHENTICATED" : "UNAUTHENTICATED",
    healthState: fbReauth ? "DEGRADED" : fbConnected ? "HEALTHY" : fbError ? "DEGRADED" : "UNKNOWN",
    capabilities: ["page_publishing", "page_insights", "community_engagement"],
    lastSyncedAt: fbSocial?.last_sync_at ?? fbSocial?.updated_at ?? null,
    reauthRequired: Boolean(fbReauth),
    isDiscoveredPublicly: Boolean(fbPublic.url && !fbConnected),
    isOAuth: true,
    provenance: fbConnected ? "oauth_authenticated" : fbPublic.url ? "discovered_public" : "unknown",
    error: fbError ? "Facebook page token invalid. Please reconnect." : null,
  };

  // 5. YouTube
  const ytSocial = findSocialRow("youtube");
  const ytPublic = extractPublicProfile("youtube", onlineProfiles);
  const ytConnected = ytSocial && String(ytSocial.status).toUpperCase() === "CONNECTED";
  const ytReauth = isReauthRequired(ytSocial, hasUsableToken);
  const ytError = ytSocial && String(ytSocial.status).toUpperCase() === "ERROR";

  const youtubeStatus: CanonicalConnectionStatus = {
    provider: "youtube",
    asset: "channel",
    title: "YouTube",
    tenantId,
    externalAccountId: ytSocial?.provider_account_id ?? null,
    displayName: ytSocial?.display_name || ytSocial?.username || (ytConnected ? "YouTube Channel" : null),
    handle: ytSocial?.username ? cleanHandle(ytSocial.username) : ytPublic.handle,
    publicUrl: ytConnected && ytSocial?.username ? `https://youtube.com/@${ytSocial.username.replace(/^@/, "")}` : ytPublic.url,
    connectionState: ytReauth
      ? "REAUTH_REQUIRED"
      : ytConnected
      ? "CONNECTED"
      : ytError
      ? "ERROR"
      : ytPublic.url
      ? "DISCOVERED_PUBLICLY"
      : "NOT_CONNECTED",
    authState: ytReauth ? "EXPIRED" : ytConnected ? "AUTHENTICATED" : "UNAUTHENTICATED",
    healthState: ytReauth ? "DEGRADED" : ytConnected ? "HEALTHY" : ytError ? "DEGRADED" : "UNKNOWN",
    capabilities: ["video_upload", "shorts_publishing", "channel_analytics"],
    lastSyncedAt: ytSocial?.last_sync_at ?? ytSocial?.updated_at ?? null,
    reauthRequired: Boolean(ytReauth),
    isDiscoveredPublicly: Boolean(ytPublic.url && !ytConnected),
    isOAuth: true,
    provenance: ytConnected ? "oauth_authenticated" : ytPublic.url ? "discovered_public" : "unknown",
    error: ytError ? "YouTube authorization failed. Please reconnect." : null,
  };

  // 6. Google Analytics (GA4)
  // Found live during E2E testing: a row with status "connected" but no
  // encrypted_refresh_token_ref (the exact state every real customer's
  // connection was left in before the OAuth callback's token-persistence
  // bug was fixed -- see the search_google_connections callback fix) used
  // to report CONNECTED here, contradicting /api/platform/search/google/
  // resources, which correctly detects it can't actually mint a live
  // access token and reports disconnected. Treat "connected" status
  // without a usable stored token the same way every other provider here
  // already treats an expired/revoked one: REAUTH_REQUIRED, not CONNECTED
  // -- the customer did authorize once, but the connection isn't usable
  // until they reconnect.
  const ga4HasUsableToken = Boolean(googleRow?.encrypted_refresh_token_ref);
  const ga4Connected = Boolean(googleRow && googleRow.status === "connected" && googleRow.ga4_property_id && ga4HasUsableToken);
  const ga4AccountReady = Boolean(googleRow && googleRow.status === "connected" && ga4HasUsableToken);
  const ga4Reauth = Boolean(
    googleRow && (googleRow.status === "revoked" || googleRow.status === "error" || (googleRow.status === "connected" && !ga4HasUsableToken))
  );
  const ga4Error = googleRow?.last_error ?? null;

  const googleAnalyticsStatus: CanonicalConnectionStatus = {
    provider: "google_analytics",
    asset: "property",
    title: "Google Analytics (GA4)",
    tenantId,
    externalAccountId: googleRow?.ga4_property_id ?? null,
    displayName: googleRow?.ga4_property_display_name || (googleRow?.ga4_property_id ? `GA4: ${googleRow.ga4_property_id}` : ga4AccountReady ? "Google OAuth Connected (Select Property)" : null),
    handle: googleRow?.ga4_property_id ?? null,
    publicUrl: null,
    connectionState: ga4Connected
      ? "CONNECTED"
      : ga4AccountReady
      ? "CONNECTED" // Account is authenticated, property selection available
      : ga4Reauth
      ? "REAUTH_REQUIRED"
      : "NOT_CONNECTED",
    authState: ga4AccountReady ? "AUTHENTICATED" : ga4Reauth ? "EXPIRED" : "UNAUTHENTICATED",
    healthState: ga4Connected ? "HEALTHY" : ga4AccountReady ? "DEGRADED" : "UNKNOWN",
    capabilities: ["traffic_analytics", "conversion_tracking", "session_metrics"],
    lastSyncedAt: googleRow?.ga4_last_synced_at ?? googleRow?.updated_at ?? null,
    reauthRequired: Boolean(ga4Reauth),
    isDiscoveredPublicly: false,
    isOAuth: true,
    provenance: ga4AccountReady ? "oauth_authenticated" : "unknown",
    error: ga4Reauth ? (ga4Error || "Google Analytics authorization expired") : null,
  };

  // 7. Google Search Console -- same fix as GA4 above: "connected" status
  // without a usable stored refresh token is REAUTH_REQUIRED, not CONNECTED.
  const scHasUsableToken = Boolean(googleRow?.encrypted_refresh_token_ref);
  const scConnected = Boolean(googleRow && googleRow.status === "connected" && googleRow.search_console_site_url && scHasUsableToken);
  const scAccountReady = Boolean(googleRow && googleRow.status === "connected" && scHasUsableToken);
  const scReauth = Boolean(
    googleRow && (googleRow.status === "revoked" || googleRow.status === "error" || (googleRow.status === "connected" && !scHasUsableToken))
  );
  const scError = googleRow?.last_error ?? null;

  const googleSearchConsoleStatus: CanonicalConnectionStatus = {
    provider: "google_search_console",
    asset: "property",
    title: "Google Search Console",
    tenantId,
    externalAccountId: googleRow?.search_console_site_url ?? null,
    displayName: googleRow?.search_console_site_url || (scAccountReady ? "Google OAuth Connected (Select Property)" : null),
    handle: googleRow?.search_console_site_url ?? null,
    publicUrl: googleRow?.search_console_site_url ?? null,
    connectionState: scConnected
      ? "CONNECTED"
      : scAccountReady
      ? "CONNECTED"
      : scReauth
      ? "REAUTH_REQUIRED"
      : "NOT_CONNECTED",
    authState: scAccountReady ? "AUTHENTICATED" : scReauth ? "EXPIRED" : "UNAUTHENTICATED",
    healthState: scConnected ? "HEALTHY" : scAccountReady ? "DEGRADED" : "UNKNOWN",
    capabilities: ["search_indexing", "keyword_impressions", "crawl_errors"],
    lastSyncedAt: googleRow?.search_console_last_synced_at ?? googleRow?.updated_at ?? null,
    reauthRequired: Boolean(scReauth),
    isDiscoveredPublicly: false,
    isOAuth: true,
    provenance: scAccountReady ? "oauth_authenticated" : "unknown",
    error: scReauth ? (scError || "Google Search Console authorization expired") : null,
  };

  // 8. WhatsApp Verified Number
  // "disabled" (POST /api/platform/integrations/disconnect's own doing --
  // a deliberate customer action) and "revoked" (the provider invalidated
  // it -- an actual error) are different signals and must not collapse
  // into the same REAUTH_REQUIRED state: a customer who just clicked
  // Disconnect must see a clean not-connected card, never something that
  // reads as "something is broken, please fix it."
  const activeWa = waRows.find((r) => r.status === "active");
  const revokedWa = waRows.find((r) => r.status === "revoked");
  const disabledWa = waRows.find((r) => r.status === "disabled");
  const waRawFromBrain = typeof brandContent.whatsapp_number === "string" ? brandContent.whatsapp_number : null;

  const whatsappStatus: CanonicalConnectionStatus = {
    provider: "whatsapp",
    asset: "phone",
    title: "WhatsApp Number",
    tenantId,
    externalAccountId: activeWa?.display_phone_number ?? activeWa?.id ?? null,
    displayName: activeWa?.display_phone_number || waRawFromBrain || null,
    handle: activeWa?.display_phone_number || waRawFromBrain || null,
    publicUrl: null,
    connectionState: activeWa
      ? "CONNECTED"
      : revokedWa
      ? "REAUTH_REQUIRED"
      : waRawFromBrain && !disabledWa
      ? "DISCOVERED_PUBLICLY"
      : "NOT_CONNECTED",
    authState: activeWa ? "AUTHENTICATED" : "UNAUTHENTICATED",
    healthState: activeWa ? "HEALTHY" : revokedWa ? "DEGRADED" : "UNKNOWN",
    capabilities: ["lead_alerts", "audit_delivery", "client_messaging"],
    lastSyncedAt: activeWa?.verified_at ?? activeWa?.updated_at ?? null,
    reauthRequired: Boolean(revokedWa && !activeWa),
    isDiscoveredPublicly: Boolean(waRawFromBrain && !activeWa && !disabledWa),
    isOAuth: false,
    provenance: activeWa ? "otp_verified" : waRawFromBrain ? "customer_supplied" : "unknown",
    error: revokedWa && !activeWa ? "WhatsApp number verification revoked. Please re-verify." : null,
  };

  const connections: Record<V1DigitalPresencePlatform, CanonicalConnectionStatus> = {
    website: websiteStatus,
    google_business: googleBusinessStatus,
    instagram: instagramStatus,
    facebook: facebookStatus,
    youtube: youtubeStatus,
    google_analytics: googleAnalyticsStatus,
    google_search_console: googleSearchConsoleStatus,
    whatsapp: whatsappStatus,
  };

  const connectedCount = Object.values(connections).filter((c) => c.connectionState === "CONNECTED").length;
  const discoveredCount = Object.values(connections).filter((c) => c.connectionState === "DISCOVERED_PUBLICLY").length;

  return {
    tenantId,
    connections,
    connectedCount,
    discoveredCount,
    lastUpdated: now,
  };
});

/**
 * Resolves a single provider's connection status.
 */
export async function getBusinessConnectionStatus(
  supabase: SupabaseClient,
  tenantId: string,
  provider: V1DigitalPresencePlatform
): Promise<CanonicalConnectionStatus> {
  const summary = await getTenantDigitalPresence(supabase, tenantId);
  return summary.connections[provider];
}
