/**
 * Provider Capability Health & Readiness Status
 */

export type ProviderHealthStatus = "READY" | "NOT_CONFIGURED" | "DEGRADED" | "FAILED";

export interface CapabilityHealthResult {
  capability: string;
  provider: string;
  status: ProviderHealthStatus;
  isReady: boolean;
  message?: string;
  lastCheckedAt: string;
}

export interface SystemHealthReport {
  overallStatus: ProviderHealthStatus;
  isReadyForLiveOperations: boolean;
  capabilities: Record<string, CapabilityHealthResult>;
  checkedAt: string;
}
