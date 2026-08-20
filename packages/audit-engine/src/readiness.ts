import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";

export type AuditProviderKey =
  | "website"
  | "google_search_console"
  | "ga4"
  | "google_business"
  | "facebook"
  | "instagram"
  | "youtube"
  | "whatsapp"
  | "public_web_research";

export type AuditConnectionState =
  | "CONNECTED"
  | "CONNECTED_LIMITED"
  | "REAUTH_REQUIRED"
  | "NOT_CONNECTED"
  | "ERROR"
  | "UNSUPPORTED";

export interface AuditProviderReadiness {
  provider: AuditProviderKey;
  connectionState: AuditConnectionState;
  readCapability: boolean;
  /** Strictly false for Free Audit — Free tier has ZERO write/mutation authorization */
  writeCapability: boolean;
  scopes: string[];
  lastVerifiedAt: string | null;
  dataAvailable: boolean;
  dataFreshness: string | null;
  limitations: string[];
  reasonIfUnavailable: string | null;
}

export interface AuditDataReadinessReport {
  tenantId: string;
  providers: Record<AuditProviderKey, AuditProviderReadiness>;
  totalConnectedCount: number;
  dataCoveragePercentage: number;
  evaluatedAt: string;
}

const PROVIDER_SCOPES: Record<AuditProviderKey, string[]> = {
  website: ["read:public_html", "read:sitemap", "read:robots"],
  google_search_console: ["https://www.googleapis.com/auth/webmasters.readonly"],
  ga4: ["https://www.googleapis.com/auth/analytics.readonly"],
  google_business: ["https://www.googleapis.com/auth/business.manage"],
  facebook: ["public_profile", "pages_read_engagement"],
  instagram: ["instagram_basic", "instagram_manage_insights"],
  youtube: ["https://www.googleapis.com/auth/youtube.readonly"],
  whatsapp: ["whatsapp_business_messaging"],
  public_web_research: ["read:public_search", "read:grounded_citations"],
};

function isReauth(status: string | null | undefined, tokenHealth: string | null | undefined): boolean {
  if (!status) return false;
  const s = String(status).toUpperCase();
  if (s === "DISCONNECTED") return false;
  if (s === "RECONNECT_REQUIRED") return true;
  const th = String(tokenHealth).toUpperCase();
  return th === "EXPIRED" || th === "REVOKED";
}

/**
 * Deterministically evaluates the verified data readiness for a tenant for the FREE AUDIT.
 * Strictly adheres to ground-truth database records without inventing fake connection states.
 */
export async function evaluateAuditDataReadiness(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<AuditDataReadinessReport> {
  const evaluatedAt = new Date().toISOString();

  const [googleRes, socialRes, waRes, brandBrain] = await Promise.all([
    supabase
      .from("search_google_connections")
      .select("id, status, search_console_site_url, search_console_last_synced_at, ga4_property_id, ga4_property_display_name, ga4_last_synced_at, last_error, updated_at")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("social_accounts")
      .select("id, platform, provider_account_id, username, display_name, status, token_health, last_sync_at, updated_at")
      .eq("tenant_id", tenantId),
    supabase
      .from("whatsapp_phone_bindings")
      .select("id, status, display_phone_number, verified_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    getCurrentBrandBrain(supabase, tenantId).catch(() => null),
  ]);

  const googleRow = googleRes.data;
  const socialRows = socialRes.data ?? [];
  const waRows = waRes.data ?? [];
  const brandContent = (brandBrain?.content ?? {}) as Record<string, unknown>;

  const findSocial = (platform: string) =>
    socialRows.find((r) => String(r.platform).toLowerCase() === platform.toLowerCase());

  // 1. Website Readiness
  const websiteUrl = typeof brandContent.website_url === "string" ? brandContent.website_url.trim() : "";
  const hasWebsite = Boolean(websiteUrl && (websiteUrl.startsWith("http://") || websiteUrl.startsWith("https://")));
  const websiteReadiness: AuditProviderReadiness = {
    provider: "website",
    connectionState: hasWebsite ? "CONNECTED" : "NOT_CONNECTED",
    readCapability: hasWebsite,
    writeCapability: false,
    scopes: PROVIDER_SCOPES.website,
    lastVerifiedAt: hasWebsite ? (brandBrain?.updated_at ?? evaluatedAt) : null,
    dataAvailable: hasWebsite,
    dataFreshness: hasWebsite ? "Live On-Demand Crawl" : null,
    limitations: hasWebsite ? [] : ["Website URL required for crawl & technical SEO audit"],
    reasonIfUnavailable: hasWebsite ? null : "No valid website URL provided in business profile.",
  };

  // 2. Google Search Console Readiness
  const scConnected = Boolean(googleRow && googleRow.status === "connected" && googleRow.search_console_site_url);
  const scReauth = Boolean(googleRow && (googleRow.status === "revoked" || googleRow.status === "error"));
  const scAccountOnly = Boolean(googleRow && googleRow.status === "connected" && !googleRow.search_console_site_url);
  const gscReadiness: AuditProviderReadiness = {
    provider: "google_search_console",
    connectionState: scReauth
      ? "REAUTH_REQUIRED"
      : scConnected
      ? "CONNECTED"
      : scAccountOnly
      ? "CONNECTED_LIMITED"
      : "NOT_CONNECTED",
    readCapability: scConnected,
    writeCapability: false,
    scopes: PROVIDER_SCOPES.google_search_console,
    lastVerifiedAt: googleRow?.search_console_last_synced_at ?? googleRow?.updated_at ?? null,
    dataAvailable: scConnected,
    dataFreshness: scConnected ? "Last 28 days (final dataState)" : null,
    limitations: scAccountOnly ? ["Google OAuth connected but Search Console property not selected."] : [],
    reasonIfUnavailable: scReauth
      ? (googleRow?.last_error || "Google authentication expired. Reconnection required.")
      : scConnected
      ? null
      : "Google Search Console is not connected.",
  };

  // 3. GA4 Readiness
  const ga4Connected = Boolean(googleRow && googleRow.status === "connected" && googleRow.ga4_property_id);
  const ga4AccountOnly = Boolean(googleRow && googleRow.status === "connected" && !googleRow.ga4_property_id);
  const ga4Readiness: AuditProviderReadiness = {
    provider: "ga4",
    connectionState: scReauth
      ? "REAUTH_REQUIRED"
      : ga4Connected
      ? "CONNECTED"
      : ga4AccountOnly
      ? "CONNECTED_LIMITED"
      : "NOT_CONNECTED",
    readCapability: ga4Connected,
    writeCapability: false,
    scopes: PROVIDER_SCOPES.ga4,
    lastVerifiedAt: googleRow?.ga4_last_synced_at ?? googleRow?.updated_at ?? null,
    dataAvailable: ga4Connected,
    dataFreshness: ga4Connected ? "Last 28 days organic landing sessions" : null,
    limitations: ga4AccountOnly ? ["Google OAuth connected but GA4 property not selected."] : [],
    reasonIfUnavailable: scReauth
      ? (googleRow?.last_error || "Google authentication expired. Reconnection required.")
      : ga4Connected
      ? null
      : "Google Analytics 4 is not connected.",
  };

  // 4. Google Business Profile Readiness
  const gbpRow = findSocial("google_business") || findSocial("google");
  const gbpConnected = Boolean(gbpRow && String(gbpRow.status).toUpperCase() === "CONNECTED");
  const gbpReauth = isReauth(gbpRow?.status, gbpRow?.token_health);
  const gbpReadiness: AuditProviderReadiness = {
    provider: "google_business",
    connectionState: gbpReauth
      ? "REAUTH_REQUIRED"
      : gbpConnected
      ? "CONNECTED"
      : "NOT_CONNECTED",
    readCapability: gbpConnected,
    writeCapability: false,
    scopes: PROVIDER_SCOPES.google_business,
    lastVerifiedAt: gbpRow?.last_sync_at ?? gbpRow?.updated_at ?? null,
    dataAvailable: gbpConnected,
    dataFreshness: gbpConnected ? "Synced Profile" : null,
    limitations: [],
    reasonIfUnavailable: gbpReauth
      ? "Google Business Profile authentication expired."
      : gbpConnected
      ? null
      : "Google Business Profile is not connected.",
  };

  // 5. Facebook Readiness
  const fbRow = findSocial("facebook");
  const fbConnected = Boolean(fbRow && String(fbRow.status).toUpperCase() === "CONNECTED");
  const fbReauth = isReauth(fbRow?.status, fbRow?.token_health);
  const fbReadiness: AuditProviderReadiness = {
    provider: "facebook",
    connectionState: fbReauth ? "REAUTH_REQUIRED" : fbConnected ? "CONNECTED" : "NOT_CONNECTED",
    readCapability: fbConnected,
    writeCapability: false,
    scopes: PROVIDER_SCOPES.facebook,
    lastVerifiedAt: fbRow?.last_sync_at ?? fbRow?.updated_at ?? null,
    dataAvailable: fbConnected,
    dataFreshness: fbConnected ? "Last 90 days page metrics" : null,
    limitations: [],
    reasonIfUnavailable: fbReauth ? "Facebook authentication expired." : fbConnected ? null : "Facebook Page is not connected.",
  };

  // 6. Instagram Readiness
  const igRow = findSocial("instagram");
  const igConnected = Boolean(igRow && String(igRow.status).toUpperCase() === "CONNECTED");
  const igReauth = isReauth(igRow?.status, igRow?.token_health);
  const igReadiness: AuditProviderReadiness = {
    provider: "instagram",
    connectionState: igReauth ? "REAUTH_REQUIRED" : igConnected ? "CONNECTED" : "NOT_CONNECTED",
    readCapability: igConnected,
    writeCapability: false,
    scopes: PROVIDER_SCOPES.instagram,
    lastVerifiedAt: igRow?.last_sync_at ?? igRow?.updated_at ?? null,
    dataAvailable: igConnected,
    dataFreshness: igConnected ? "Last 90 days account metrics" : null,
    limitations: [],
    reasonIfUnavailable: igReauth ? "Instagram authentication expired." : igConnected ? null : "Instagram Business account is not connected.",
  };

  // 7. YouTube Readiness
  const ytRow = findSocial("youtube");
  const ytConnected = Boolean(ytRow && String(ytRow.status).toUpperCase() === "CONNECTED");
  const ytReauth = isReauth(ytRow?.status, ytRow?.token_health);
  const ytReadiness: AuditProviderReadiness = {
    provider: "youtube",
    connectionState: ytReauth ? "REAUTH_REQUIRED" : ytConnected ? "CONNECTED" : "NOT_CONNECTED",
    readCapability: ytConnected,
    writeCapability: false,
    scopes: PROVIDER_SCOPES.youtube,
    lastVerifiedAt: ytRow?.last_sync_at ?? ytRow?.updated_at ?? null,
    dataAvailable: ytConnected,
    dataFreshness: ytConnected ? "Channel metadata" : null,
    limitations: [],
    reasonIfUnavailable: ytReauth ? "YouTube authentication expired." : ytConnected ? null : "YouTube channel is not connected.",
  };

  // 8. WhatsApp Readiness
  const activeWa = waRows.find((r) => String(r.status).toLowerCase() === "active" && r.display_phone_number);
  const waConnected = Boolean(activeWa);
  const waReadiness: AuditProviderReadiness = {
    provider: "whatsapp",
    connectionState: waConnected ? "CONNECTED" : "NOT_CONNECTED",
    readCapability: waConnected,
    writeCapability: false,
    scopes: PROVIDER_SCOPES.whatsapp,
    lastVerifiedAt: activeWa?.verified_at ?? activeWa?.updated_at ?? null,
    dataAvailable: waConnected,
    dataFreshness: waConnected ? "Verified number status" : null,
    limitations: [],
    reasonIfUnavailable: waConnected ? null : "WhatsApp Business number not verified.",
  };

  // 9. Public Web Research Readiness (Always available as grounded baseline)
  const publicWebReadiness: AuditProviderReadiness = {
    provider: "public_web_research",
    connectionState: "CONNECTED",
    readCapability: true,
    writeCapability: false,
    scopes: PROVIDER_SCOPES.public_web_research,
    lastVerifiedAt: evaluatedAt,
    dataAvailable: true,
    dataFreshness: "Live Grounded Research",
    limitations: [],
    reasonIfUnavailable: null,
  };

  const providers: Record<AuditProviderKey, AuditProviderReadiness> = {
    website: websiteReadiness,
    google_search_console: gscReadiness,
    ga4: ga4Readiness,
    google_business: gbpReadiness,
    facebook: fbReadiness,
    instagram: igReadiness,
    youtube: ytReadiness,
    whatsapp: waReadiness,
    public_web_research: publicWebReadiness,
  };

  const totalConnectedCount = Object.values(providers).filter(
    (p) => p.connectionState === "CONNECTED" || p.connectionState === "CONNECTED_LIMITED"
  ).length;

  const totalEligible = Object.keys(providers).length;
  const dataCoveragePercentage = Math.round((totalConnectedCount / totalEligible) * 100);

  return {
    tenantId,
    providers,
    totalConnectedCount,
    dataCoveragePercentage,
    evaluatedAt,
  };
}
