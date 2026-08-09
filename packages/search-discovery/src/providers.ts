import type { ProviderConnection, QueryMetric } from "./types.ts";

export interface SearchConsoleSnapshot { periodStart: string; periodEnd: string; rows: QueryMetric[]; indexingState?: Array<{ url: string; state: string }>; }
export interface AnalyticsOutcomeSnapshot { periodStart: string; periodEnd: string; landingPages: Array<{ url: string; organicVisits: number; engagedSessions?: number; conversions?: number; formSubmissions?: number; contactClicks?: number; attributedLeads?: number }>; }
export interface SearchConsoleProvider { connection(): Promise<ProviderConnection>; readSnapshot(tenantId: string, propertyUrl: string): Promise<SearchConsoleSnapshot>; }
export interface AnalyticsOutcomeProvider { connection(): Promise<ProviderConnection>; readOutcomes(tenantId: string, propertyUrl: string): Promise<AnalyticsOutcomeSnapshot>; }

export class ProviderUnavailableError extends Error { readonly state: ProviderConnection["state"]; constructor(state: ProviderConnection["state"], message: string) { super(message); this.state = state; } }
export function createUnavailableSearchConsoleProvider(state: "not_connected" | "permission_required" | "configuration_required" = "not_connected"): SearchConsoleProvider {
  const reason = state === "permission_required" ? "Search Console permission is required." : state === "configuration_required" ? "Search Console credentials and an owned property must be configured." : "Search Console is not connected for this workspace.";
  return { async connection() { return { provider: "search_console", state, reason }; }, async readSnapshot() { throw new ProviderUnavailableError(state, reason); } };
}
export function createUnavailableAnalyticsProvider(state: "not_connected" | "permission_required" | "configuration_required" = "not_connected"): AnalyticsOutcomeProvider {
  const reason = state === "permission_required" ? "GA4 read permission is required." : state === "configuration_required" ? "A tenant-scoped GA4 property reader must be configured." : "GA4 is not connected for this workspace.";
  return { async connection() { return { provider: "ga4", state, reason }; }, async readOutcomes() { throw new ProviderUnavailableError(state, reason); } };
}
