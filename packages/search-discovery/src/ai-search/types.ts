/**
 * AI Search & AEO Measurement Types
 */

export type AISearchPlatform =
  | "chatgpt_search"
  | "perplexity"
  | "gemini"
  | "claude_web"
  | "google_ai_overview"
  | "aggregated_ai";

export type AISearchProviderStatus =
  | "AVAILABLE"
  | "NOT_CONFIGURED"
  | "UNSUPPORTED"
  | "AUTH_REQUIRED"
  | "RATE_LIMITED"
  | "ERROR";

export type AIQueryClass =
  | "commercial"
  | "local"
  | "informational"
  | "comparison"
  | "branded"
  | "non_branded"
  | "high_intent"
  | "supporting";

export interface AIVisibilityQuery {
  fingerprint: string;
  query: string;
  queryClass: AIQueryClass;
  intent: "recommendation" | "comparison" | "how_to" | "local_finder" | "factual";
  targetLocation?: string;
  expectedEntities: string[];
  businessValue: number; // 1-100
}

export interface CompetitorAICitation {
  domain: string;
  businessName?: string;
  cited: boolean;
  mentioned: boolean;
  citedUrls: string[];
}

export interface AIVisibilityResult {
  query: string;
  platform: AISearchPlatform;
  brandMentioned: boolean;
  clientCited: boolean;
  clientUrls: string[];
  citedDomains: string[];
  competitorCitations: CompetitorAICitation[];
  sourceCategories: Array<"official_website" | "review_platform" | "news_article" | "directory" | "forum" | "unknown">;
  answerSummary?: string;
  timestamp: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  providerStatus: "available" | "unavailable";
  providerNote?: string;
}

export interface AICitationGap {
  fingerprint: string;
  query: string;
  platform: AISearchPlatform;
  competitorCited: string;
  sourceCited: string;
  clientMissing: boolean;
  evidence: string[];
  likelyGap: string;
  proposedAction: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  priority: number;
}

export interface AIVisibilityScore {
  overallScore: number | null; // 0-100, null if unmeasured
  mentionCoverage: number | null; // % of AI queries where brand is mentioned
  citationCoverage: number | null; // % of AI queries where client URL is cited
  competitorShare: number | null; // % of citations going to competitors vs client
  confidence: "HIGH" | "MEDIUM" | "LOW";
  dataCoveragePercentage: number;
  unmeasuredReasons?: string[];
}

export interface AISearchMeasurementProvider {
  readonly platform: AISearchPlatform;
  status(): Promise<AISearchProviderStatus>;
  measureQuery(input: {
    query: string;
    clientDomain: string;
    competitorDomains: string[];
    location?: string;
  }): Promise<AIVisibilityResult>;
}
