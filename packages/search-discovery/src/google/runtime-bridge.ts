import type { SearchDb } from "../repository.ts";
import type { SecretVault } from "@stratxcel/byok";
import type { ProviderConnection } from "../types.ts";
import { ProviderUnavailableError } from "../providers.ts";
import { createGoogleSearchConsoleProvider } from "./search-console-provider.ts";
import { createGoogleAnalyticsProvider } from "./analytics-provider.ts";
import { getGoogleConnection, markGoogleSyncTime } from "./repository.ts";

export interface ResolvedGoogleProviderSnapshot {
  dimensions: unknown;
  values: unknown;
  periodStart?: string;
  periodEnd?: string;
}

export interface ResolvedGoogleProviders {
  /** Final, truthful connection states — only ever "connected" once a real read has actually succeeded this run. */
  connections: ProviderConnection[];
  /** Keyed by provider name ("search_console" | "ga4"); only present when that provider's read succeeded this run. */
  snapshots: Record<string, ResolvedGoogleProviderSnapshot>;
}

/**
 * Independently resolves GSC + GA4 for one Search run. Each provider is
 * fetched inside its own try/catch — a Search Console failure must never
 * prevent a GA4 read from being attempted or saved, and vice versa
 * ("provider failure does not erase independent first-party findings").
 */
export async function resolveGoogleProviderStates(input: {
  db: SearchDb;
  vault: SecretVault;
  tenantId: string;
}): Promise<ResolvedGoogleProviders> {
  const { db, vault, tenantId } = input;
  const connections: ProviderConnection[] = [];
  const snapshots: Record<string, ResolvedGoogleProviderSnapshot> = {};

  const connectionRow = await getGoogleConnection(db, tenantId);

  const gscProvider = createGoogleSearchConsoleProvider({ db, vault, tenantId });
  const gscConnection = await gscProvider.connection();
  if (gscConnection.state === "connected" && connectionRow?.search_console_site_url) {
    try {
      const snapshot = await gscProvider.readSnapshot(tenantId, connectionRow.search_console_site_url);
      connections.push({ ...gscConnection, state: "connected", lastSuccessfulSyncAt: new Date().toISOString() });
      snapshots.search_console = {
        dimensions: { rowCount: snapshot.rows.length, propertyUrl: connectionRow.search_console_site_url },
        values: { rows: snapshot.rows },
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
      };
      await markGoogleSyncTime(db, tenantId, "search_console");
    } catch (err) {
      connections.push(toFailedConnection("search_console", err));
    }
  } else {
    connections.push(gscConnection);
  }

  const ga4Provider = createGoogleAnalyticsProvider({ db, vault, tenantId });
  const ga4Connection = await ga4Provider.connection();
  if (ga4Connection.state === "connected" && connectionRow?.ga4_property_id) {
    try {
      const snapshot = await ga4Provider.readOutcomes(tenantId, connectionRow.search_console_site_url ?? "");
      connections.push({ ...ga4Connection, state: "connected", lastSuccessfulSyncAt: new Date().toISOString() });
      snapshots.ga4 = {
        dimensions: { landingPageCount: snapshot.landingPages.length, propertyId: connectionRow.ga4_property_id },
        values: { landingPages: snapshot.landingPages },
      };
      await markGoogleSyncTime(db, tenantId, "ga4");
    } catch (err) {
      connections.push(toFailedConnection("ga4", err));
    }
  } else {
    connections.push(ga4Connection);
  }

  return { connections, snapshots };
}

function toFailedConnection(provider: "search_console" | "ga4", err: unknown): ProviderConnection {
  if (err instanceof ProviderUnavailableError) return { provider, state: err.state, reason: err.message };
  return { provider, state: "error", reason: err instanceof Error ? err.message : "Unknown provider error" };
}
