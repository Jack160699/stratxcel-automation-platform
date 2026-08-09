export type ProviderState = "connected" | "not_connected" | "permission_required" | "configuration_required" | "waiting_for_data" | "error";
export type SearchSeverity = "Critical" | "High" | "Medium" | "Low";
export type SearchIntent = "transactional" | "commercial" | "local" | "informational" | "branded" | "comparison";
export type AssetType = "existing_service_page" | "new_service_page" | "location_page" | "comparison_page" | "faq" | "article" | "gbp_content" | "social_content_cluster";
export type SearchActionClass = "safe_preparatory" | "approval_required" | "manual_provider_required";
export type SearchSurface = "technical" | "google_search" | "local" | "ai_search" | "social" | "outcomes";

export interface TenantRecord { tenantId: string; id: string; }
export interface SearchProperty extends TenantRecord { url: string; name: string; locations: string[]; competitors: string[]; }
export interface ProviderConnection { provider: "search_console" | "ga4" | "google_business_profile" | "meta" | "youtube"; state: ProviderState; reason: string; lastSuccessfulSyncAt?: string; }
export interface TechnicalPage { url: string; status?: number; indexable?: boolean; robots?: string; canonical?: string; title?: string; metaDescription?: string; h1Count?: number; imageCount?: number; imagesWithAlt?: number; structuredDataTypes?: string[]; internalLinks?: string[]; mobilePerformance?: number; coreWebVitals?: { lcpMs: number; inpMs: number; cls: number }; }
export interface TechnicalIssue { code: string; severity: SearchSeverity; evidence: string; affectedUrl: string; whyItMatters: string; recommendedAction: string; automaticallyFixable: boolean; approvalRequired: boolean; }
export interface QueryMetric { query: string; page?: string; impressions: number; clicks: number; ctr: number; position: number; previousImpressions?: number; previousClicks?: number; conversions?: number; }
export interface SearchOpportunity { id: string; surface: SearchSurface; title: string; evidence: string; recommendation: string; score: number; intent?: SearchIntent; assetType?: AssetType; url?: string; }
export interface SearchRecommendation extends TenantRecord { surface: SearchSurface; evidence: string; proposedChange: string; actionClass: SearchActionClass; approvalState: "not_required" | "pending" | "approved" | "rejected"; executionResult?: string; measurementFollowUp?: string; }
export interface PageContent { url: string; businessName?: string; address?: string; serviceLocations?: string[]; services?: string[]; faqs?: string[]; comparisons?: string[]; pricingVisible?: boolean; credentials?: string[]; caseStudies?: string[]; firstPartyEvidence?: string[]; sources?: string[]; structuredDataTypes?: string[]; crawlable: boolean; }
export interface LocalProfile { businessName?: string; websiteBusinessName?: string; address?: string; websiteAddress?: string; primaryCategory?: string; services?: string[]; description?: string; hours?: string[]; website?: string; phone?: string; websitePhone?: string; locations?: string[]; photos?: number; reviewsAvailable?: boolean; }
export interface SocialProfile { platform: "instagram" | "facebook" | "threads" | "youtube"; state: ProviderState; businessName?: string; bio?: string; location?: string; serviceTerms?: string[]; recentContentTopics?: string[]; mediaAltCoverage?: number; metrics?: { engagement: number; discoveryViews?: number }; }
export interface SearchEntitlement { previewOnly: boolean; technicalDepth: "preview" | "basic" | "deep" | "advanced" | "custom"; local: boolean; aiSearch: boolean; outcomeOptimization: boolean; autonomousActions: number; locations: number; seoArticles: number; }
