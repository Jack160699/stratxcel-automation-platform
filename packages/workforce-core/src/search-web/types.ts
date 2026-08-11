/** Search & Web department artifact and opportunity types. Never fabricate volumes/rankings. */

export type SearchIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational"
  | "local";

export type OpportunityClass =
  | "new_content"
  | "optimize_existing"
  | "local_landing"
  | "technical_fix"
  | "internal_link"
  | "content_gap";

export type DifficultyClass = "low" | "medium" | "high" | "unknown";

export type SeoFindingClassification =
  | "technical"
  | "indexation"
  | "on_page"
  | "content_gap"
  | "internal_linking"
  | "local_search"
  | "structured_data"
  | "performance"
  | "trust"
  | "conversion_relevance";

export type KeywordOpportunity = {
  query: string;
  intent: SearchIntent;
  topic: string;
  geography?: string;
  evidenceIds: readonly string[];
  relevance: number;
  /** Only set when real difficulty evidence exists — never invent. */
  difficultyClass?: DifficultyClass;
  /** Only set when a measured position is known — never invent. */
  currentPosition?: number;
  targetPage?: string;
  opportunityClass: OpportunityClass;
  priority: number;
  confidence: number;
};

export type SeoResearchBrief = {
  kind: "seo_research_brief";
  id: string;
  tenantId: string;
  businessObjective: string;
  targetTopics: readonly string[];
  geography?: string;
  evidenceIds: readonly string[];
  openQuestions: readonly string[];
};

export type KeywordMap = {
  kind: "keyword_map";
  id: string;
  tenantId: string;
  opportunities: readonly KeywordOpportunity[];
  evidenceIds: readonly string[];
  /** Explicitly false — volumes are never fabricated. */
  fabricatedVolumes: false;
};

export type SerpResultRow = {
  query: string;
  /** Real observed rank when provider returned it; omit if unknown. */
  position?: number;
  url?: string;
  title?: string;
  evidenceId: string;
};

export type SerpAnalysis = {
  kind: "serp_analysis";
  id: string;
  tenantId: string;
  providerAvailable: boolean;
  status: "READY" | "RESEARCH_REQUIRED" | "WAITING_CAPABILITY";
  results: readonly SerpResultRow[];
  evidenceIds: readonly string[];
  /** Explicitly false — rankings are never invented. */
  fabricatedRankings: false;
  blockedReason?: string;
};

export type SeoAuditFinding = {
  code: string;
  classification: SeoFindingClassification;
  severity: string;
  evidence: string;
  affectedUrl: string;
  whyItMatters: string;
  recommendedAction: string;
  impactPriority: number;
};

export type SeoAuditReport = {
  kind: "seo_audit_report";
  id: string;
  tenantId: string;
  propertyUrl: string;
  findings: readonly SeoAuditFinding[];
  evidenceIds: readonly string[];
};

export type ContentGapEntry = {
  serviceOrTopic: string;
  location?: string;
  existingPageUrl?: string;
  gap: "missing_page" | "thin_coverage" | "covered";
  evidenceIds: readonly string[];
};

export type ContentGapMap = {
  kind: "content_gap_map";
  id: string;
  tenantId: string;
  gaps: readonly ContentGapEntry[];
};

export type SeoArticleBrief = {
  kind: "seo_article_brief";
  id: string;
  tenantId: string;
  primaryQuery: string;
  intent: SearchIntent;
  outline: readonly string[];
  evidenceIds: readonly string[];
  businessObjective: string;
};

export type FactualClaim = {
  claim: string;
  evidenceId: string;
};

export type SeoArticleDraft = {
  kind: "seo_article_draft";
  id: string;
  tenantId: string;
  title: string;
  body: string;
  primaryQuery: string;
  factualClaims: readonly FactualClaim[];
  evidenceIds: readonly string[];
  keywordStuffingRejected: boolean;
  publishAuthorized: false;
};

export type KnownPage = {
  url: string;
  title?: string;
  path?: string;
};

export type InternalLinkSuggestion = {
  sourceUrl: string;
  targetUrl: string;
  anchorHint: string;
  rationale: string;
};

export type InternalLinkPlan = {
  kind: "internal_link_plan";
  id: string;
  tenantId: string;
  suggestions: readonly InternalLinkSuggestion[];
};

export type SeoPublishRequest = {
  kind: "seo_publish_request";
  id: string;
  tenantId: string;
  articleDraftId: string;
  productionPublishAuthorized: false;
  requiresApproval: true;
};

export type ConversionFinding = {
  code: string;
  pageUrl?: string;
  summary: string;
  evidenceIds?: readonly string[];
};

export type WebsiteAudit = {
  kind: "website_audit";
  id: string;
  tenantId: string;
  propertyUrl: string;
  strongPages: readonly string[];
  weakPages: readonly string[];
  conversionFindingsConsumed: readonly string[];
  redesignEntireSite: false;
  preserveStrongPages: true;
  recommendations: readonly string[];
};

export type PageBrief = {
  kind: "page_brief";
  id: string;
  tenantId: string;
  objective: string;
  targetAudience: string;
  primaryCta: string;
  sections: readonly string[];
  conversionNotes: readonly string[];
};

export type WebsiteChangeKind = "targeted_change" | "landing_page" | "full_site_draft";

export type WebsiteChange = {
  kind: "website_change";
  id: string;
  tenantId: string;
  changeKind: WebsiteChangeKind;
  revisionId: string;
  pages: readonly { slug: string; title: string }[];
  productionDeployAuthorized: false;
  summary: string;
};

export type LandingPageDraft = {
  kind: "landing_page_draft";
  id: string;
  tenantId: string;
  trafficSource: string;
  promise: string;
  evidence: readonly string[];
  offer: string;
  cta: string;
  leadCapture: string;
  revisionId: string;
  productionDeployAuthorized: false;
};

export type WebsitePreview = {
  kind: "website_preview";
  id: string;
  tenantId: string;
  revisionId: string;
  boundDeployCandidateId: string;
  previewUrl?: string;
};

export type DeploymentRequest = {
  kind: "deployment_request";
  id: string;
  tenantId: string;
  revisionId: string;
  boundDeployCandidateId: string;
  productionDeployAuthorized: false;
  requiresApproval: true;
};

export type LocalSeoRecommendation = {
  kind: "local_seo_recommendation";
  id: string;
  tenantId: string;
  serviceCityPages: readonly { service: string; city: string; suggestedPath: string }[];
  napNotes: readonly string[];
  gbpConnected: boolean;
  gbpRecommendation?: string;
};

export type SearchWebArtifact =
  | SeoResearchBrief
  | KeywordMap
  | SerpAnalysis
  | SeoAuditReport
  | ContentGapMap
  | SeoArticleBrief
  | SeoArticleDraft
  | InternalLinkPlan
  | SeoPublishRequest
  | WebsiteAudit
  | PageBrief
  | WebsiteChange
  | LandingPageDraft
  | WebsitePreview
  | DeploymentRequest
  | LocalSeoRecommendation;

export type QueryEvidence = {
  evidenceId: string;
  query: string;
  intent?: SearchIntent;
  topic?: string;
  geography?: string;
  relevance?: number;
  /** Measured position only — omit when unknown. */
  currentPosition?: number;
  /** Real difficulty signal only. */
  difficultyClass?: DifficultyClass;
  targetPage?: string;
  opportunityClass?: OpportunityClass;
  priority?: number;
  confidence?: number;
};
