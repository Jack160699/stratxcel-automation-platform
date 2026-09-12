/**
 * StratXcel Business Brain & Canonical Offer Catalog
 *
 * Permanent, immutable definition of StratXcel's core identity,
 * capabilities, pricing policies, and approved service catalog.
 *
 * Enforces the Strict Pricing Rule:
 * Hermes will NEVER invent StratXcel prices.
 * Any unlisted service or price modification requires explicit Founder consultation.
 */

export interface StratXcelCapabilityDefinition {
  key: string;
  name: string;
  category: "development" | "marketing" | "sales" | "automation" | "ai";
  description: string;
  isAvailable: boolean;
}

export interface StratXcelCanonicalOffer {
  id: string;
  key: string;
  name: string;
  category: string;
  pagesOrScope: string;
  startingPriceInr: number;
  billingFrequency: "one_time" | "monthly" | "custom_quotation";
  minimumCommitmentMonths?: number;
  description: string;
  deliverables: readonly string[];
  targetAudience: string;
  salesPitch: string;
  pricingRuleNote: string;
  isConsultationRequired?: boolean;
}

export const STRATXCEL_COMPANY_PROFILE = {
  companyName: "StratXcel",
  tagline: "Autonomous Growth Engine & Digital Infrastructure for Ambitious Businesses",
  operatingCurrencies: ["INR"],
  headquarters: "Raipur, Chhattisgarh, India",
  primaryFocus: "Empowering businesses through websites, local SEO, GMB growth, sales automation, and AI workforce systems.",
  standingObjective: "GROW STRATXCEL REVENUE.",
  pricingPolicy: "STRICT_CANONICAL_PRICING",
} as const;

export const STRATXCEL_CAPABILITIES: readonly StratXcelCapabilityDefinition[] = [
  {
    key: "website_development",
    name: "Website Development",
    category: "development",
    description: "Modern, responsive, fast-loading business websites with clean typography, conversion architecture, and mobile-first design.",
    isAvailable: true,
  },
  {
    key: "premium_website_development",
    name: "Premium Website Development",
    category: "development",
    description: "High-end bespoke digital experiences with custom UI design, fluid animations, deep content structure, and enterprise credibility.",
    isAvailable: true,
  },
  {
    key: "custom_website_development",
    name: "Custom Website Development",
    category: "development",
    description: "Full-stack tailored web applications with dynamic databases, customer portals, custom calculators, and business logic.",
    isAvailable: true,
  },
  {
    key: "seo",
    name: "Search Engine Optimization (SEO)",
    category: "marketing",
    description: "On-page optimization, technical search architecture, schema markup, content authority, and search visibility growth.",
    isAvailable: true,
  },
  {
    key: "google_business_growth",
    name: "Google Business / Maps Growth",
    category: "marketing",
    description: "Google Maps optimization, local citation building, review generation funnels, local ranking expansion, and store visit driving.",
    isAvailable: true,
  },
  {
    key: "social_media_management",
    name: "Social Media Management",
    category: "marketing",
    description: "Curated brand posting, graphic poster creation, content calendar planning, engagement driving, and brand authority.",
    isAvailable: true,
  },
  {
    key: "content_creation",
    name: "Content Creation",
    category: "marketing",
    description: "Compelling copywriting, high-converting landing page text, industry research articles, and marketing creatives.",
    isAvailable: true,
  },
  {
    key: "advertising",
    name: "Advertising (Meta & Google Ads)",
    category: "marketing",
    description: "Targeted lead generation ad campaigns, audience segmentation, creative testing, ROAS tracking, and paid acquisition funnels.",
    isAvailable: true,
  },
  {
    key: "lead_generation",
    name: "Lead Generation",
    category: "sales",
    description: "B2B and B2C commercial lead discovery, intent qualification, database enrichment, and verified outreach queues.",
    isAvailable: true,
  },
  {
    key: "crm",
    name: "CRM & Pipeline Management",
    category: "sales",
    description: "Unified customer relationship management, lifecycle stage tracking, appointment scheduling, and deal progression.",
    isAvailable: true,
  },
  {
    key: "whatsapp_automation",
    name: "WhatsApp Automation",
    category: "automation",
    description: "Intelligent WhatsApp business workflows, conversational sales assistance, follow-up sequences, and instant customer notifications.",
    isAvailable: true,
  },
  {
    key: "ai_agents",
    name: "AI Agents",
    category: "ai",
    description: "Autonomous specialized AI workers for research, content, customer service, sales qualification, and company operations.",
    isAvailable: true,
  },
  {
    key: "business_automation",
    name: "Business Automation",
    category: "automation",
    description: "End-to-end workflow automation connecting lead capture, payments, invoicing, notifications, and client handoffs.",
    isAvailable: true,
  },
  {
    key: "custom_software_integrations",
    name: "Custom Software / Integrations",
    category: "development",
    description: "Third-party API integrations (Razorpay, Google, Meta, WhatsApp, CRM, Webhooks) and tailored business software.",
    isAvailable: true,
  },
];

export const STRATXCEL_CANONICAL_OFFERS: readonly StratXcelCanonicalOffer[] = [
  {
    id: "stratxcel-normal-website",
    key: "NORMAL_WEBSITE",
    name: "Normal Business Website",
    category: "Web Development",
    pagesOrScope: "3–5 Pages",
    startingPriceInr: 3000,
    billingFrequency: "one_time",
    description: "Clean, fast-loading, mobile-friendly 3–5 page website for local service businesses, retail stores, and independent professionals.",
    deliverables: [
      "3 to 5 responsive pages (Home, About, Services, Gallery/Portfolio, Contact)",
      "Mobile-optimized layout and fast asset compression",
      "Direct Click-to-WhatsApp call-to-action buttons",
      "Google Maps embedding and basic schema markup",
      "Hosting setup and domain connection",
    ],
    targetAudience: "Small local businesses, optical shops, clinics, salons, local retailers needing an essential web presence.",
    salesPitch: "Establish immediate digital credibility with a clean, fast-loading website that turns local visitors into paying inquiries.",
    pricingRuleNote: "Starting price strictly ₹3,000. Do not discount below ₹3,000 without Founder approval.",
  },
  {
    id: "stratxcel-premium-website",
    key: "PREMIUM_DETAILED_WEBSITE",
    name: "Premium Detailed Website",
    category: "Web Development",
    pagesOrScope: "6–10 Pages + Detailed Catalog/Services",
    startingPriceInr: 5000,
    billingFrequency: "one_time",
    description: "Comprehensive multi-page website with in-depth service breakdowns, case studies, conversion funnels, and rich interactive styling.",
    deliverables: [
      "6 to 10 detailed pages with custom graphic assets",
      "Deep service/product showcase catalog",
      "Customer enquiry capture forms with instant lead routing",
      "Local SEO on-page metadata optimization",
      "Customer testimonial & review highlights showcase",
      "Interactive WhatsApp booking/inquiry flow",
    ],
    targetAudience: "Growing SMBs, professional consultancies, healthcare centers, established contractors, fitness centers.",
    salesPitch: "Showcase your entire service capability and outshine local competitors with a premium, high-conversion business website.",
    pricingRuleNote: "Starting price strictly ₹5,000. Never quote below ₹5,000.",
  },
  {
    id: "stratxcel-customized-website",
    key: "CUSTOMIZED_WEBSITE",
    name: "Customized Business Website",
    category: "Web Development",
    pagesOrScope: "10+ Pages + Custom Architecture",
    startingPriceInr: 10000,
    billingFrequency: "one_time",
    description: "Tailored enterprise website with bespoke layouts, customized brand visual language, dynamic filtering, and multi-location support.",
    deliverables: [
      "10+ bespoke structured pages",
      "Custom UI components tailored to brand identity",
      "Dynamic filtering, location pages, and rich media galleries",
      "Advanced on-page SEO, FAQ schemas, and performance optimization",
      "Multi-channel lead capture (WhatsApp + Email + CRM webhook)",
    ],
    targetAudience: "Medium enterprises, industrial manufacturers, multi-branch clinics, educational academies, regional brands.",
    salesPitch: "A tailored digital flagship built specifically for your business model to scale authority and inbound commercial inquiries.",
    pricingRuleNote: "Starting price strictly ₹10,000. Extra complexity or integrations priced upon consultation.",
  },
  {
    id: "stratxcel-complex-website",
    key: "COMPLEX_CUSTOM_WEBSITE",
    name: "Complex / Custom Enterprise Website",
    category: "Web Development & Software",
    pagesOrScope: "Custom Architecture & Software Logic",
    startingPriceInr: 0, // 0 signifies consultation required
    billingFrequency: "custom_quotation",
    isConsultationRequired: true,
    description: "Complex web applications featuring custom portals, e-commerce, user authentication, proprietary business calculators, or custom workflows.",
    deliverables: [
      "Consultation and technical architecture specification",
      "Custom front-end and backend application logic",
      "Payment gateway integration (Razorpay)",
      "Database models and admin dashboard management",
      "Custom security, roles, and automated workflows",
    ],
    targetAudience: "Startups, platforms, manufacturers with client portals, high-volume distributors.",
    salesPitch: "Bespoke digital software and web architecture engineered precisely to your unique operational workflow.",
    pricingRuleNote: "CONSULTATION REQUIRED. Never guess or fabricate a fixed price. A technical scoping call is required before quotation.",
  },
  {
    id: "stratxcel-seo-growth",
    key: "SEO",
    name: "Continuous Search Engine Optimization (SEO)",
    category: "Search & Visibility",
    pagesOrScope: "Continuous Monthly Optimization (Min. 3 Months)",
    startingPriceInr: 5000,
    billingFrequency: "monthly",
    minimumCommitmentMonths: 3,
    description: "Ongoing organic search growth engine covering technical audit, on-page optimization, content authority, keyword ranking, and local search visibility.",
    deliverables: [
      "Keyword discovery and search intent mapping",
      "On-page optimization (titles, metas, headings, internal linking, image alt tags)",
      "Technical health audits and schema markup (LocalBusiness, Service, FAQ)",
      "Monthly performance reporting (GSC impressions, clicks, keyword rank changes)",
      "Legitimate authority building and Google search placement monitoring",
    ],
    targetAudience: "Businesses whose customers search on Google (dentists, solar installers, manufacturers, legal/accounting, schools).",
    salesPitch: "Dominate Google search results for the keywords your highest-paying customers type every day.",
    pricingRuleNote: "Starting price strictly ₹5,000/month. Minimum commitment: 3 MONTHS (₹15,000 total). NEVER sell 1-month or 2-month standalone SEO.",
  },
  {
    id: "stratxcel-social-standard",
    key: "SOCIAL_MEDIA_STANDARD",
    name: "Social Media Management — Standard",
    category: "Social Media & Content",
    pagesOrScope: "30 Days Content Management",
    startingPriceInr: 3500,
    billingFrequency: "monthly",
    description: "Consistent, professional brand presence across Instagram & Facebook with high-quality graphic posters and promotional visuals.",
    deliverables: [
      "12 to 15 professionally designed branded graphic posters per 30 days",
      "Strategic festival & special event promotional creatives",
      "Engaging copy captions and targeted hashtag research",
      "Content publishing schedule aligned with peak customer activity",
    ],
    targetAudience: "Restaurants, cafes, retail boutiques, fitness studios, local service businesses wanting active social presence.",
    salesPitch: "Keep your social media looking polished, active, and trustworthy with eye-catching graphic posters every week.",
    pricingRuleNote: "Strictly ₹3,500 per 30 days. Do not discount.",
  },
  {
    id: "stratxcel-social-premium",
    key: "SOCIAL_MEDIA_PREMIUM",
    name: "Social Media Management — Premium",
    category: "Social Media & Content",
    pagesOrScope: "30 Days Comprehensive Growth & Content",
    startingPriceInr: 5000,
    billingFrequency: "monthly",
    description: "Full-service social media authority engine: in-depth market research, carousel designs, educational reels/posters, and strategic content planning.",
    deliverables: [
      "20 to 24 premium visual creatives per 30 days (carousels, infographics, educational posters)",
      "Deep industry research and competitive differentiation content",
      "High-conversion copywriting with direct WhatsApp call-to-actions",
      "Audience engagement strategy and monthly growth review",
    ],
    targetAudience: "Premium clinics, luxury brands, real estate firms, B2B services, leading coaching academies.",
    salesPitch: "Transform your social profiles into customer acquisition channels with research-backed, industry-leading content.",
    pricingRuleNote: "Strictly ₹5,000 per 30 days. Never quote below ₹5,000.",
  },
  {
    id: "stratxcel-google-maps-growth",
    key: "GOOGLE_BUSINESS_MAPS_GROWTH",
    name: "Google Business / Maps Local Growth",
    category: "Local Discovery & Reputation",
    pagesOrScope: "Monthly Local Search Dominance",
    startingPriceInr: 3000,
    billingFrequency: "monthly",
    description: "Dominates local 3-pack Google Maps discovery for nearby customers searching 'near me' or city-specific services.",
    deliverables: [
      "Complete Google Business Profile audit and verification optimization",
      "Local keyword category tuning and secondary category expansion",
      "Weekly Google updates, photo uploads, and product/service listings",
      "Review generation strategy and customer review response management",
      "Local citation consistency audits across business directories",
    ],
    targetAudience: "Walk-in and local discovery businesses: optical shops, restaurants, diagnostic labs, clinics, gyms, repair shops.",
    salesPitch: "Be the first business local customers see when they search for your service nearby on Google Maps.",
    pricingRuleNote: "Baseline strictly ₹3,000/month. Custom pricing may only be recommended when multi-location or hyper-competitive markets justify it.",
  },
];

/**
 * Enforces the non-negotiable StratXcel Pricing Rule.
 * Validates proposed price against canonical catalog.
 */
export function validateStratXcelPricing(
  offerKey: string,
  proposedPriceInr: number,
  commitmentMonths: number = 1
): {
  isValid: boolean;
  canonicalOffer?: StratXcelCanonicalOffer;
  reason?: string;
} {
  const offer = STRATXCEL_CANONICAL_OFFERS.find(
    (o) => o.key.toUpperCase() === offerKey.toUpperCase() || o.id === offerKey
  );

  if (!offer) {
    return {
      isValid: false,
      reason: `Unknown offer key "${offerKey}". Hermes must never invent offerings; consult Founder or use approved catalog.`,
    };
  }

  // Complex custom websites require consultation
  if (offer.isConsultationRequired) {
    if (proposedPriceInr <= 0) {
      return {
        isValid: true,
        canonicalOffer: offer,
        reason: "Consultation required before quotation.",
      };
    }
    // Any quoted price for custom site must have consultation flag
    return {
      isValid: true,
      canonicalOffer: offer,
      reason: "Custom quotation subject to Founder/technical scoping.",
    };
  }

  // SEO minimum 3-month commitment rule
  if (offer.key === "SEO") {
    if (commitmentMonths < 3) {
      return {
        isValid: false,
        canonicalOffer: offer,
        reason: "Strict Policy Violation: Standalone 1-month or 2-month SEO is prohibited. Minimum commitment is 3 months (₹15,000 min).",
      };
    }
    if (proposedPriceInr < offer.startingPriceInr) {
      return {
        isValid: false,
        canonicalOffer: offer,
        reason: `Price ₹${proposedPriceInr} is below canonical SEO floor of ₹${offer.startingPriceInr}/month.`,
      };
    }
    return { isValid: true, canonicalOffer: offer };
  }

  // Minimum starting price check for all canonical offers
  if (proposedPriceInr < offer.startingPriceInr) {
    return {
      isValid: false,
      canonicalOffer: offer,
      reason: `Price ₹${proposedPriceInr} violates StratXcel policy: starting price for ${offer.name} is strictly ₹${offer.startingPriceInr}. Never invent lower prices.`,
    };
  }

  return { isValid: true, canonicalOffer: offer };
}

/**
 * Returns canonical StratXcel profile and catalog.
 */
export function getStratXcelBusinessBrain() {
  return {
    profile: STRATXCEL_COMPANY_PROFILE,
    capabilities: STRATXCEL_CAPABILITIES,
    offers: STRATXCEL_CANONICAL_OFFERS,
  };
}
