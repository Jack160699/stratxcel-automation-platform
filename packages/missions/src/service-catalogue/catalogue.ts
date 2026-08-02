import type { ServiceCatalogueEntry } from "./types.ts";

/**
 * v1 structured service catalogue, per the master brief's "v1 service
 * workflows" list. Base costs are placeholder estimates in INR cents
 * (paise) pending real pricing input from the product owner — tracked as a
 * manual/business decision, not a technical blocker. Keyword lists drive
 * the mission compiler's v1 rule-based matching.
 */
export const SERVICE_CATALOGUE: readonly ServiceCatalogueEntry[] = [
  {
    key: "brand_audit",
    label: "Brand & Marketing Audit",
    description: "Reviews current brand presence, messaging and social performance.",
    hermesProfile: "stratxcel-research",
    baseCostCents: 50000,
    keywords: ["brand audit", "marketing audit", "review my brand", "how are we doing", "brand assessment"],
  },
  {
    key: "social_campaign",
    label: "Social Media Campaign",
    description: "Plans and executes a themed multi-post social campaign.",
    hermesProfile: "stratxcel-content",
    baseCostCents: 150000,
    keywords: ["campaign", "social media", "posts", "instagram", "facebook", "threads"],
  },
  {
    key: "content_calendar",
    label: "Content Calendar",
    description: "Builds a scheduled content calendar across connected platforms.",
    hermesProfile: "stratxcel-content",
    baseCostCents: 100000,
    keywords: ["content calendar", "schedule", "posting plan"],
  },
  {
    key: "website_landing_page",
    label: "Website / Landing Page",
    description: "Builds or updates a website or landing page via a preview deploy.",
    hermesProfile: "stratxcel-developer",
    baseCostCents: 300000,
    keywords: ["website", "landing page", "web page", "webpage"],
  },
  {
    key: "seo_audit",
    label: "SEO Audit",
    description: "Audits SEO health and proposes prioritized changes.",
    hermesProfile: "stratxcel-seo",
    baseCostCents: 80000,
    keywords: ["seo", "search ranking", "google ranking"],
  },
  {
    key: "proposal",
    label: "Proposal Generation",
    description: "Drafts a client-facing proposal document.",
    hermesProfile: "stratxcel-admin-growth",
    baseCostCents: 40000,
    keywords: ["proposal", "quote", "pitch"],
  },
  {
    key: "report",
    label: "Performance Report",
    description: "Compiles a performance/analytics report.",
    hermesProfile: "stratxcel-admin-growth",
    baseCostCents: 30000,
    keywords: ["report", "analytics", "performance summary"],
  },
  {
    key: "custom_mission",
    label: "Custom Mission",
    description: "Fallback for goals that don't match a known service; routed to the orchestrator for scoping.",
    hermesProfile: "stratxcel-orchestrator",
    baseCostCents: 0,
    keywords: [],
  },
] as const;

export function getServiceCatalogueEntry(key: string): ServiceCatalogueEntry | undefined {
  return SERVICE_CATALOGUE.find((entry) => entry.key === key);
}
