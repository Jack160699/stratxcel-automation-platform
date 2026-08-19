/** Research Engine V1 — typed contracts. No fake confidence percentages. */

export type ResearchTaskClass = "RESEARCH" | "SEO_RESEARCH";

export type ResearchStatus =
  | "PASS"
  | "INSUFFICIENT_EVIDENCE"
  | "BLOCKED"
  | "WAITING_CONFIGURATION"
  | "FAILED";

export type SourceSupportStatus =
  | "supported"
  | "unsupported"
  | "partial"
  | "conflicting"
  | "stale";

export type SourceVerificationStatus = "verified" | "unavailable" | "skipped" | "blocked";

export type SourceQualityClass =
  | "PRIMARY"
  | "OFFICIAL"
  | "REPUTABLE_SECONDARY"
  | "SECONDARY"
  | "USER_GENERATED"
  | "UNKNOWN";

export type ResearchStatementKind = "sourced_fact" | "inference" | "recommendation" | "unknown";

export interface ResearchGeography {
  country?: string;
  state?: string;
  city?: string;
}

export interface ResearchRequest {
  tenantId: string;
  missionId: string;
  requestId: string;
  question: string;
  purpose?: string;
  taskClass: ResearchTaskClass;
  geography?: ResearchGeography;
  language?: string;
  freshnessDays?: number;
  maxSources: number;
  preferredDomains?: readonly string[];
  blockedDomains?: readonly string[];
  requiredDomains?: readonly string[];
  primarySourcesPreferred: boolean;
  requireWebEvidence: boolean;
  requireClaimCitations: boolean;
  correlationId?: string;
  /** Optional competitor / entity focus (public web only). */
  competitorNames?: readonly string[];
  verifyTopSources?: boolean;
  maxVerifiedFetches?: number;
}

export interface ResearchClaim {
  id: string;
  text: string;
  sourceIds: readonly string[];
  /** Only set when a deterministic provider/calc supplies it — never invented. */
  confidence?: number | null;
  sourceSupportStatus: SourceSupportStatus;
  statementKind: ResearchStatementKind;
}

export interface ResearchSource {
  id: string;
  providerSourceId?: string;
  url: string;
  canonicalUrl: string;
  title?: string;
  domain: string;
  provider:
    | "google"
    | "openai"
    | "crawler"
    | "search_console"
    | "google_analytics"
    | "google_business"
    | "facebook"
    | "instagram"
    | "unknown";
  retrievedAt: string;
  searchQueries: readonly string[];
  sourceType: SourceQualityClass;
  verification: SourceVerificationStatus;
  freshnessStatus?: "FRESH" | "STALE_FOR_REQUEST" | "UNKNOWN_FOR_REQUEST" | null;
  excerpt?: string;
  contentHash?: string;
  publishedAt?: string | null;
}

/**
 * Truthful availability of one connected-provider data source consulted
 * while assembling research evidence. Distinguishes "we have no data" from
 * "the data is bad" — never silently converted into an empty/zero result.
 */
export type ConnectorAvailabilityState =
  | "available"
  | "unavailable"
  | "not_connected"
  | "permission_required"
  | "provider_error"
  | "no_data";

export interface ConnectorAvailabilityRecord {
  provider: string;
  state: ConnectorAvailabilityState;
  reason: string | null;
  retrievedAt: string | null;
  timeWindow: string | null;
}

export interface ResearchResult {
  status: ResearchStatus;
  question: string;
  summary: string;
  claims: readonly ResearchClaim[];
  sources: readonly ResearchSource[];
  evidenceArtifactIds: readonly string[];
  summaryArtifactId: string | null;
  provider: "google" | "openai" | null;
  model: string | null;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  selectionReceipt?: Record<string, unknown>;
  searchedAt: string;
  disagreements?: readonly string[];
  reasonCode?: string;
  humanReason?: string;
  /**
   * Truthful per-provider state for every connected-account data source
   * attempted (not just the ones that produced a usable source/claim) — the
   * customer report must be able to say "Search Console: connected, no data"
   * distinctly from "Search Console: not connected" or "fetch failed".
   */
  connectorAvailability?: readonly ConnectorAvailabilityRecord[];
}

export const RESEARCH_BOUNDS = {
  questionMin: 8,
  questionMax: 4000,
  maxSourcesMin: 1,
  maxSourcesMax: 20,
  domainListMax: 30,
  freshnessDaysMin: 1,
  freshnessDaysMax: 3650,
  timeoutMsMax: 120_000,
  maxExcerptChars: 500,
  maxTotalExcerptChars: 8_000,
  maxVerifiedFetchesDefault: 6,
  maxVerifiedFetchesHard: 8,
  maxModelRounds: 2,
  maxAiAttempts: 4,
} as const;
