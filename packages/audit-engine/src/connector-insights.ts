import type { SupabaseClient } from "@supabase/supabase-js";
import { createDevEncryptedVault } from "@stratxcel/byok";
import {
  createGoogleAnalyticsProvider,
  createGoogleSearchConsoleProvider,
  getGoogleConnection,
} from "@stratxcel/search-discovery";
import type {
  ConnectorAvailabilityRecord,
  ConnectorAvailabilityState,
  ResearchClaim,
  ResearchResult,
  ResearchSource,
} from "@stratxcel/search-discovery";

type ServiceClient = SupabaseClient;

/** One connector's normalized state + (if available) its normalized data. Never invents data for a state other than "available". */
export interface ConnectorSection<T> {
  state: ConnectorAvailabilityState;
  reason: string | null;
  retrievedAt: string | null;
  timeWindow: string | null;
  data: T | null;
}

export interface GoogleSearchConsoleInsight {
  siteUrl: string;
  totalClicks: number;
  totalImpressions: number;
  averageCtr: number;
  averagePosition: number | null;
  topQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
  topPages: Array<{ page: string; clicks: number; impressions: number }>;
}

export interface GoogleAnalyticsInsight {
  propertyId: string;
  totalOrganicSessions: number;
  totalEngagedSessions: number | null;
  totalKeyEvents: number | null;
  topLandingPages: Array<{ url: string; organicVisits: number; engagedSessions?: number; conversions?: number }>;
}

export interface SocialAccountInsight {
  platform: "facebook" | "instagram";
  username: string | null;
  followerCount: number | null;
  recentPostCount: number | null;
  mostRecentPostAt: string | null;
  postWindowDays: number;
}

export interface GoogleBusinessInsight {
  displayName: string | null;
  category: string | null;
  address: string | null;
  websiteUri: string | null;
  connectedSince: string | null;
}

export interface AuditConnectorInsights {
  searchConsole: ConnectorSection<GoogleSearchConsoleInsight>;
  analytics: ConnectorSection<GoogleAnalyticsInsight>;
  facebook: ConnectorSection<SocialAccountInsight>;
  instagram: ConnectorSection<SocialAccountInsight>;
  googleBusiness: ConnectorSection<GoogleBusinessInsight>;
}

/** Facebook/Instagram/Google Business live in the Next.js app layer (lib/social) — audit-engine
 * has no dependency path there, so this app-supplied provider is injected rather than imported. */
export interface SocialConnectorInsightsProvider {
  gather(tenantId: string): Promise<{
    facebook: ConnectorSection<SocialAccountInsight>;
    instagram: ConnectorSection<SocialAccountInsight>;
    googleBusiness: ConnectorSection<GoogleBusinessInsight>;
  }>;
}

function unavailable<T>(state: ConnectorAvailabilityState, reason: string): ConnectorSection<T> {
  return { state, reason, retrievedAt: null, timeWindow: null, data: null };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

const CONNECTOR_FETCH_TIMEOUT_MS = 8_000;

/**
 * Google (GA4 + Search Console) live inside packages/ already — self-contained,
 * no app-layer dependency needed. Each provider is fetched independently: a
 * GA4 failure must never prevent a Search Console read, and vice versa.
 */
export async function gatherGoogleConnectorInsights(
  client: ServiceClient,
  tenantId: string,
): Promise<{ searchConsole: ConnectorSection<GoogleSearchConsoleInsight>; analytics: ConnectorSection<GoogleAnalyticsInsight> }> {
  const vault = createDevEncryptedVault(client);
  const connection = await getGoogleConnection(client, tenantId).catch(() => null);
  const retrievedAt = new Date().toISOString();

  const searchConsole = await (async (): Promise<ConnectorSection<GoogleSearchConsoleInsight>> => {
    if (!connection || connection.status === "disconnected") {
      return unavailable("not_connected", "Google Search Console is not connected for this workspace.");
    }
    if (connection.status === "revoked" || connection.status === "error") {
      return unavailable("permission_required", connection.last_error ?? "Google access needs to be reconnected.");
    }
    if (!connection.search_console_site_url) {
      return unavailable("unavailable", "No Search Console property has been selected yet.");
    }
    try {
      const provider = createGoogleSearchConsoleProvider({ db: client, vault, tenantId });
      const snapshot = await withTimeout(
        provider.readSnapshot(tenantId, connection.search_console_site_url),
        CONNECTOR_FETCH_TIMEOUT_MS,
        "search_console",
      );
      if (snapshot.rows.length === 0) {
        return {
          state: "no_data",
          reason: "Search Console returned zero rows for the last 28 days.",
          retrievedAt,
          timeWindow: `${snapshot.periodStart} to ${snapshot.periodEnd}`,
          data: null,
        };
      }
      const totalClicks = snapshot.rows.reduce((sum, row) => sum + row.clicks, 0);
      const totalImpressions = snapshot.rows.reduce((sum, row) => sum + row.impressions, 0);
      const byQuery = new Map<string, { clicks: number; impressions: number; ctrSum: number; posSum: number; n: number }>();
      const byPage = new Map<string, { clicks: number; impressions: number }>();
      for (const row of snapshot.rows) {
        if (row.query) {
          const acc = byQuery.get(row.query) ?? { clicks: 0, impressions: 0, ctrSum: 0, posSum: 0, n: 0 };
          acc.clicks += row.clicks;
          acc.impressions += row.impressions;
          acc.ctrSum += row.ctr;
          acc.posSum += row.position;
          acc.n += 1;
          byQuery.set(row.query, acc);
        }
        if (row.page) {
          const acc = byPage.get(row.page) ?? { clicks: 0, impressions: 0 };
          acc.clicks += row.clicks;
          acc.impressions += row.impressions;
          byPage.set(row.page, acc);
        }
      }
      const topQueries = [...byQuery.entries()]
        .sort((a, b) => b[1].impressions - a[1].impressions)
        .slice(0, 5)
        .map(([query, v]) => ({
          query,
          clicks: v.clicks,
          impressions: v.impressions,
          ctr: v.n ? v.ctrSum / v.n : 0,
          position: v.n ? v.posSum / v.n : 0,
        }));
      const topPages = [...byPage.entries()]
        .sort((a, b) => b[1].impressions - a[1].impressions)
        .slice(0, 5)
        .map(([page, v]) => ({ page, clicks: v.clicks, impressions: v.impressions }));
      return {
        state: "available",
        reason: null,
        retrievedAt,
        timeWindow: `${snapshot.periodStart} to ${snapshot.periodEnd}`,
        data: {
          siteUrl: connection.search_console_site_url,
          totalClicks,
          totalImpressions,
          averageCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
          averagePosition: snapshot.rows.length
            ? snapshot.rows.reduce((s, r) => s + r.position, 0) / snapshot.rows.length
            : null,
          topQueries,
          topPages,
        },
      };
    } catch (err) {
      return unavailable(
        classifyProviderError(err),
        err instanceof Error ? err.message : "Search Console read failed.",
      );
    }
  })();

  const analytics = await (async (): Promise<ConnectorSection<GoogleAnalyticsInsight>> => {
    if (!connection || connection.status === "disconnected") {
      return unavailable("not_connected", "Google Analytics is not connected for this workspace.");
    }
    if (connection.status === "revoked" || connection.status === "error") {
      return unavailable("permission_required", connection.last_error ?? "Google access needs to be reconnected.");
    }
    if (!connection.ga4_property_id) {
      return unavailable("unavailable", "No GA4 property has been selected yet.");
    }
    try {
      const provider = createGoogleAnalyticsProvider({ db: client, vault, tenantId });
      const snapshot = await withTimeout(
        provider.readOutcomes(tenantId, ""),
        CONNECTOR_FETCH_TIMEOUT_MS,
        "ga4",
      );
      if (snapshot.landingPages.length === 0) {
        return {
          state: "no_data",
          reason: "GA4 returned zero organic-search landing pages for the last 28 days.",
          retrievedAt,
          timeWindow: `${snapshot.periodStart} to ${snapshot.periodEnd}`,
          data: null,
        };
      }
      const totalOrganicSessions = snapshot.landingPages.reduce((s, p) => s + p.organicVisits, 0);
      const engagedValues = snapshot.landingPages.map((p) => p.engagedSessions).filter((v): v is number => v != null);
      const keyEventValues = snapshot.landingPages.map((p) => p.conversions).filter((v): v is number => v != null);
      return {
        state: "available",
        reason: null,
        retrievedAt,
        timeWindow: `${snapshot.periodStart} to ${snapshot.periodEnd}`,
        data: {
          propertyId: connection.ga4_property_id,
          totalOrganicSessions,
          totalEngagedSessions: engagedValues.length ? engagedValues.reduce((a, b) => a + b, 0) : null,
          totalKeyEvents: keyEventValues.length ? keyEventValues.reduce((a, b) => a + b, 0) : null,
          topLandingPages: [...snapshot.landingPages]
            .sort((a, b) => b.organicVisits - a.organicVisits)
            .slice(0, 5),
        },
      };
    } catch (err) {
      return unavailable(classifyProviderError(err), err instanceof Error ? err.message : "GA4 read failed.");
    }
  })();

  return { searchConsole, analytics };
}

function classifyProviderError(err: unknown): ConnectorAvailabilityState {
  const message = err instanceof Error ? err.message : String(err);
  if (/permission|401|403/i.test(message)) return "permission_required";
  if (/timeout/i.test(message)) return "provider_error";
  return "provider_error";
}

/** Gathers every connector this audit can draw on for one tenant. Every section
 * resolves independently — one broken/unconnected provider never blocks another. */
export async function gatherAuditConnectorInsights(
  client: ServiceClient,
  tenantId: string,
  socialInsights?: SocialConnectorInsightsProvider,
): Promise<AuditConnectorInsights> {
  const [google, social] = await Promise.all([
    gatherGoogleConnectorInsights(client, tenantId).catch(
      (): { searchConsole: ConnectorSection<GoogleSearchConsoleInsight>; analytics: ConnectorSection<GoogleAnalyticsInsight> } => ({
        searchConsole: unavailable("provider_error", "Google connector lookup failed."),
        analytics: unavailable("provider_error", "Google connector lookup failed."),
      }),
    ),
    socialInsights
      ? withTimeout(socialInsights.gather(tenantId), CONNECTOR_FETCH_TIMEOUT_MS * 2, "social_insights").catch(
          (): { facebook: ConnectorSection<SocialAccountInsight>; instagram: ConnectorSection<SocialAccountInsight>; googleBusiness: ConnectorSection<GoogleBusinessInsight> } => ({
            facebook: unavailable("provider_error", "Social connector lookup failed."),
            instagram: unavailable("provider_error", "Social connector lookup failed."),
            googleBusiness: unavailable("provider_error", "Social connector lookup failed."),
          }),
        )
      : Promise.resolve({
          facebook: unavailable<SocialAccountInsight>("not_connected", "Not checked for this audit run."),
          instagram: unavailable<SocialAccountInsight>("not_connected", "Not checked for this audit run."),
          googleBusiness: unavailable<GoogleBusinessInsight>("not_connected", "Not checked for this audit run."),
        }),
  ]);

  return {
    searchConsole: google.searchConsole,
    analytics: google.analytics,
    facebook: social.facebook,
    instagram: social.instagram,
    googleBusiness: social.googleBusiness,
  };
}

interface SourceSpec {
  provider: ResearchSource["provider"];
  domain: string;
  url: string;
  title: string;
}

const SOURCE_SPECS: Record<keyof AuditConnectorInsights, SourceSpec> = {
  searchConsole: { provider: "search_console", domain: "search.google.com", url: "https://search.google.com/search-console", title: "Google Search Console — Search Performance" },
  analytics: { provider: "google_analytics", domain: "analytics.google.com", url: "https://analytics.google.com/", title: "Google Analytics 4 — Organic Traffic" },
  facebook: { provider: "facebook", domain: "facebook.com", url: "https://facebook.com/", title: "Facebook Page — Account Activity" },
  instagram: { provider: "instagram", domain: "instagram.com", url: "https://instagram.com/", title: "Instagram Business Account — Account Activity" },
  googleBusiness: { provider: "google_business", domain: "business.google.com", url: "https://business.google.com/", title: "Google Business Profile" },
};

function claimsForSection(
  key: keyof AuditConnectorInsights,
  section: ConnectorSection<unknown>,
  sourceId: string,
  idx: () => number,
): ResearchClaim[] {
  if (section.state !== "available" || !section.data) return [];
  const claim = (text: string): ResearchClaim => ({
    id: `connector_claim_${idx()}`,
    text,
    sourceIds: [sourceId],
    confidence: null,
    sourceSupportStatus: "supported",
    statementKind: "sourced_fact",
  });
  const window = section.timeWindow ? ` (${section.timeWindow})` : "";
  switch (key) {
    case "searchConsole": {
      const d = section.data as GoogleSearchConsoleInsight;
      const claims = [
        claim(
          `Google Search Console for ${d.siteUrl} recorded ${d.totalClicks} clicks and ${d.totalImpressions} impressions${window}, an average CTR of ${(d.averageCtr * 100).toFixed(2)}%.`,
        ),
      ];
      if (d.topQueries[0]) {
        const q = d.topQueries[0];
        claims.push(
          claim(
            `The top Search Console query "${q.query}" had ${q.impressions} impressions and ${q.clicks} clicks (${(q.ctr * 100).toFixed(2)}% CTR, average position ${q.position.toFixed(1)})${window}.`,
          ),
        );
      }
      return claims;
    }
    case "analytics": {
      const d = section.data as GoogleAnalyticsInsight;
      const claims = [
        claim(
          `Google Analytics 4 recorded ${d.totalOrganicSessions} organic search sessions${window}${d.totalKeyEvents != null ? ` with ${d.totalKeyEvents} key events (conversions)` : ""}.`,
        ),
      ];
      if (d.topLandingPages[0]) {
        const p = d.topLandingPages[0];
        claims.push(claim(`The top organic landing page ${p.url} received ${p.organicVisits} organic sessions${window}.`));
      }
      return claims;
    }
    case "facebook":
    case "instagram": {
      const d = section.data as SocialAccountInsight;
      const parts: string[] = [];
      if (d.followerCount != null) parts.push(`${d.followerCount} followers`);
      if (d.recentPostCount != null) parts.push(`${d.recentPostCount} posts in the last ${d.postWindowDays} days`);
      if (parts.length === 0) return [];
      return [
        claim(
          `The connected ${key === "facebook" ? "Facebook Page" : "Instagram Business account"}${d.username ? ` (@${d.username})` : ""} has ${parts.join(" and ")}${d.mostRecentPostAt ? `, most recent post ${d.mostRecentPostAt}` : ""}.`,
        ),
      ];
    }
    case "googleBusiness": {
      const d = section.data as GoogleBusinessInsight;
      const known = [
        d.category ? `category "${d.category}"` : null,
        d.address ? "a listed address" : "no listed address",
        d.websiteUri ? "a listed website" : "no listed website on the profile",
      ].filter(Boolean);
      return [
        claim(
          `The connected Google Business Profile "${d.displayName ?? "this business"}" has ${known.join(", ")}${d.connectedSince ? ` (connected since ${d.connectedSince})` : ""}.`,
        ),
      ];
    }
    default:
      return [];
  }
}

/**
 * Appends connector-derived evidence to a research result the same way
 * mergeFirstPartyDiscoverySources appends the website crawl: additive,
 * never replaces existing sources/claims. Every "available" section becomes
 * exactly one ResearchSource (so the AI can cite it) plus 1-2 deterministic,
 * code-computed ResearchClaims stating the real numbers — never AI-invented.
 * Every section (available or not) is recorded in connectorAvailability so
 * the customer report can honestly show what was/wasn't used.
 */
export function mergeConnectorInsightSources(
  research: ResearchResult,
  insights: AuditConnectorInsights,
): ResearchResult {
  const extraSources: ResearchSource[] = [];
  const extraClaims: ResearchClaim[] = [];
  const availability: ConnectorAvailabilityRecord[] = [];
  let claimCounter = 0;
  const nextClaimIndex = () => ++claimCounter;

  (Object.keys(insights) as Array<keyof AuditConnectorInsights>).forEach((key) => {
    const section = insights[key];
    availability.push({
      provider: SOURCE_SPECS[key].provider,
      state: section.state,
      reason: section.reason,
      retrievedAt: section.retrievedAt,
      timeWindow: section.timeWindow,
    });
    if (section.state !== "available" || !section.data) return;
    const spec = SOURCE_SPECS[key];
    const sourceId = `connector_${spec.provider}`;
    extraSources.push({
      id: sourceId,
      url: spec.url,
      canonicalUrl: spec.url,
      title: spec.title,
      domain: spec.domain,
      provider: spec.provider,
      retrievedAt: section.retrievedAt ?? new Date().toISOString(),
      searchQueries: [],
      sourceType: "PRIMARY",
      verification: "verified",
    });
    extraClaims.push(...claimsForSection(key, section, sourceId, nextClaimIndex));
  });

  if (extraSources.length === 0) {
    return { ...research, connectorAvailability: availability };
  }

  return {
    ...research,
    sources: [...research.sources, ...extraSources],
    claims: [...research.claims, ...extraClaims],
    evidenceArtifactIds: [...research.evidenceArtifactIds, ...extraSources.map((s) => s.id)],
    connectorAvailability: availability,
  };
}
