/**
 * Canonical SEO Action Catalog & Execution Types
 */

export type ActionFamily =
  | "TECHNICAL"
  | "CONTENT"
  | "INTERNAL_LINKING"
  | "LOCAL"
  | "AI_SEARCH";

export type AutonomyClass =
  | "AUTO_SAFE"
  | "AUTO_WITH_POLICY"
  | "AUTHORIZATION_REQUIRED"
  | "RECOMMENDATION_ONLY"
  | "BLOCKED";

export type TechnicalActionType =
  | "FIX_MISSING_TITLE"
  | "FIX_TITLE_LENGTH"
  | "FIX_MISSING_META_DESCRIPTION"
  | "FIX_DUPLICATE_TITLE"
  | "FIX_DUPLICATE_META_DESCRIPTION"
  | "FIX_CANONICAL_URL"
  | "FIX_ROBOTS_INDEXABILITY"
  | "FIX_BROKEN_INTERNAL_LINK"
  | "FIX_IMAGE_ALT_TEXT"
  | "FIX_HEADING_HIERARCHY"
  | "INSERT_SCHEMA_MARKUP"
  | "CORRECT_SCHEMA_MARKUP"
  | "NORMALIZE_INTERNAL_URLS";

export type ContentActionType =
  | "CREATE_SERVICE_PAGE"
  | "CREATE_LOCATION_PAGE"
  | "CREATE_SUPPORTING_PAGE"
  | "EXPAND_THIN_PAGE"
  | "REFRESH_OUTDATED_PAGE"
  | "ALIGN_QUERY_INTENT"
  | "ADD_FAQ_SECTION"
  | "ENHANCE_ANSWER_STRUCTURE";

export type InternalLinkingActionType =
  | "REPAIR_ORPHAN_PAGE"
  | "ADD_TOPIC_CLUSTER_LINKS"
  | "IMPROVE_ANCHOR_RELEVANCE"
  | "BUILD_HUB_SPOKE_LINKS";

export type LocalActionType =
  | "ENHANCE_LOCATION_PAGE"
  | "INJECT_LOCAL_BUSINESS_SCHEMA"
  | "FIX_NAP_CONSISTENCY"
  | "ADD_LOCAL_FAQ";

export type AISearchActionType =
  | "INJECT_ENTITY_DATA"
  | "ADD_CITATION_READY_SECTION"
  | "STRUCTURE_FACTUAL_QA";

export type CanonicalActionType =
  | TechnicalActionType
  | ContentActionType
  | InternalLinkingActionType
  | LocalActionType
  | AISearchActionType;

export interface CanonicalActionDefinition {
  actionType: CanonicalActionType;
  family: ActionFamily;
  title: string;
  description: string;
  autonomyClass: AutonomyClass;
  expectedImpact: "HIGH" | "MEDIUM" | "LOW";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  verificationMethod: "LIVE_DOM_CHECK" | "HTTP_STATUS_CHECK" | "SCHEMA_VALIDATION" | "CONTENT_INSPECTION";
  rollbackMethod: "RESTORE_PAGE_SNAPSHOT" | "REMOVE_INJECTED_TAG" | "REVERT_METADATA";
  requiresWriteCapability: boolean;
}

export interface ContentGenerationPlan {
  url: string;
  title: string;
  metaDescription: string;
  h1: string;
  intro: string;
  sections: Array<{
    heading: string;
    content: string;
  }>;
  faqs?: Array<{
    question: string;
    answer: string;
  }>;
  internalLinks: Array<{
    targetUrl: string;
    anchorText: string;
  }>;
  schemaMarkup?: Record<string, unknown>;
  ctaText: string;
  groundedFacts: string[];
}

export interface ContentQualityGateResult {
  passed: boolean;
  score: number; // 0-100
  blockers: string[];
  warnings: string[];
  factsGrounded: boolean;
  duplicateContentRisk: "NONE" | "LOW" | "HIGH";
  cannibalizationRisk: "NONE" | "LOW" | "HIGH";
}

export interface InternalLinkPlan {
  sourcePageUrl: string;
  targetPageUrl: string;
  anchorText: string;
  contextSentence: string;
  rationale: string;
}
