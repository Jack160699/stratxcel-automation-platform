import type { SearchDb } from "../repository.ts";
import type { SecretVault } from "@stratxcel/byok";
import type { ProviderConnection } from "../types.ts";
import { ProviderUnavailableError, type AnalyticsOutcomeProvider, type AnalyticsOutcomeSnapshot } from "../providers.ts";
import { getGoogleConnection } from "./repository.ts";
import { getLiveGoogleAccessToken, GoogleNotConnectedError, GooglePermissionLostError } from "./access-token.ts";

/**
 * Google Analytics (GA4) — verified contract (fetched from official docs
 * during this task):
 *  - GET  https://analyticsadmin.googleapis.com/v1beta/accountSummaries
 *         (Google Analytics Admin API v1beta — property listing via
 *         propertySummaries[]. pageSize max 200.)
 *  - POST https://analyticsdata.googleapis.com/v1beta/{property=properties/*}:runReport
 *         (Google Analytics Data API v1beta)
 *  - Scope: https://www.googleapis.com/auth/analytics.readonly
 *  - Terminology: Google renamed "conversions" to "key events" in the GA4
 *    UI; the Data API's current metric API name is `keyEvents` (the older
 *    `conversions` metric name is retained only as a deprecated alias per
 *    Google's API schema). This adapter requests `keyEvents` and maps it to
 *    the existing AnalyticsOutcomeSnapshot.conversions field — the
 *    *application* semantics ("something GA4 recorded as a completed goal")
 *    are preserved even though the underlying GA4 terminology changed.
 *  - Organic search is isolated via the `sessionDefaultChannelGroup`
 *    dimension filtered to the exact value "Organic Search" — GA4's
 *    standard default channel grouping value for unpaid search traffic.
 */

const GA4_ADMIN_API_BASE = "https://analyticsadmin.googleapis.com/v1beta";
const GA4_DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const DEFAULT_WINDOW_DAYS = 28;
const ROW_LIMIT = 1000; // Bounded — far under the Data API's 250,000-row ceiling.
const MAX_ACCOUNT_SUMMARY_PAGES = 5; // Bounded pagination — 5 * 200 = up to 1,000 properties, ample for any real tenant.

export interface Ga4Property {
  propertyId: string; // numeric ID, "properties/" prefix stripped
  displayName: string;
  accountDisplayName: string;
}

function classifyGa4Error(status: number, body: string): ProviderUnavailableError {
  if (status === 401 || status === 403) {
    return new ProviderUnavailableError("permission_required", `GA4 denied access (HTTP ${status}). The connected Google account may no longer have permission on this property.`);
  }
  if (status === 400 || status === 404) {
    return new ProviderUnavailableError("configuration_required", "The selected GA4 property is invalid or no longer accessible to this Google account.");
  }
  return new ProviderUnavailableError("error", `GA4 API error: HTTP ${status} ${body.slice(0, 200)}`);
}

interface AccountSummary {
  displayName?: string;
  propertySummaries?: Array<{ property?: string; displayName?: string }>;
}

/** Lists GA4 properties the authorized Google account can access, via the Admin API's accountSummaries.list, bounded pagination. */
export async function listGa4Properties(accessToken: string): Promise<Ga4Property[]> {
  const properties: Ga4Property[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams({ pageSize: "200" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${GA4_ADMIN_API_BASE}/accountSummaries?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw classifyGa4Error(response.status, body);
    }
    const result = (await response.json()) as { accountSummaries?: AccountSummary[]; nextPageToken?: string };
    for (const account of result.accountSummaries ?? []) {
      for (const summary of account.propertySummaries ?? []) {
        if (!summary.property) continue;
        properties.push({
          propertyId: summary.property.replace(/^properties\//, ""),
          displayName: summary.displayName ?? summary.property,
          accountDisplayName: account.displayName ?? "",
        });
      }
    }
    pageToken = result.nextPageToken;
    pages += 1;
  } while (pageToken && pages < MAX_ACCOUNT_SUMMARY_PAGES);

  return properties;
}

function boundedWindow(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (DEFAULT_WINDOW_DAYS - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

interface RunReportRow {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

async function runOrganicLandingPageReport(accessToken: string, propertyId: string, window: { startDate: string; endDate: string }): Promise<RunReportRow[]> {
  const response = await fetch(`${GA4_DATA_API_BASE}/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: window.startDate, endDate: window.endDate }],
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "keyEvents" }],
      dimensionFilter: {
        filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search" } },
      },
      limit: String(ROW_LIMIT),
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw classifyGa4Error(response.status, body);
  }
  const result = (await response.json()) as { rows?: RunReportRow[] };
  return result.rows ?? [];
}

/**
 * Real, tenant-scoped GA4 adapter. Same "connection() is a cheap
 * DB-derived pre-check; the truthful, persisted state comes from the
 * outcome of readOutcomes()" design as the Search Console adapter — see
 * that file's doc comment for the reasoning.
 */
export function createGoogleAnalyticsProvider(input: { db: SearchDb; vault: SecretVault; tenantId: string }): AnalyticsOutcomeProvider {
  const { db, vault, tenantId } = input;

  return {
    async connection(): Promise<ProviderConnection> {
      const connection = await getGoogleConnection(db, tenantId);
      if (!connection || connection.status === "disconnected") {
        return { provider: "ga4", state: "not_connected", reason: "Google is not connected for this workspace." };
      }
      if (connection.status === "revoked" || connection.status === "error") {
        return { provider: "ga4", state: "permission_required", reason: connection.last_error ?? "Google access needs to be reconnected." };
      }
      if (!connection.ga4_property_id) {
        return { provider: "ga4", state: "configuration_required", reason: "No GA4 property has been selected yet." };
      }
      return {
        provider: "ga4",
        state: "connected",
        reason: "Connected.",
        lastSuccessfulSyncAt: connection.ga4_last_synced_at ?? undefined,
      };
    },

    async readOutcomes(readTenantId: string, _propertyUrl: string): Promise<AnalyticsOutcomeSnapshot> {
      if (readTenantId !== tenantId) throw new ProviderUnavailableError("permission_required", "Tenant mismatch for GA4 read.");

      const connection = await getGoogleConnection(db, tenantId);
      if (!connection?.ga4_property_id) throw new ProviderUnavailableError("configuration_required", "No GA4 property has been selected yet.");

      let accessToken: string;
      try {
        accessToken = await getLiveGoogleAccessToken(db, vault, tenantId);
      } catch (err) {
        if (err instanceof GoogleNotConnectedError) throw new ProviderUnavailableError("not_connected", err.message);
        if (err instanceof GooglePermissionLostError) throw new ProviderUnavailableError("permission_required", err.message);
        throw new ProviderUnavailableError("error", err instanceof Error ? err.message : "Failed to obtain a Google access token.");
      }

      const window = boundedWindow();
      const rows = await runOrganicLandingPageReport(accessToken, connection.ga4_property_id, window);

      // Parses a metricValues[i].value string into a number WITHOUT defaulting a
      // missing/malformed value to 0 first — GA4 always returns a value for
      // every metric it actually reports on a row, so an absent entry here
      // means the metric genuinely wasn't in the response (a short/malformed
      // row), which must surface as undefined, never a fabricated zero.
      const parseMetric = (value: string | undefined): number | undefined => {
        if (value === undefined) return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      };

      const landingPages = rows.map((row) => {
        const url = row.dimensionValues?.[0]?.value ?? "";
        const sessions = parseMetric(row.metricValues?.[0]?.value);
        const engagedSessions = parseMetric(row.metricValues?.[1]?.value);
        const keyEvents = parseMetric(row.metricValues?.[2]?.value);
        return {
          url,
          // organicVisits has no optional variant in AnalyticsOutcomeSnapshot —
          // only fall back to 0 when GA4 truly reported nothing for sessions.
          organicVisits: sessions ?? 0,
          engagedSessions,
          // Mapped from GA4's `keyEvents` metric (formerly "conversions" in the UI/API) —
          // never fabricated when GA4 reports zero or omits the metric for a row.
          conversions: keyEvents,
          // formSubmissions / contactClicks / attributedLeads intentionally omitted:
          // GA4's standard API surface used here does not directly measure these
          // without tenant-specific custom event configuration this task does not add.
        };
      });

      return { landingPages };
    },
  };
}
