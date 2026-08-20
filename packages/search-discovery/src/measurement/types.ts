/**
 * Search Measurement & Competitor Intelligence Types
 */

export type SearchMeasurementCapability =
  | "keyword_serp"
  | "local_serp"
  | "competitor_serp"
  | "serp_features"
  | "device_breakdown"
  | "geography";

export type MeasurementProviderStatus =
  | "AVAILABLE"
  | "NOT_CONFIGURED"
  | "AUTH_REQUIRED"
  | "RATE_LIMITED"
  | "ERROR"
  | "UNSUPPORTED";

export type QueryClass =
  | "commercial"
  | "service"
  | "local"
  | "informational"
  | "comparison"
  | "branded"
  | "non_branded"
  | "high_intent"
  | "supporting_topic";

export interface MeasurementQueryRequest {
  query: string;
  location?: string;
  country?: string;
  language?: string;
  device?: "desktop" | "mobile";
  clientDomain: string;
  competitorDomains?: string[];
}

export type SerpResultType =
  | "organic"
  | "local_pack"
  | "featured_snippet"
  | "people_also_ask"
  | "sitelinks"
  | "video"
  | "knowledge_panel";

export interface NormalizedSerpItem {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  resultType: SerpResultType;
  isClient: boolean;
  isCompetitor: boolean;
}

export interface MeasurementQueryResult {
  query: string;
  location?: string;
  country: string;
  language: string;
  device: "desktop" | "mobile";
  timestamp: string;
  items: NormalizedSerpItem[];
  clientPosition: number | null;
  clientUrl: string | null;
  sourceProvider: string;
  queryFingerprint: string;
  rawRef?: Record<string, unknown>;
}

export interface TargetQuery {
  fingerprint: string;
  query: string;
  queryClass: QueryClass;
  intent: "commercial" | "transactional" | "local" | "informational" | "comparison" | "branded";
  businessValue: number; // 0 - 100
  relevance: number; // 0 - 100
  demandEvidence: {
    source: "gsc" | "business_service" | "business_category" | "brand_brain" | "grounded_research";
    impressions?: number;
    clicks?: number;
    description: string;
  };
  targetLocation?: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface CompetitorProfile {
  domain: string;
  businessName: string;
  source: "brand_brain" | "grounded_research" | "serp_measurement" | "gsc_signal";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface CompetitorQuerySnapshot {
  query: string;
  clientPresent: boolean;
  clientPosition: number | null;
  clientUrl: string | null;
  competitors: Array<{
    domain: string;
    businessName: string;
    position: number | null;
    url: string | null;
    resultType: string;
    isAhead: boolean;
  }>;
  source: string;
  timestamp: string;
  availabilityState: "available" | "not_connected" | "provider_unavailable";
  reasonIfUnavailable?: string;
}

export interface WhyTheyWinExplanation {
  competitorDomain: string;
  competitorName: string;
  query?: string;
  gap?: string;
  summary?: string;
  evidence: string[];
  sources?: string[];
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  likelyReasons?: string[];
  unknowns?: string[];
  recommendedAction: string;
}

export type CompetitorDeltaType =
  | "CLIENT_GAINED"
  | "CLIENT_LOST"
  | "COMPETITOR_GAINED"
  | "COMPETITOR_LOST"
  | "NO_CHANGE"
  | "UNKNOWN";

export interface CompetitorDeltaResult {
  query: string;
  competitorDomain: string;
  deltaType: CompetitorDeltaType;
  previousClientPosition?: number | null;
  currentClientPosition?: number | null;
  previousCompetitorPosition?: number | null;
  currentCompetitorPosition?: number | null;
  clientOldPosition?: number | null;
  clientNewPosition?: number | null;
  competitorOldPosition?: number | null;
  competitorNewPosition?: number | null;
  summary?: string;
  fingerprint?: string;
  timestamp?: string;
}

export interface SearchAuthorityScoreComponent {
  score: number | null;
  status: "MEASURED" | "ESTIMATED_FROM_BASELINE" | "UNAVAILABLE";
  weight: number;
  rationale: string;
  evidenceSourceIds: string[];
}

export interface SearchAuthorityScoreBreakdown {
  overallScore: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  dataCoveragePercentage: number;
  components: {
    organicSearchVisibility: SearchAuthorityScoreComponent;
    technicalReadiness: SearchAuthorityScoreComponent;
    contentCoverage: SearchAuthorityScoreComponent;
    competitivePosition: SearchAuthorityScoreComponent;
    localAndEntity: SearchAuthorityScoreComponent;
    aiSearchReadiness: SearchAuthorityScoreComponent;
  };
}
