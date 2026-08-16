import type { NormalizedWebsiteIntelligence } from "../website-intelligence.ts";

export type RequirementPriority =
  | "REQUIRED"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "NOT_CURRENTLY_REQUIRED";

export interface RequirementItem {
  id: string;
  requirementKey: string;
  title: string;
  priority: RequirementPriority;
  reason: string;
  evidence: string;
  businessImpact: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  recommendedServiceKey: string;
  expectedFrequency: string;
  expectedQuantity: number;
  dependencies: string[];
}

export interface RequirementSynthesisInput {
  tenantId?: string;
  businessName: string;
  businessType: string;
  industry: string;
  operatingLocations: string[];
  websiteIntelligence?: NormalizedWebsiteIntelligence;
  connectedAssets?: {
    googleBusiness?: boolean;
    googleSearchConsole?: boolean;
    googleAnalytics?: boolean;
    instagram?: boolean;
    facebook?: boolean;
    whatsapp?: boolean;
  };
  customerGoals?: string[];
  historicalPerformance?: Record<string, unknown>;
}

export interface RequirementSynthesisResult {
  requirements: RequirementItem[];
  highPriorityCount: number;
  unneededServicesCount: number;
  executiveSummary: string;
}

/**
 * Requirement Intelligence Engine.
 * Synthesizes business facts and connected assets into strictly personalized,
 * evidence-backed business requirements. Never pushes unnecessary services.
 */
export function synthesizeBusinessRequirements(
  input: RequirementSynthesisInput,
): RequirementSynthesisResult {
  const requirements: RequirementItem[] = [];
  const typeLower = (input.businessType || "").toLowerCase();
  const indLower = (input.industry || "").toLowerCase();
  const web = input.websiteIntelligence;
  const connected = input.connectedAssets ?? {};

  const isGeneralStore =
    /general store|grocery|retail store|kirana|supermarket|convenience store|provisions/i.test(
      `${typeLower} ${indLower} ${input.businessName.toLowerCase()}`,
    );

  const isRestaurant = /restaurant|cafe|food|dining|bakery|eatery/i.test(
    `${typeLower} ${indLower}`,
  );

  const isClinic = /clinic|doctor|dental|dentist|healthcare|hospital|medical|therapy/i.test(
    `${typeLower} ${indLower}`,
  );

  const isEcommerce =
    /ecommerce|e-commerce|online store|apparel|d2c/i.test(`${typeLower} ${indLower}`) ||
    (web?.business.ecommerceAvailable.value ?? false);

  const isLocalService =
    /plumber|electrician|cleaning|contractor|salon|spa|car repair|mechanic|lawyer|local service/i.test(
      `${typeLower} ${indLower}`,
    ) || isGeneralStore || isRestaurant || isClinic;

  const isB2B =
    /b2b|software|consulting|agency|corporate|manufacturing|wholesale/i.test(
      `${typeLower} ${indLower}`,
    ) || (web?.audience.b2bOrB2c.value === "B2B");

  // 1. Google Business Profile & Local Discovery
  if (isLocalService || input.operatingLocations.length > 0) {
    const hasGbp = connected.googleBusiness === true;
    requirements.push({
      id: "req-google-business",
      requirementKey: "google_business_optimization",
      title: "Google Business Profile & Local Discovery Optimization",
      priority: isGeneralStore || isRestaurant || isClinic ? "HIGH" : "REQUIRED",
      reason: isGeneralStore
        ? "Local customers find grocery and general stores primarily via Google Maps & near-me search queries."
        : "Local search and Google Maps are the highest-converting discovery channels for your location.",
      evidence: `Operating location: ${input.operatingLocations[0] || "Local area"}. Google connection status: ${hasGbp ? "Connected" : "Requires optimization"}`,
      businessImpact: "Drives immediate walk-ins and local phone/direction enquiries.",
      confidence: "HIGH",
      recommendedServiceKey: "google_business_optimization",
      expectedFrequency: "weekly",
      expectedQuantity: 4,
      dependencies: [],
    });
  }

  // 2. Reviews & Trust Management
  const reviewsCount = web?.trust.reviewCount ?? 0;
  requirements.push({
    id: "req-review-management",
    requirementKey: "review_management",
    title: "Customer Review Generation & Reputation Protection",
    priority: "HIGH",
    reason: isGeneralStore
      ? "High star ratings and frequent fresh reviews establish customer trust and improve Google Maps ranking."
      : "Active review collection builds conversion confidence and protects online brand credibility.",
    evidence: reviewsCount > 0
      ? `Observed ${reviewsCount} reviews with rating ${web?.trust.rating ?? 5.0}`
      : "No automated review collection or public review badges detected on site.",
    businessImpact: "Increases click-through and customer decision confidence by up to 40%.",
    confidence: "HIGH",
    recommendedServiceKey: "review_management",
    expectedFrequency: "weekly",
    expectedQuantity: 4,
    dependencies: ["google_business_optimization"],
  });

  // 3. Local SEO & Technical Foundation
  const brokenLinks = web?.seo.brokenLinksCount ?? 0;
  const h1Missing = (web?.seo.h1PresentRatio ?? 1) < 0.5;
  requirements.push({
    id: "req-local-seo",
    requirementKey: "local_seo",
    title: "On-Page & Local SEO Architecture",
    priority: isGeneralStore ? "MEDIUM" : "HIGH",
    reason: "Structured location signals and LocalBusiness metadata allow search engines to rank your offerings for geo-targeted searches.",
    evidence: `Technical audit: ${brokenLinks} broken links, schema types: ${web?.seo.schemaTypes?.join(", ") || "None"}`,
    businessImpact: "Compounds organic discoverability without continuous ad spend.",
    confidence: "HIGH",
    recommendedServiceKey: "local_seo",
    expectedFrequency: "monthly",
    expectedQuantity: 1,
    dependencies: [],
  });

  // 4. Website Conversion & Instant WhatsApp Contact
  const hasWhatsapp = Boolean(web?.conversion.whatsapp.value);
  requirements.push({
    id: "req-website-conversion",
    requirementKey: "website_conversion",
    title: "Instant WhatsApp & Mobile Lead Conversion",
    priority: "MEDIUM",
    reason: "Visitors require a frictionless path to enquire, place orders, or ask questions directly on WhatsApp.",
    evidence: hasWhatsapp
      ? `Active WhatsApp button found: ${web?.conversion.whatsapp.value}`
      : "No direct instant WhatsApp chat conversion mechanism detected on crawled pages.",
    businessImpact: "Reduces visitor bounce rate and captures high-intent immediate inquiries.",
    confidence: "HIGH",
    recommendedServiceKey: "whatsapp_crm_inbox",
    expectedFrequency: "monthly",
    expectedQuantity: 1,
    dependencies: [],
  });

  // 5. Social Autopilot (Instagram / Facebook)
  if (isGeneralStore) {
    // GENERAL STORE SPECIFIC RULE: Social is NOT currently required!
    requirements.push({
      id: "req-social-autopilot-general-store",
      requirementKey: "social_autopilot",
      title: "Instagram & Facebook Social Media Autopilot",
      priority: "NOT_CURRENTLY_REQUIRED",
      reason: "General stores and local convenience grocers rely heavily on hyper-local foot traffic, Google Maps, and WhatsApp orders rather than social media feeds.",
      evidence: `Business categorized as ${input.businessType}. Local physical intent dominates customer acquisition.`,
      businessImpact: "Social posting provides negligible ROI for neighbourhood convenience retail at this stage.",
      confidence: "HIGH",
      recommendedServiceKey: "social_autopilot",
      expectedFrequency: "none",
      expectedQuantity: 0,
      dependencies: [],
    });
  } else if (isB2B) {
    requirements.push({
      id: "req-social-autopilot-b2b",
      requirementKey: "social_autopilot",
      title: "Consumer Social Media (Instagram / TikTok)",
      priority: "NOT_CURRENTLY_REQUIRED",
      reason: "B2B client acquisition is driven by search intent, LinkedIn, and direct outreach rather than consumer visual feeds.",
      evidence: `Business model: B2B.`,
      businessImpact: "Consumer social spend produces low enterprise lead conversion.",
      confidence: "HIGH",
      recommendedServiceKey: "social_autopilot",
      expectedFrequency: "none",
      expectedQuantity: 0,
      dependencies: [],
    });
  } else if (isEcommerce || isRestaurant) {
    requirements.push({
      id: "req-social-autopilot-active",
      requirementKey: "social_autopilot",
      title: "Social Media Autopilot & Visual Storytelling",
      priority: "HIGH",
      reason: "Visual products, food dishes, and lifestyle offerings convert strongly on Instagram and Facebook feeds.",
      evidence: `Discovered social channels: ${web?.digitalPresence.socialChannels.map((c) => c.platform).join(", ") || "None"}`,
      businessImpact: "Maintains top-of-mind brand awareness and stimulates recurring impulse purchases.",
      confidence: "HIGH",
      recommendedServiceKey: "social_autopilot",
      expectedFrequency: "weekly",
      expectedQuantity: 12,
      dependencies: ["brand_intelligence"],
    });
  } else {
    requirements.push({
      id: "req-social-autopilot-std",
      requirementKey: "social_autopilot",
      title: "Social Media Autopilot & Presence",
      priority: "LOW",
      reason: "Baseline branded social presence builds secondary credibility when prospects research your business.",
      evidence: "Secondary trust factor.",
      businessImpact: "Supports brand validation.",
      confidence: "MEDIUM",
      recommendedServiceKey: "social_autopilot",
      expectedFrequency: "weekly",
      expectedQuantity: 4,
      dependencies: [],
    });
  }

  // 6. Paid Social / Search Ads
  if (isGeneralStore) {
    requirements.push({
      id: "req-paid-ads-general-store",
      requirementKey: "paid_advertising",
      title: "Paid Social & Search Advertising",
      priority: "NOT_CURRENTLY_REQUIRED",
      reason: "Paid digital ads are cost-inefficient for small neighbourhood grocery retail with tight operating margins.",
      evidence: "General store unit economics.",
      businessImpact: "Avoids unnecessary ad budget wastage.",
      confidence: "HIGH",
      recommendedServiceKey: "paid_advertising",
      expectedFrequency: "none",
      expectedQuantity: 0,
      dependencies: [],
    });
  } else if (isEcommerce) {
    requirements.push({
      id: "req-paid-ads-ecommerce",
      requirementKey: "paid_advertising",
      title: "Targeted Paid Product & Search Ads",
      priority: "HIGH",
      reason: "Paid traffic accelerates product discovery and scales customer acquisition for online stores.",
      evidence: "E-commerce transactional capability detected.",
      businessImpact: "Drives scalable, measurable product sales and revenue velocity.",
      confidence: "HIGH",
      recommendedServiceKey: "paid_advertising",
      expectedFrequency: "monthly",
      expectedQuantity: 1,
      dependencies: ["website_conversion"],
    });
  }

  // Calculate stats
  const highPriorityCount = requirements.filter(
    (r) => r.priority === "REQUIRED" || r.priority === "HIGH",
  ).length;
  const unneededServicesCount = requirements.filter(
    (r) => r.priority === "NOT_CURRENTLY_REQUIRED",
  ).length;

  let summary = `Identified ${highPriorityCount} high-priority growth requirements for ${input.businessName}.`;
  if (isGeneralStore) {
    summary += " Optimized specifically for local convenience retail: prioritizing Google Maps, review growth, and local discoverability while excluding unnecessary social ad overhead.";
  }

  return {
    requirements,
    highPriorityCount,
    unneededServicesCount,
    executiveSummary: summary,
  };
}
