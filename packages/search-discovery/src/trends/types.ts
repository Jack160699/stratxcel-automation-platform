/**
 * Trend Intelligence Types.
 *
 * Built to close the gap documented in
 * docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md: no trend-relevance
 * classification (USE_NOW/ADAPT/MONITOR/IGNORE) existed anywhere in this
 * codebase. Rather than adding a new external trends API, this is built on
 * the already-real, already-configured grounded research engine
 * (research/grounded-runtime.ts) -- every TrendSignal traces to a real
 * ResearchSource with a real observed_at and a real (never-invented)
 * confidence, matching that module's own "no fake confidence percentages"
 * rule.
 */

export type TrendPlatform = "google_search" | "ai_search" | "social" | "news" | "industry_publication" | "general_web";

export type TrendFormat = "short_video" | "long_video" | "carousel" | "text_post" | "blog_article" | "guide" | "local_listing" | "review_response" | "unknown";

export type TrendDecision = "USE_NOW" | "ADAPT" | "MONITOR" | "IGNORE";

export interface TrendRelevanceScores {
  businessFit: number; // 0-100
  audienceFit: number; // 0-100
  brandFit: number; // 0-100
  channelFit: number; // 0-100
  timeliness: number; // 0-100, derived from freshness
  strategicValue: number; // 0-100
  risk: number; // 0-100, HIGHER risk score = more risk
}

export interface TrendSignal {
  id: string;
  tenantId: string;
  platform: TrendPlatform;
  topic: string;
  format: TrendFormat;
  hookPattern: string | null;
  visualPattern: string | null;
  audienceSignal: string | null;
  reasonForTrend: string;
  /** 0-1 velocity estimate when a real comparable signal exists (e.g. rising query volume); null when no real velocity evidence exists -- never guessed. */
  velocity: number | null;
  source: string;
  sourceUrl: string | null;
  observedAt: string;
  /** Mirrors research/types.ts's SourceQualityClass-derived confidence discipline -- never invented. */
  confidence: "HIGH" | "MEDIUM" | "LOW";
  scores: TrendRelevanceScores;
  decision: TrendDecision;
  decisionReason: string;
  /** How the trend should be adapted if decision is ADAPT/USE_NOW -- null for MONITOR/IGNORE. Never "copy this creator's content" -- always a pattern-level adaptation. */
  adaptationGuidance: string | null;
}

/** The business/brand context a candidate trend is scored against. Deliberately narrow -- only what's needed to score relevance, not a full business profile. */
export interface TrendScoringContext {
  industry: string;
  services: string[];
  brandValues: string[];
  targetAudience: string[];
  availableChannels: TrendPlatform[];
  riskTolerance: "LOW" | "MEDIUM" | "HIGH";
}

/** A candidate trend before relevance scoring -- what a real evidence source (grounded research, or in principle any other real observation) can honestly supply. */
export interface TrendCandidate {
  platform: TrendPlatform;
  topic: string;
  format: TrendFormat;
  hookPattern?: string | null;
  visualPattern?: string | null;
  audienceSignal?: string | null;
  reasonForTrend: string;
  velocity?: number | null;
  source: string;
  sourceUrl?: string | null;
  observedAt: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

/** Freshness policy -- a trend observed longer ago than this is never treated as current, regardless of its original confidence. */
export const TREND_FRESHNESS_WINDOW_DAYS = 21;
