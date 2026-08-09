import type { SearchDb } from "../repository.ts";
import type { SecretVault } from "@stratxcel/byok";
import type { ProviderConnection, QueryMetric } from "../types.ts";
import { ProviderUnavailableError, type SearchConsoleProvider, type SearchConsoleSnapshot } from "../providers.ts";
import { getGoogleConnection } from "./repository.ts";
import { getLiveGoogleAccessToken, GoogleNotConnectedError, GooglePermissionLostError } from "./access-token.ts";

/**
 * Google Search Console API — verified contract (fetched from official
 * docs during this task):
 *  - GET  https://www.googleapis.com/webmasters/v3/sites
 *         (developers.google.com/webmaster-tools/v1/sites/list)
 *  - POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
 *         (developers.google.com/webmaster-tools/v1/searchanalytics/query)
 *    rowLimit valid range 1–25,000 (default 1,000); response rows carry
 *    keys[], clicks, impressions, ctr, position.
 *  - Scope: https://www.googleapis.com/auth/webmasters.readonly
 */

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const DEFAULT_WINDOW_DAYS = 28;
const GSC_DATA_LAG_DAYS = 3; // GSC performance data typically isn't final for the most recent ~2-3 days.
const ROW_LIMIT = 1000; // Bounded — well under the API's 25,000 ceiling; matches GA4's request bound below for a consistent snapshot size.

export interface GoogleSearchConsoleSite {
  siteUrl: string;
  permissionLevel: string;
}

function classifyGscError(status: number, body: string): ProviderUnavailableError {
  if (status === 401 || status === 403) {
    return new ProviderUnavailableError("permission_required", `Search Console denied access (HTTP ${status}). The connected Google account may no longer have permission on this property.`);
  }
  if (status === 404) {
    return new ProviderUnavailableError("configuration_required", "The selected Search Console property was not found for this Google account.");
  }
  return new ProviderUnavailableError("error", `Search Console API error: HTTP ${status} ${body.slice(0, 200)}`);
}

/** Lists the Search Console properties the authorized Google account can access. Excludes 'siteUnverifiedUser' entries — those grant no actual read access yet. */
export async function listSearchConsoleSites(accessToken: string): Promise<GoogleSearchConsoleSite[]> {
  const response = await fetch(`${GSC_API_BASE}/sites`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw classifyGscError(response.status, body);
  }
  const result = (await response.json()) as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> };
  return (result.siteEntry ?? []).filter((site) => site.permissionLevel !== "siteUnverifiedUser");
}

function boundedWindow(): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - GSC_DATA_LAG_DAYS);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (DEFAULT_WINDOW_DAYS - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

interface GscQueryRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

async function querySearchAnalytics(accessToken: string, siteUrl: string, window: { startDate: string; endDate: string }): Promise<GscQueryRow[]> {
  const response = await fetch(`${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: window.startDate,
      endDate: window.endDate,
      dimensions: ["query", "page"],
      rowLimit: ROW_LIMIT,
      dataState: "final",
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw classifyGscError(response.status, body);
  }
  const result = (await response.json()) as { rows?: GscQueryRow[] };
  return result.rows ?? [];
}

/**
 * Real, tenant-scoped Search Console adapter. `connection()` reports the
 * stored connection/configuration state without a live API call (kept
 * cheap so it can be checked independently of a full read); the runtime
 * caller is responsible for treating the OUTCOME of readSnapshot() — not
 * this optimistic pre-check — as the truthful, persisted availability
 * state, exactly as required: a provider is only ever recorded as
 * "connected" after a real authenticated request actually succeeds.
 */
export function createGoogleSearchConsoleProvider(input: { db: SearchDb; vault: SecretVault; tenantId: string }): SearchConsoleProvider {
  const { db, vault, tenantId } = input;

  return {
    async connection(): Promise<ProviderConnection> {
      const connection = await getGoogleConnection(db, tenantId);
      if (!connection || connection.status === "disconnected") {
        return { provider: "search_console", state: "not_connected", reason: "Google is not connected for this workspace." };
      }
      if (connection.status === "revoked" || connection.status === "error") {
        return { provider: "search_console", state: "permission_required", reason: connection.last_error ?? "Google access needs to be reconnected." };
      }
      if (!connection.search_console_site_url) {
        return { provider: "search_console", state: "configuration_required", reason: "No Search Console property has been selected yet." };
      }
      return {
        provider: "search_console",
        state: "connected",
        reason: "Connected.",
        lastSuccessfulSyncAt: connection.search_console_last_synced_at ?? undefined,
      };
    },

    async readSnapshot(readTenantId: string, propertyUrl: string): Promise<SearchConsoleSnapshot> {
      if (readTenantId !== tenantId) throw new ProviderUnavailableError("permission_required", "Tenant mismatch for Search Console read.");

      let accessToken: string;
      try {
        accessToken = await getLiveGoogleAccessToken(db, vault, tenantId);
      } catch (err) {
        if (err instanceof GoogleNotConnectedError) throw new ProviderUnavailableError("not_connected", err.message);
        if (err instanceof GooglePermissionLostError) throw new ProviderUnavailableError("permission_required", err.message);
        throw new ProviderUnavailableError("error", err instanceof Error ? err.message : "Failed to obtain a Google access token.");
      }

      const window = boundedWindow();
      const rows = await querySearchAnalytics(accessToken, propertyUrl, window);

      const mapped: QueryMetric[] = rows.map((row) => ({
        query: row.keys?.[0] ?? "",
        page: row.keys?.[1],
        impressions: row.impressions ?? 0,
        clicks: row.clicks ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      }));

      return { periodStart: window.startDate, periodEnd: window.endDate, rows: mapped };
    },
  };
}
