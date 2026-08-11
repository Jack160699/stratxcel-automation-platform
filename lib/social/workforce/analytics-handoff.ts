import type { AnalyticsMeasurementTarget, CanonicalPublishReceipt } from "./types.ts";

/**
 * Publishing receipt → analytics measurement targets.
 * Workstream 8 owns interpretation; Social only emits links/targets.
 */
export function emitAnalyticsMeasurementTarget(receipt: CanonicalPublishReceipt): AnalyticsMeasurementTarget {
  return {
    tenantId: receipt.tenantId,
    missionId: receipt.missionId,
    artifactId: receipt.artifactId,
    receiptId: `${receipt.artifactId}:${receipt.scheduleJobId ?? "none"}`,
    platform: String(receipt.platform),
    providerPublishId: receipt.providerPublishId,
    liveUrl: receipt.liveUrl,
    publishedAtIso: receipt.publishedAtIso,
    measurementHints: ["engagement", "reach", "impressions", "clicks", "saves"],
  };
}

export function analyticsHandoffEvent(target: AnalyticsMeasurementTarget): {
  name: "workforce.social.analytics_target";
  atIso: string;
  payload: AnalyticsMeasurementTarget;
} {
  return {
    name: "workforce.social.analytics_target",
    atIso: new Date().toISOString(),
    payload: target,
  };
}
