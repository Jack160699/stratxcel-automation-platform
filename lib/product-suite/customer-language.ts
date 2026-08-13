import type { ProductDefinition } from "./types.ts";
import { PRODUCTS } from "./taxonomy.ts";

export interface CustomerProductPresentation {
  headline: string;
  problem: string;
  capability: string;
  ctaLabel: string;
}

export type CustomerOutcomeGroupId =
  | "get-more-customers"
  | "market-my-business"
  | "manage-customers"
  | "understand-my-business"
  | "save-time"
  | "build-my-online-presence";

export interface CustomerOutcomeGroup {
  id: CustomerOutcomeGroupId;
  label: string;
  description: string;
  productIds: string[];
}

export const CUSTOMER_PRODUCT_PRESENTATION: Record<string, CustomerProductPresentation> = {
  "business-growth-audit": {
    headline: "Find what's holding your business back",
    problem: "You know something isn't working, but it's hard to see where growth is leaking.",
    capability: "Get a staff-reviewed audit with a clear 30/60/90-day roadmap before bigger work begins.",
    ctaLabel: "Start the Audit",
  },
  "brand-brain": {
    headline: "Keep your messaging consistent everywhere",
    problem: "Your team says different things on social, WhatsApp, and your website.",
    capability: "Capture your brand context once and use it to guide content, campaigns, and reviews.",
    ctaLabel: "Set up Brand Brain",
  },
  "ai-research": {
    headline: "Spot opportunities your competitors miss",
    problem: "You don't have time to dig into competitors, trends, and what's changing in your market.",
    capability: "Request research topics and review structured findings inside your workspace.",
    ctaLabel: "Explore AI Research",
  },
  analytics: {
    headline: "See what's working in your business",
    problem: "Performance data is scattered and hard to interpret when you're busy running the business.",
    capability: "Review connected channel data and see which signals deserve attention next.",
    ctaLabel: "Talk about Analytics",
  },
  reporting: {
    headline: "Get updates without digging through data",
    problem: "You want clear summaries of what changed — not another dashboard to babysit.",
    capability: "Receive staff-prepared reports on what worked, what shifted, and what needs a decision.",
    ctaLabel: "Talk about Reporting",
  },
  "social-copilot": {
    headline: "Grow on social media",
    problem: "Posting consistently is hard when you're focused on customers and daily operations.",
    capability: "Plan, create, review, and publish social content from one connected workspace.",
    ctaLabel: "Explore Social Copilot",
  },
  "seo-intelligence": {
    headline: "Get found on Google",
    problem: "Customers search for what you offer, but your business doesn't show up where it should.",
    capability: "Review prioritized search and website improvements before any work begins.",
    ctaLabel: "Talk about SEO",
  },
  "content-creation": {
    headline: "Create better content, faster",
    problem: "Writing posts, captions, and campaign copy takes too long and often sounds off-brand.",
    capability: "Prepare on-brand drafts from your Brand Brain and approve before anything goes live.",
    ctaLabel: "Talk about Content",
  },
  "creative-studio": {
    headline: "Make on-brand images without a designer",
    problem: "You need visuals for posts and campaigns but don't have a designer on call.",
    capability: "Generate and refine images aligned with your brand direction.",
    ctaLabel: "Try Creative Studio",
  },
  "video-reels": {
    headline: "Turn ideas into short videos",
    problem: "Short-form video matters, but the production workflow feels overwhelming to start.",
    capability: "Scope video needs with the team before production or publishing begins.",
    ctaLabel: "Learn about Video & Reels",
  },
  "ads-intelligence": {
    headline: "Spend smarter on ads",
    problem: "Ad spend feels like guesswork without clear signals on what's working.",
    capability: "Review campaign performance and confirm where spend should shift next.",
    ctaLabel: "Talk about Ads",
  },
  crm: {
    headline: "Never lose a customer enquiry",
    problem: "Leads come in from everywhere and follow-up slips through the cracks.",
    capability: "Log inquiries, assign ownership, and track outcomes in one pipeline view.",
    ctaLabel: "Set up CRM",
  },
  "whatsapp-ai": {
    headline: "Follow up faster on WhatsApp",
    problem: "WhatsApp enquiries pile up and replies are slow or inconsistent.",
    capability: "Respond faster with guided follow-up that stays under your control.",
    ctaLabel: "Talk about WhatsApp",
  },
  website: {
    headline: "Build a stronger online presence",
    problem: "Your website doesn't reflect how good your business really is.",
    capability: "Improve your public website with scoped, approval-controlled changes.",
    ctaLabel: "Talk about Website",
  },
  automations: {
    headline: "Stop doing the same tasks over and over",
    problem: "Repetitive follow-up and routing work eats hours every week.",
    capability: "Set up workflows you can review and approve before they run.",
    ctaLabel: "Talk about Automations",
  },
  integrations: {
    headline: "Connect the tools you already use",
    problem: "Your tools don't talk to each other and visibility disappears across channels.",
    capability: "Connect the channels and tools your business relies on without losing oversight.",
    ctaLabel: "Talk about Integrations",
  },
  "ai-workforce": {
    headline: "Let AI handle repetitive growth work",
    problem: "Growth tasks pile up, but hiring more people isn't the answer yet.",
    capability: "Delegate structured growth missions to AI specialists that operate within your approval rules.",
    ctaLabel: "Explore AI Workforce",
  },
};

export const CUSTOMER_OUTCOME_GROUPS: CustomerOutcomeGroup[] = [
  {
    id: "get-more-customers",
    label: "Get more customers",
    description: "Find growth gaps, improve discovery, and spend smarter on ads.",
    productIds: ["business-growth-audit", "seo-intelligence", "ads-intelligence"],
  },
  {
    id: "market-my-business",
    label: "Market my business",
    description: "Show up consistently on social and create content that represents your brand.",
    productIds: ["social-copilot", "content-creation", "creative-studio", "video-reels"],
  },
  {
    id: "manage-customers",
    label: "Manage customers",
    description: "Capture enquiries and keep conversations moving toward a clear outcome.",
    productIds: ["crm", "whatsapp-ai"],
  },
  {
    id: "understand-my-business",
    label: "Understand my business",
    description: "Stay consistent, spot opportunities, and see what's actually working.",
    productIds: ["brand-brain", "ai-research", "analytics", "reporting"],
  },
  {
    id: "save-time",
    label: "Save time",
    description: "Automate repetitive work, connect your tools, and delegate structured tasks to AI.",
    productIds: ["automations", "integrations", "ai-workforce"],
  },
  {
    id: "build-my-online-presence",
    label: "Build my online presence",
    description: "Improve the website and discovery path customers see first.",
    productIds: ["website"],
  },
];

export const CUSTOMER_VALUE_PROPS = [
  "Honest availability labels on every product — Live, Beta, Staff-assisted, and Coming later",
  "You stay in control — human approval before publishing, spend changes, or outreach",
  "Start with clarity — Business Growth Audit recommended before monthly capabilities activate",
] as const;

export const HOMEPAGE_FEATURED_PRODUCT_IDS = [
  "business-growth-audit",
  "social-copilot",
  "crm",
  "seo-intelligence",
] as const;

export function getCustomerPresentation(productId: string): CustomerProductPresentation | undefined {
  return CUSTOMER_PRODUCT_PRESENTATION[productId];
}

export function getCustomerPresentationForProduct(product: ProductDefinition): CustomerProductPresentation {
  const presentation = CUSTOMER_PRODUCT_PRESENTATION[product.id];
  if (presentation) return presentation;

  return {
    headline: product.outcome,
    problem: product.outcome,
    capability: product.userAction,
    ctaLabel: `Explore ${product.name}`,
  };
}

export function getProductsByCustomerOutcomeGroup(groupId: CustomerOutcomeGroupId): ProductDefinition[] {
  const group = CUSTOMER_OUTCOME_GROUPS.find((g) => g.id === groupId);
  if (!group) return [];
  return group.productIds.map((id) => PRODUCTS[id]).filter(Boolean);
}

export function getAllCustomerOutcomeProductIds(): string[] {
  return CUSTOMER_OUTCOME_GROUPS.flatMap((group) => group.productIds);
}

export function getFeaturedHomepageProducts(): ProductDefinition[] {
  return HOMEPAGE_FEATURED_PRODUCT_IDS.map((id) => PRODUCTS[id]).filter(Boolean);
}
