export type PlanId = "free" | "starter" | "growth" | "business" | "scale";

export interface PlanEntitlements {
  workspaces: number;
  socialChannels: number;
  managedPosts: number;
  aiCreations: number | null;
  premiumMediaCredits: number;
  aiHandledLeads: number;
  whatsappCrmAutomations: number;
  seoSearchTasks: number;
  seoArticles: number;
  followUpSequences: number;
  campaigns: number;
  users: number;
  locations: number;
  websites: number;
  autonomousMissions: number;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceCents: number | null;
  priceLabel: string;
  billing: "free" | "monthly" | "quote";
  recommended?: boolean;
  summary: string;
  entitlements: PlanEntitlements;
}

export const AUDIT_PRODUCT = { id: "business_growth_audit", name: "AI Business Growth Audit", priceCents: 99_900 } as const;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: { id: "free", name: "Free", priceCents: 0, priceLabel: "₹0", billing: "free", summary: "Explore the workspace and prepare your growth system.", entitlements: { workspaces: 1, socialChannels: 0, managedPosts: 0, aiCreations: 5, premiumMediaCredits: 0, aiHandledLeads: 0, whatsappCrmAutomations: 0, seoSearchTasks: 1, seoArticles: 0, followUpSequences: 0, campaigns: 0, users: 1, locations: 1, websites: 0, autonomousMissions: 0 } },
  starter: { id: "starter", name: "Starter", priceCents: 499_900, priceLabel: "₹4,999", billing: "monthly", summary: "A complete entry system for one small or local business.", entitlements: { workspaces: 1, socialChannels: 3, managedPosts: 12, aiCreations: 30, premiumMediaCredits: 1, aiHandledLeads: 100, whatsappCrmAutomations: 1, seoSearchTasks: 4, seoArticles: 1, followUpSequences: 1, campaigns: 1, users: 2, locations: 1, websites: 0, autonomousMissions: 0 } },
  growth: { id: "growth", name: "Growth", priceCents: 999_900, priceLabel: "₹9,999", billing: "monthly", recommended: true, summary: "The serious SMB plan for recurring execution and follow-up.", entitlements: { workspaces: 1, socialChannels: 5, managedPosts: 25, aiCreations: 100, premiumMediaCredits: 2, aiHandledLeads: 500, whatsappCrmAutomations: 3, seoSearchTasks: 12, seoArticles: 2, followUpSequences: 3, campaigns: 1, users: 5, locations: 1, websites: 1, autonomousMissions: 4 } },
  business: { id: "business", name: "Business", priceCents: 1_999_900, priceLabel: "₹19,999", billing: "monthly", summary: "Advanced Search, CRM, publishing, ads support, and priority execution.", entitlements: { workspaces: 1, socialChannels: 7, managedPosts: 50, aiCreations: null, premiumMediaCredits: 4, aiHandledLeads: 1500, whatsappCrmAutomations: 8, seoSearchTasks: 30, seoArticles: 4, followUpSequences: 8, campaigns: 3, users: 10, locations: 3, websites: 1, autonomousMissions: 15 } },
  scale: { id: "scale", name: "Scale / Custom", priceCents: null, priceLabel: "₹34,999+", billing: "quote", summary: "Custom limits for multi-location, high-volume, or advanced execution.", entitlements: { workspaces: 1, socialChannels: 10, managedPosts: 75, aiCreations: null, premiumMediaCredits: 6, aiHandledLeads: 2500, whatsappCrmAutomations: 12, seoSearchTasks: 40, seoArticles: 6, followUpSequences: 12, campaigns: 5, users: 15, locations: 5, websites: 2, autonomousMissions: 25 } },
};

export const PUBLIC_PLAN_IDS: readonly PlanId[] = ["free", "starter", "growth", "business", "scale"];
export const SELF_CHECKOUT_PLAN_IDS: readonly PlanId[] = ["starter", "growth", "business"];
export const USAGE_WARNING_THRESHOLDS = [80, 90, 100] as const;

export function isPlanId(value: unknown): value is PlanId { return typeof value === "string" && value in PLANS; }
export function isSelfCheckoutPlan(value: PlanId): boolean { return SELF_CHECKOUT_PLAN_IDS.includes(value); }
export function formatGstInclusivePrice(plan: PlanDefinition): string { return plan.billing === "quote" ? `${plan.priceLabel}/month · custom quote; GST shown in order` : `${plan.priceLabel}${plan.billing === "monthly" ? "/month" : ""} · GST included`; }

export const FAIR_USE_POLICY = {
  aiDrafts: "Fair-use AI drafts and ideas are included; commodity text is not metered per token.",
  noSurpriseOverages: "No automatic overage charges. We warn at 80%, 90%, and 100% before optional paid expansion.",
  leadContinuity: "At plan limits, inbound leads are still captured and stored, the owner is notified, and a critical acknowledgement may be sent. Expensive optional automation pauses after grace until upgrade or add-on approval.",
  whatsappUnit: "An AI-handled lead is a lead journey—not a CRM contact or raw message—and may include capture, understanding, qualification, CRM update, approved follow-up, appointment or handoff, and outcome tracking.",
  whatsappProviderSeparation: "WhatsApp Business Platform, template, and provider charges are separate from the Stratxcel AI-handled-lead allowance unless a written order expressly includes them.",
  planChanges: "Upgrades and downgrades take effect at the next renewal. No proration unless a separately tested written order supports it.",
} as const;
