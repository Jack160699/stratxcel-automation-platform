import type { ProductAvailability, ProductDefinition, ProductGroup, ProductGroupId } from "./types.ts";

export const PRODUCT_AVAILABILITY_LABELS: Record<ProductAvailability, string> = {
  live: "Live",
  beta: "Beta",
  assisted: "Staff-assisted",
  "coming-later": "Coming later",
};

export const PRODUCTS: Record<string, ProductDefinition> = {
  "business-growth-audit": {
    id: "business-growth-audit",
    name: "Business Growth Audit",
    outcome: "Find where growth is leaking and what to fix first with an evidence-based 30/60/90-day roadmap.",
    userAction: "Complete the intake, then receive a staff-reviewed report with prioritized actions.",
    availability: "live",
    href: "/audit",
  },
  "brand-brain": {
    id: "brand-brain",
    name: "Brand Brain",
    outcome: "Keep positioning, tone, and messaging consistent across every channel your team touches.",
    userAction: "Capture your brand context once and use it to guide content, campaigns, and reviews.",
    availability: "live",
    href: "/signup",
  },
  "ai-research": {
    id: "ai-research",
    name: "AI Research",
    outcome: "Understand competitors, category signals, and market context without starting from a blank page.",
    userAction: "Request research topics and review structured findings inside your workspace.",
    availability: "beta",
    href: "/signup",
  },
  analytics: {
    id: "analytics",
    name: "Analytics",
    outcome: "See how channels perform and which signals deserve attention next.",
    userAction: "Review connected performance data and use it to inform weekly priorities.",
    availability: "assisted",
    href: "/contact",
  },
  reporting: {
    id: "reporting",
    name: "Reporting",
    outcome: "Receive clear summaries of what changed, what worked, and what needs a decision.",
    userAction: "Review staff-prepared reports and confirm the next actions with your team.",
    availability: "assisted",
    href: "/contact",
  },
  "social-copilot": {
    id: "social-copilot",
    name: "Social Copilot",
    outcome: "Plan, create, review, and publish social content from one connected workspace.",
    userAction: "Shape campaigns, prepare drafts, approve posts, and publish when accounts are connected.",
    availability: "assisted",
    href: null,
    marketingHref: "/social-autopilot",
  },
  "seo-intelligence": {
    id: "seo-intelligence",
    name: "SEO Intelligence",
    outcome: "Find what customers search for and what to improve on your website and discovery path.",
    userAction: "Review prioritized search and website improvements before any work begins.",
    availability: "assisted",
    href: "/contact",
  },
  "content-creation": {
    id: "content-creation",
    name: "Content Creation",
    outcome: "Produce on-brand posts, captions, and campaign copy without losing your voice.",
    userAction: "Prepare drafts from your Brand Brain, review, and approve before anything goes live.",
    availability: "assisted",
    href: "/contact",
  },
  "creative-studio": {
    id: "creative-studio",
    name: "Creative Studio",
    outcome: "Generate and refine images and visual assets aligned with your brand direction.",
    userAction: "Create visuals from approved brand context and select what to use in campaigns.",
    availability: "live",
    href: "/signup",
  },
  "video-reels": {
    id: "video-reels",
    name: "Video & Reels",
    outcome: "Extend your content system to short-form video when the workflow is ready for your business.",
    userAction: "Scope video needs with the team before production or publishing begins.",
    availability: "coming-later",
    href: null,
  },
  "ads-intelligence": {
    id: "ads-intelligence",
    name: "Ads Intelligence",
    outcome: "Understand campaign performance and where spend should shift next.",
    userAction: "Review ad signals with the team and confirm scope before changes are made.",
    availability: "assisted",
    href: "/contact",
  },
  crm: {
    id: "crm",
    name: "CRM",
    outcome: "Capture leads and keep follow-up from getting lost across inquiries and conversations.",
    userAction: "Log inquiries, assign ownership, and track outcomes in one pipeline view.",
    availability: "live",
    href: "/signup",
  },
  "whatsapp-ai": {
    id: "whatsapp-ai",
    name: "WhatsApp AI",
    outcome: "Respond faster to WhatsApp inquiries with guided follow-up that stays under your control.",
    userAction: "Connect WhatsApp when supported, review suggested replies, and approve responses.",
    availability: "assisted",
    href: "/contact",
  },
  website: {
    id: "website",
    name: "Website",
    outcome: "Improve your public website and discovery path with scoped, approval-controlled changes.",
    userAction: "Review priorities, confirm scope, and approve delivery before anything is published.",
    availability: "assisted",
    href: "/contact",
  },
  automations: {
    id: "automations",
    name: "Automations",
    outcome: "Reduce repetitive follow-up and routing work with workflows you can review and approve.",
    userAction: "Define triggers and actions with the team, then activate only after scope is confirmed.",
    availability: "assisted",
    href: "/contact",
  },
  integrations: {
    id: "integrations",
    name: "Integrations",
    outcome: "Connect the channels and tools your business already uses without losing visibility.",
    userAction: "Request supported connections and confirm access before activation.",
    availability: "assisted",
    href: "/contact",
  },
  "ai-workforce": {
    id: "ai-workforce",
    name: "AI Workforce",
    outcome: "Delegate structured growth tasks to AI specialists that operate within your approval rules.",
    userAction: "Assign missions, review plans, and approve consequential actions before they run.",
    availability: "beta",
    href: "/signup",
  },
};

export const PRODUCT_GROUPS: ProductGroup[] = [
  {
    id: "intelligence",
    label: "Intelligence",
    description: "Understand your business, market, and performance before you act.",
    productIds: ["business-growth-audit", "brand-brain", "ai-research", "analytics", "reporting"],
  },
  {
    id: "growth",
    label: "Growth",
    description: "Plan, create, and improve the channels that bring attention and demand.",
    productIds: [
      "social-copilot",
      "seo-intelligence",
      "content-creation",
      "creative-studio",
      "video-reels",
      "ads-intelligence",
    ],
  },
  {
    id: "customers",
    label: "Customers",
    description: "Capture inquiries and keep conversations moving toward a clear outcome.",
    productIds: ["crm", "whatsapp-ai"],
  },
  {
    id: "build",
    label: "Build",
    description: "Improve your digital presence and connect the tools your team relies on.",
    productIds: ["website", "automations", "integrations"],
  },
  {
    id: "ai-operations",
    label: "AI Operations",
    description: "Run structured AI work with human approval at the consequential steps.",
    productIds: ["ai-workforce"],
  },
];

export const ALL_PRODUCTS: ProductDefinition[] = Object.values(PRODUCTS);

export function getProductHref(product: ProductDefinition): string {
  if (product.marketingHref) return product.marketingHref;
  if (product.href) return product.href;
  return `/products#${product.id}`;
}

export function getProductsByGroup(groupId: ProductGroupId): ProductDefinition[] {
  const group = PRODUCT_GROUPS.find((g) => g.id === groupId);
  if (!group) return [];
  return group.productIds.map((id) => PRODUCTS[id]).filter(Boolean);
}
