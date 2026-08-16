import type { ToolName } from "@stratxcel/hermes";

export interface QualitySpec {
  tierName: "Standard" | "Premium";
  modelTier: "standard" | "premium" | "reasoning";
  deliverableStandard: string;
  revisionCycles: number;
  criticPassRequired: boolean;
  slaHours: number;
}

export interface ModularServiceDefinition {
  serviceKey: string;
  label: string;
  category: "Discovery & SEO" | "Reputation & Trust" | "Social & Content" | "Conversion & CRM" | "Advertising & Growth";
  description: string;
  customerFacingDescription: string;
  unit: string;
  defaultMonthlyQuantity: number;
  minQuantity: number;
  maxQuantity: number;
  standardQuality: QualitySpec;
  premiumQuality: QualitySpec;
  requiredTools: ToolName[];
  aiModelPolicy: {
    standardModel: string;
    premiumModel: string;
    estimatedTokensPerUnit: number;
  };
  estimatedExecutionMinutes: number;
  baseInternalCostPaise: number; // Base compute/infra cost in paise (1 INR = 100 paise)
  standardMonthlyMrpPaise: number; // Standard monthly price in paise
  premiumMonthlyMrpPaise: number; // Premium monthly price in paise
  marketAdjustmentFactor: number; // Multiplier based on tier/demand (1.0 default)
}

export const MODULAR_SERVICE_CATALOG: Record<string, ModularServiceDefinition> = {
  google_business_optimization: {
    serviceKey: "google_business_optimization",
    label: "Google Business & Local Map Optimization",
    category: "Discovery & SEO",
    description: "Weekly updates, geo-tagged photo uploads, category tuning, and local search visibility optimization on Google Maps.",
    customerFacingDescription: "Keeps your Google Business profile active, ranks higher for local 'near me' searches, and attracts nearby customers.",
    unit: "weekly_update",
    defaultMonthlyQuantity: 4,
    minQuantity: 1,
    maxQuantity: 12,
    standardQuality: {
      tierName: "Standard",
      modelTier: "standard",
      deliverableStandard: "Bi-weekly profile update & opening hours verification",
      revisionCycles: 1,
      criticPassRequired: false,
      slaHours: 48,
    },
    premiumQuality: {
      tierName: "Premium",
      modelTier: "premium",
      deliverableStandard: "Weekly keyword-optimized posts, Q&A seeding, product catalog sync, and map rank tracking",
      revisionCycles: 2,
      criticPassRequired: true,
      slaHours: 24,
    },
    requiredTools: ["get_brand_context", "update_mission_progress"],
    aiModelPolicy: {
      standardModel: "gemini-3.6-flash",
      premiumModel: "gemini-3.6-pro",
      estimatedTokensPerUnit: 1500,
    },
    estimatedExecutionMinutes: 10,
    baseInternalCostPaise: 15_00, // ₹15/unit
    standardMonthlyMrpPaise: 999_00, // ₹999/mo
    premiumMonthlyMrpPaise: 1_999_00, // ₹1,999/mo
    marketAdjustmentFactor: 1.0,
  },

  review_management: {
    serviceKey: "review_management",
    label: "Customer Review Generation & Reputation Protection",
    category: "Reputation & Trust",
    description: "Automated WhatsApp review collection links, AI response drafting, negative review escalation, and testimonial publishing.",
    customerFacingDescription: "Helps you collect more 5-star customer reviews on Google and responds professionally to customer feedback.",
    unit: "review_campaign",
    defaultMonthlyQuantity: 4,
    minQuantity: 1,
    maxQuantity: 10,
    standardQuality: {
      tierName: "Standard",
      modelTier: "standard",
      deliverableStandard: "Standard review invite templates & monthly summary",
      revisionCycles: 1,
      criticPassRequired: false,
      slaHours: 48,
    },
    premiumQuality: {
      tierName: "Premium",
      modelTier: "premium",
      deliverableStandard: "Instant WhatsApp personalized review invites, AI sentiment routing, and public trust badge widgets",
      revisionCycles: 2,
      criticPassRequired: true,
      slaHours: 12,
    },
    requiredTools: ["get_brand_context", "update_mission_progress"],
    aiModelPolicy: {
      standardModel: "gemini-3.6-flash",
      premiumModel: "gemini-3.6-pro",
      estimatedTokensPerUnit: 1200,
    },
    estimatedExecutionMinutes: 10,
    baseInternalCostPaise: 20_00, // ₹20/unit
    standardMonthlyMrpPaise: 1_499_00, // ₹1,499/mo
    premiumMonthlyMrpPaise: 2_499_00, // ₹2,499/mo
    marketAdjustmentFactor: 1.0,
  },

  local_seo: {
    serviceKey: "local_seo",
    label: "On-Page & Local Search SEO Architecture",
    category: "Discovery & SEO",
    description: "LocalBusiness Schema injection, location page architecture, meta tag optimization, and Google Search Console monitoring.",
    customerFacingDescription: "Ensures Google ranks your website prominently when local customers search for your products or services.",
    unit: "monthly_optimization",
    defaultMonthlyQuantity: 1,
    minQuantity: 1,
    maxQuantity: 4,
    standardQuality: {
      tierName: "Standard",
      modelTier: "standard",
      deliverableStandard: "Monthly technical audit & title/meta tag tuning",
      revisionCycles: 1,
      criticPassRequired: false,
      slaHours: 72,
    },
    premiumQuality: {
      tierName: "Premium",
      modelTier: "reasoning",
      deliverableStandard: "Deep JSON-LD structured data engineering, keyword gap mapping, internal link graph, and GSC rank tracking",
      revisionCycles: 3,
      criticPassRequired: true,
      slaHours: 24,
    },
    requiredTools: ["get_brand_context", "create_draft_artifact", "update_mission_progress"],
    aiModelPolicy: {
      standardModel: "gemini-3.6-flash",
      premiumModel: "gemini-3.6-pro",
      estimatedTokensPerUnit: 4000,
    },
    estimatedExecutionMinutes: 25,
    baseInternalCostPaise: 50_00, // ₹50/unit
    standardMonthlyMrpPaise: 1_999_00, // ₹1,999/mo
    premiumMonthlyMrpPaise: 3_999_00, // ₹3,999/mo
    marketAdjustmentFactor: 1.0,
  },

  whatsapp_crm_inbox: {
    serviceKey: "whatsapp_crm_inbox",
    label: "24/7 WhatsApp AI Reception & Unified CRM",
    category: "Conversion & CRM",
    description: "Instant automated WhatsApp qualification, FAQs answering, appointment booking, and customer contact sync.",
    customerFacingDescription: "An AI employee on WhatsApp that answers customer queries instantly, captures leads, and notifies you of high-value enquiries.",
    unit: "inbox_month",
    defaultMonthlyQuantity: 1,
    minQuantity: 1,
    maxQuantity: 1,
    standardQuality: {
      tierName: "Standard",
      modelTier: "standard",
      deliverableStandard: "Automated business hours auto-reply & contact capture",
      revisionCycles: 1,
      criticPassRequired: false,
      slaHours: 24,
    },
    premiumQuality: {
      tierName: "Premium",
      modelTier: "premium",
      deliverableStandard: "Full 24/7 autonomous WhatsApp conversation AI, smart catalog answers, human handover alerts, and CRM sync",
      revisionCycles: 2,
      criticPassRequired: true,
      slaHours: 4,
    },
    requiredTools: ["get_brand_context", "create_crm_lead", "create_human_handoff", "update_mission_progress"],
    aiModelPolicy: {
      standardModel: "gemini-3.6-flash",
      premiumModel: "gemini-3.6-pro",
      estimatedTokensPerUnit: 2000,
    },
    estimatedExecutionMinutes: 15,
    baseInternalCostPaise: 40_00, // ₹40/unit
    standardMonthlyMrpPaise: 1_999_00, // ₹1,999/mo
    premiumMonthlyMrpPaise: 3_499_00, // ₹3,499/mo
    marketAdjustmentFactor: 1.0,
  },

  social_autopilot: {
    serviceKey: "social_autopilot",
    label: "Social Media Autopilot (Instagram / Facebook)",
    category: "Social & Content",
    description: "AI-generated on-brand creatives, carousels, captions, hashtag strategies, and scheduled multi-platform publishing.",
    customerFacingDescription: "Generates stunning branded social posts and carousels, keeping your social channels vibrant and growing on autopilot.",
    unit: "post_package",
    defaultMonthlyQuantity: 8,
    minQuantity: 4,
    maxQuantity: 30,
    standardQuality: {
      tierName: "Standard",
      modelTier: "standard",
      deliverableStandard: "4 branded image posts per month with tailored captions",
      revisionCycles: 1,
      criticPassRequired: false,
      slaHours: 48,
    },
    premiumQuality: {
      tierName: "Premium",
      modelTier: "premium",
      deliverableStandard: "12-16 high-fidelity graphic carousels, stories, reels concepts, and engagement hashtag sets",
      revisionCycles: 3,
      criticPassRequired: true,
      slaHours: 24,
    },
    requiredTools: ["get_brand_context", "create_draft_artifact", "request_approval", "update_mission_progress"],
    aiModelPolicy: {
      standardModel: "gemini-3.6-flash",
      premiumModel: "gemini-3.6-pro",
      estimatedTokensPerUnit: 3500,
    },
    estimatedExecutionMinutes: 20,
    baseInternalCostPaise: 60_00, // ₹60/unit
    standardMonthlyMrpPaise: 2_499_00, // ₹2,499/mo (4 posts)
    premiumMonthlyMrpPaise: 4_999_00, // ₹4,999/mo (12 posts)
    marketAdjustmentFactor: 1.0,
  },

  paid_advertising: {
    serviceKey: "paid_advertising",
    label: "Targeted Paid Ad Campaigns & Creative Testing",
    category: "Advertising & Growth",
    description: "Ad copy generation, visual ad variations, audience targeting parameters, and conversion tracking.",
    customerFacingDescription: "Creates and optimizes targeted ad campaigns on Google and Meta to bring in high-intent paying customers.",
    unit: "ad_campaign",
    defaultMonthlyQuantity: 1,
    minQuantity: 1,
    maxQuantity: 4,
    standardQuality: {
      tierName: "Standard",
      modelTier: "standard",
      deliverableStandard: "2 ad creative variants & audience targeting brief",
      revisionCycles: 1,
      criticPassRequired: false,
      slaHours: 72,
    },
    premiumQuality: {
      tierName: "Premium",
      modelTier: "premium",
      deliverableStandard: "6 high-converting visual ad variants, A/B test plan, bid optimization strategy, and weekly spend audits",
      revisionCycles: 3,
      criticPassRequired: true,
      slaHours: 24,
    },
    requiredTools: ["get_brand_context", "create_draft_artifact", "request_approval", "update_mission_progress"],
    aiModelPolicy: {
      standardModel: "gemini-3.6-flash",
      premiumModel: "gemini-3.6-pro",
      estimatedTokensPerUnit: 4500,
    },
    estimatedExecutionMinutes: 30,
    baseInternalCostPaise: 100_00, // ₹100/unit
    standardMonthlyMrpPaise: 2_999_00, // ₹2,999/mo
    premiumMonthlyMrpPaise: 5_999_00, // ₹5,999/mo
    marketAdjustmentFactor: 1.0,
  },
};

export function getServiceDefinition(serviceKey: string): ModularServiceDefinition | undefined {
  return MODULAR_SERVICE_CATALOG[serviceKey];
}

export function listModularServices(): ModularServiceDefinition[] {
  return Object.values(MODULAR_SERVICE_CATALOG);
}
