import type { MetricsRow } from "./repositories/analytics";

export interface LocalMetricsSummary {
  totalReach: number;
  totalImpressions: number;
  totalEngagements: number;
  engagementRatePercent: number;
  recentReach: number;
  previousReach: number;
  reachTrendPercent: number | null;
  text: string;
}

export function calculateLocalMetricsSummary(metrics: MetricsRow[]): LocalMetricsSummary {
  const totalReach = metrics.reduce((sum, item) => sum + (item.reach ?? 0), 0);
  const totalImpressions = metrics.reduce((sum, item) => sum + (item.impressions ?? 0), 0);
  const totalEngagements = metrics.reduce(
    (sum, item) => sum + (item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0) + (item.saves ?? 0),
    0
  );
  const engagementRatePercent = totalReach > 0 ? (totalEngagements / totalReach) * 100 : 0;
  const midpoint = Math.ceil(metrics.length / 2);
  const recentReach = metrics.slice(0, midpoint).reduce((sum, item) => sum + (item.reach ?? 0), 0);
  const previousReach = metrics.slice(midpoint).reduce((sum, item) => sum + (item.reach ?? 0), 0);
  const reachTrendPercent = previousReach > 0 ? ((recentReach - previousReach) / previousReach) * 100 : null;
  const trendText = reachTrendPercent === null
    ? "No earlier comparison period is available."
    : `Reach is ${Math.abs(reachTrendPercent).toFixed(1)}% ${reachTrendPercent >= 0 ? "higher" : "lower"} in the recent half of the selected period.`;

  return {
    totalReach,
    totalImpressions,
    totalEngagements,
    engagementRatePercent,
    recentReach,
    previousReach,
    reachTrendPercent,
    text: metrics.length === 0
      ? "No performance data has been collected for this workspace yet. Connect an account and allow the first analytics sync to finish, then try again."
      : `Workspace metrics summary: reach ${totalReach.toLocaleString()}, impressions ${totalImpressions.toLocaleString()}, engagements ${totalEngagements.toLocaleString()}, engagement rate ${engagementRatePercent.toFixed(2)}%. ${trendText}`,
  };
}
