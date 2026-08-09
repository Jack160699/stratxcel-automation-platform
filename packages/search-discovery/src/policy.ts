import type { SearchActionClass, SearchEntitlement } from "./types.ts";
export type SearchPlan = "free" | "starter" | "growth" | "business" | "scale";
export const SEARCH_ENTITLEMENTS: Record<SearchPlan, SearchEntitlement> = {
  free: { previewOnly: true, technicalDepth: "preview", local: false, aiSearch: false, outcomeOptimization: false, autonomousActions: 0, locations: 1, seoArticles: 0 },
  starter: { previewOnly: false, technicalDepth: "basic", local: true, aiSearch: false, outcomeOptimization: false, autonomousActions: 0, locations: 1, seoArticles: 1 },
  growth: { previewOnly: false, technicalDepth: "deep", local: true, aiSearch: true, outcomeOptimization: false, autonomousActions: 4, locations: 1, seoArticles: 2 },
  business: { previewOnly: false, technicalDepth: "advanced", local: true, aiSearch: true, outcomeOptimization: true, autonomousActions: 15, locations: 3, seoArticles: 4 },
  scale: { previewOnly: false, technicalDepth: "custom", local: true, aiSearch: true, outcomeOptimization: true, autonomousActions: 25, locations: 5, seoArticles: 6 },
};
const APPROVAL_ACTIONS = new Set(["publish_website_content", "material_page_rewrite", "change_canonical", "change_robots", "change_indexing", "create_public_page", "publish_gbp", "publish_social", "modify_production_structure"]);
const MANUAL_ACTIONS = new Set(["connect_gbp", "complete_oauth", "verify_ownership", "change_external_provider"]);
export function classifySearchAction(action: string): SearchActionClass { if (APPROVAL_ACTIONS.has(action)) return "approval_required"; if (MANUAL_ACTIONS.has(action)) return "manual_provider_required"; return "safe_preparatory"; }
export const SEARCH_CADENCE = { lightweight: "daily", deepTechnicalAndCompetitor: "weekly", trends: "weekly_or_monthly", constraints: "tenant-safe, idempotent, bounded, observable, no paid crawl without configured budget" } as const;
