/**
 * External Authority, Community, Local & Reputation Intelligence Types
 */

export type ExternalSourceType =
  | "news_publication"
  | "industry_publication"
  | "trade_association"
  | "business_directory"
  | "local_directory"
  | "review_platform"
  | "community_reddit"
  | "community_quora"
  | "community_forum"
  | "youtube_social"
  | "reference_database"
  | "other";

export type PublicationCapability =
  | "READ_ONLY"
  | "RECOMMENDATION_ONLY"
  | "SUBMISSION_AVAILABLE"
  | "API_WRITE_AVAILABLE";

export type ActionExecutionClass =
  | "DISCOVERY_ONLY"
  | "RECOMMENDATION_ONLY"
  | "AUTHORIZATION_REQUIRED"
  | "EXECUTABLE";

export interface ExternalSourceProfile {
  domain: string;
  sourceType: ExternalSourceType;
  title: string;
  targetUrl?: string;
  topicRelevance: number; // 0-100
  geographicRelevance: "LOCAL" | "REGIONAL" | "NATIONAL" | "GLOBAL";
  clientPresent: boolean;
  competitorPresent: boolean;
  competitorDomains: string[];
  clientCitations: string[];
  publicationCapability: PublicationCapability;
  evidence: string[];
  opportunityScore: number; // 0-100
  confidence: "HIGH" | "MEDIUM" | "LOW";
  lastSeenAt: string;
}

export type AuthorityGapType =
  | "missing_industry_citation"
  | "missing_local_directory"
  | "competitor_mentioned_source"
  | "missing_business_profile"
  | "missing_review_presence"
  | "community_opportunity";

export interface AuthorityGap {
  id: string;
  gapType: AuthorityGapType;
  sourceDomain: string;
  sourceType: ExternalSourceType;
  competitorsPresent: string[];
  clientPresent: boolean;
  evidence: string[];
  whyItMatters: string;
  recommendedAction: string;
  actionType: ActionExecutionClass;
  opportunityScore: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface RedditRadarItem {
  id: string;
  subreddit: string;
  threadUrl: string;
  title: string;
  topic: string;
  intent: "recommendation" | "troubleshooting" | "comparison" | "advice";
  relevanceScore: number; // 0-100
  engagementScore: number; // e.g. upvotes/comments proxy
  competitorMentioned: boolean;
  clientMentioned: boolean;
  suggestedExpertAngle: string;
  actionType: ActionExecutionClass;
  complianceChecked: boolean;
}

export interface QuoraRadarItem {
  id: string;
  questionUrl: string;
  question: string;
  topic: string;
  intent: "recommendation" | "how_to" | "comparison";
  relevanceScore: number;
  competitorPresent: boolean;
  clientPresent: boolean;
  suggestedExpertAngle: string;
  actionType: ActionExecutionClass;
}

export interface ReviewReputationSummary {
  totalReviewCount: number;
  averageRating: number; // 1.0 - 5.0
  trend: "IMPROVING" | "STABLE" | "DECLINING";
  responseCoveragePercentage: number; // 0-100
  recurringPraise: string[];
  recurringComplaints: string[];
  competitorSignals?: {
    competitorDomain: string;
    reviewCount: number;
    rating: number;
  }[];
  recommendations: string[];
}

export interface LocalMapsProfile {
  businessName: string;
  primaryLocation: string;
  napConsistent: boolean;
  gbpClaimed: boolean;
  categories: string[];
  serviceAreas: string[];
  localLandingPageUrl?: string;
  localGaps: string[];
}

export type EntityType =
  | "BRAND"
  | "PERSON"
  | "SERVICE"
  | "LOCATION"
  | "PRODUCT"
  | "PUBLICATION"
  | "DIRECTORY"
  | "REVIEW_PROFILE"
  | "AI_CITATION";

export interface EntityGraphNode {
  entityType: EntityType;
  canonicalName: string;
  attributes: Record<string, unknown>;
  relationships: Array<{
    targetType: EntityType;
    targetName: string;
    relationshipType: "OFFERS_SERVICE" | "LOCATED_IN" | "MENTIONED_BY" | "CITES" | "REVIEWED_ON" | "FOUNDED_BY";
  }>;
  consistencyStatus: "CONSISTENT" | "INCONSISTENT" | "WEAK_COVERAGE" | "MISSING_RELATIONSHIP";
  evidence: string[];
}

export interface ExternalAuthorityReport {
  overallAuthorityScore: number;
  sourcesDiscovered: ExternalSourceProfile[];
  authorityGaps: AuthorityGap[];
  redditRadar: RedditRadarItem[];
  quoraRadar: QuoraRadarItem[];
  reputationSummary: ReviewReputationSummary;
  localProfile: LocalMapsProfile;
  entityNodes: EntityGraphNode[];
}
