import type { QueryMetric } from "../types.ts";

export interface GscQueryPerformanceTruth {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number;
  landingPage?: string;
  isFirstPartyTruth: true;
  dataType: "FIRST_PARTY_SEARCH_CONSOLE_PERFORMANCE";
  distinctionNote: "Average position aggregated over user impressions in Google Search Console, distinct from point-in-time live SERP ranking.";
}

export interface GscFirstPartyPerformanceSummary {
  siteUrl: string;
  periodStart?: string;
  periodEnd?: string;
  totalClicks: number;
  totalImpressions: number;
  averageCtr: number;
  averagePosition: number;
  queries: GscQueryPerformanceTruth[];
  topLandingPages: Array<{ page: string; clicks: number; impressions: number }>;
}

/**
 * Normalizes Google Search Console row data into truthful, first-party query performance records.
 * Preserves the architectural distinction between GSC aggregate performance and point-in-time SERP tracker.
 */
export function extractGscFirstPartyPerformance(
  metrics: QueryMetric[],
  options?: { siteUrl?: string; periodStart?: string; periodEnd?: string }
): GscFirstPartyPerformanceSummary {
  let totalClicks = 0;
  let totalImpressions = 0;
  let totalWeightedPosition = 0;

  const queries: GscQueryPerformanceTruth[] = [];
  const pageMap = new Map<string, { clicks: number; impressions: number }>();

  for (const m of metrics) {
    totalClicks += m.clicks;
    totalImpressions += m.impressions;
    totalWeightedPosition += m.position * m.impressions;

    queries.push({
      query: m.query,
      clicks: m.clicks,
      impressions: m.impressions,
      ctr: m.ctr,
      averagePosition: Math.round(m.position * 10) / 10,
      landingPage: m.page,
      isFirstPartyTruth: true,
      dataType: "FIRST_PARTY_SEARCH_CONSOLE_PERFORMANCE",
      distinctionNote: "Average position aggregated over user impressions in Google Search Console, distinct from point-in-time live SERP ranking.",
    });

    if (m.page) {
      const current = pageMap.get(m.page) ?? { clicks: 0, impressions: 0 };
      current.clicks += m.clicks;
      current.impressions += m.impressions;
      pageMap.set(m.page, current);
    }
  }

  const averageCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const averagePosition = totalImpressions > 0 ? totalWeightedPosition / totalImpressions : 0;

  const topLandingPages = Array.from(pageMap.entries())
    .map(([page, stats]) => ({ page, clicks: stats.clicks, impressions: stats.impressions }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  return {
    siteUrl: options?.siteUrl ?? "Verified Property",
    periodStart: options?.periodStart,
    periodEnd: options?.periodEnd,
    totalClicks,
    totalImpressions,
    averageCtr: Math.round(averageCtr * 10000) / 10000,
    averagePosition: Math.round(averagePosition * 10) / 10,
    queries: queries.sort((a, b) => b.impressions - a.impressions),
    topLandingPages,
  };
}
