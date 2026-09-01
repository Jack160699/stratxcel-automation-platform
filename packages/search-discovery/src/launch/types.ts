/**
 * Launch Configuration & Zero-Staff Activation Types
 */

export type LaunchGateState =
  | "BLOCKED"
  | "READY_FOR_INTERNAL_TEST"
  | "READY_FOR_EXTERNAL_BETA"
  | "READY_FOR_PRODUCTION";

export type ProviderSetupStatus =
  | "CONFIGURED"
  | "CONNECTED"
  | "VERIFIED"
  | "BLOCKED"
  | "MISSING_SETUP";

export interface ConfiguredProviderItem {
  id: string;
  name: string;
  category: "CORE" | "SEARCH" | "CMS" | "AI" | "LOCAL" | "COMMUNICATION" | "BILLING";
  status: ProviderSetupStatus;
  isCoreBlocker: boolean;
  whatIsRequired: string;
  details?: string;
}

export interface SchedulerHealthStatus {
  isConfiguredInVercel: boolean;
  secretConfigured: boolean;
  /**
   * Whether Vercel's own reserved CRON_SECRET env var is set. Vercel only
   * auto-attaches `Authorization: Bearer $CRON_SECRET` to its real,
   * automatic cron invocation when a var named exactly this exists in the
   * project (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 32) --
   * `secretConfigured` alone (the custom SEARCH_DISCOVERY_SCHEDULER_SECRET)
   * says nothing about whether Vercel's own automatic invocation can ever
   * authenticate.
   */
  cronSecretConfigured: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  status: "OPERATIONAL" | "MISCONFIGURED" | "PENDING_FIRST_INVOCATION";
  scheduleCronExpression: string;
}

export type BusinessType = "LOCAL_BUSINESS" | "SERVICE_BUSINESS" | "YOUTUBE_DRIVEN" | "CONTENT_HEAVY" | "GENERAL";

export interface RecommendedConnector {
  connectorId: string;
  name: string;
  category: "SEARCH_DATA" | "LOCAL" | "SOCIAL_REPUTATION" | "WEBSITE";
  recommendedReason: string;
  readAccess: "AVAILABLE_FOR_AUDIT" | "NOT_REQUIRED";
  writeAccess: "AVAILABLE_AFTER_ACTIVATION" | "NOT_REQUIRED";
  isConnected: boolean;
  isOptional: boolean;
}

export interface DataReadinessScore {
  connectedCount: number;
  totalRecommendedCount: number;
  readinessPercentage: number; // e.g. 78%
  summaryMessage: string;
}

export interface WordPressSetupInput {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}

export interface WordPressSetupResult {
  success: boolean;
  status: "CONNECTED" | "INVALID_CREDENTIALS" | "URL_UNREACHABLE" | "INSUFFICIENT_PERMISSIONS";
  readVerified: boolean;
  writeVerified: boolean;
  errorMessage?: string;
}
