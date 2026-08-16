/**
 * Canonical Onboarding Business Intelligence Engine
 *
 * Synthesizes Website corpus, Google Maps / GBP signals, Industry classification,
 * and Confirmed Social accounts into a single, cohesive Business Intelligence profile.
 *
 * Core Principle:
 * ASK LESS -> DISCOVER MORE -> PRE-FILL EVERYTHING -> LET CUSTOMER VERIFY
 */

import { SERVICE_CATALOGUE } from "@stratxcel/missions";
import type { DiscoveredBusinessData } from "../audit/v1/smart-discovery";
import type { NormalizedGoogleMapsInput } from "../identity/google-maps-normalizer";
import type { DiscoveredSocialDraft } from "@/app/app/onboarding/types";

export interface SynthesizedBusinessIntelligence {
  business: {
    name: string;
    slug: string;
    industry: string;
    businessModel: string;
    website: string;
    googleMapsUrl?: string;
    location: string;
    stage: string;
    whatsapp: string;
    services: string[];
    primaryOffer: string;
    socials: DiscoveredSocialDraft[];
  };
  brand: {
    businessName: string;
    description: string;
    audience: string;
    tone: string;
    offers: string;
    restrictions: string;
  };
  goals: {
    recommendedKeys: string[];
    candidates: Array<{
      key: string;
      label: string;
      description: string;
      reason: string;
      isRecommended: boolean;
    }>;
  };
  provenance: Record<string, "WEBSITE" | "GOOGLE_MAPS" | "INDUSTRY_INFERENCE" | "CONFIRMED_SOCIAL" | "USER_PROVIDED">;
  confidenceScore: number;
}

export interface SynthesisInputSources {
  websiteData?: Partial<DiscoveredBusinessData> | null;
  googleMapsData?: NormalizedGoogleMapsInput | null;
  selectedIndustry?: string | null;
  confirmedSocials?: DiscoveredSocialDraft[] | null;
  existingDraft?: {
    businessName?: string;
    location?: string;
    whatsapp?: string;
  } | null;
}

/**
 * Industry-Aware Heuristics Knowledge Base
 */
interface IndustryProfilePreset {
  standardModel: string;
  defaultTone: string;
  targetAudienceTemplate: (bizName: string, loc?: string) => string;
  descriptionTemplate: (bizName: string, services: string[], loc?: string) => string;
  offersTemplate: string[];
  safeRestrictions: string[];
  recommendedGoalKeys: string[];
  goalReasons: Record<string, string>;
}

const INDUSTRY_PRESETS: Record<string, IndustryProfilePreset> = {
  "SaaS & Technology": {
    standardModel: "B2B Subscription / Software",
    defaultTone: "Authoritative, modern, analytical, and practical",
    targetAudienceTemplate: (name) =>
      `Modern businesses, founders, operations leads, and engineering teams seeking automated software solutions to scale efficiency with ${name}.`,
    descriptionTemplate: (name, srv) =>
      `${name} delivers modern software and automated intelligence systems${
        srv.length ? ` focusing on ${srv.slice(0, 3).join(", ")}` : ""
      }, empowering teams to eliminate manual bottlenecks and accelerate digital growth.`,
    offersTemplate: [
      "AI & Process Automation",
      "Cloud Platform Integration",
      "Custom Workflow Development",
      "API & Data Infrastructure",
      "Ongoing Technical Support",
    ],
    safeRestrictions: [
      "Do not guarantee specific revenue multiples without verified system telemetry",
      "No claims of 100% automated decision-making without human oversight",
      "Avoid unverified performance comparisons with named competitors",
    ],
    recommendedGoalKeys: ["thirty_day_growth_plan", "seo_audit", "website_landing_page", "content_calendar"],
    goalReasons: {
      thirty_day_growth_plan: "Establish a 30-day prioritized digital acquisition and operational sprint.",
      seo_audit: "Capture organic search intent for targeted B2B software and automation queries.",
      website_landing_page: "Optimize high-converting product pages and lead conversion funnels.",
      content_calendar: "Build thought leadership and consistent product messaging across connected channels.",
    },
  },
  "Food & Hospitality": {
    standardModel: "Local Dining / Hospitality / In-Store",
    defaultTone: "Warm, inviting, artisanal, and community-focused",
    targetAudienceTemplate: (name, loc) =>
      `Local food lovers, families, neighbors, and event organizers in ${
        loc || "the local community"
      } looking for memorable culinary experiences and fresh offerings at ${name}.`,
    descriptionTemplate: (name, srv, loc) =>
      `${name} is a premier dining and culinary establishment${
        loc ? ` in ${loc}` : ""
      } known for exceptional taste, quality ingredients, and welcoming hospitality${
        srv.length ? ` specializing in ${srv.slice(0, 3).join(", ")}` : ""
      }.`,
    offersTemplate: [
      "Dine-in & Tasting Experience",
      "Fresh Daily Specials & Catering",
      "Takeaway & Online Ordering",
      "Private Events & Celebrations",
    ],
    safeRestrictions: [
      "Do not make unsubstantiated health or medical benefit claims regarding dietary recipes",
      "Ensure all seasonal menu pricing and availability are labeled as subject to change",
      "Maintain clear allergen notices across customer-facing communications",
    ],
    recommendedGoalKeys: ["thirty_day_growth_plan", "brand_audit", "social_campaign", "content_calendar"],
    goalReasons: {
      thirty_day_growth_plan: "Drive immediate local discovery, repeat footfall, and WhatsApp order flow.",
      brand_audit: "Align visual menu presentation and Google review presence across local search.",
      social_campaign: "Showcase daily culinary creations and seasonal specials to attract nearby diners.",
      content_calendar: "Maintain active social reels and weekend promotional scheduling.",
    },
  },
  "Healthcare & Wellness": {
    standardModel: "Local Healthcare / Patient Consultations",
    defaultTone: "Professional, caring, trustworthy, and empathetic",
    targetAudienceTemplate: (name, loc) =>
      `Patients, individuals, and families seeking attentive, high-quality medical and wellness care${
        loc ? ` in and around ${loc}` : ""
      } with trusted professionals at ${name}.`,
    descriptionTemplate: (name, srv, loc) =>
      `${name} provides compassionate, evidence-based healthcare and wellness services${
        loc ? ` in ${loc}` : ""
      }${
        srv.length ? ` focusing on ${srv.slice(0, 3).join(", ")}` : ""
      }, dedicated to patient wellbeing and long-term health outcomes.`,
    offersTemplate: [
      "Comprehensive Health Consultation",
      "Specialized Diagnostic & Preventive Care",
      "Personalized Wellness Plans",
      "Follow-up & Telehealth Support",
    ],
    safeRestrictions: [
      "Never promise guaranteed cures or unconditional medical treatment results",
      "Comply with local medical advertising ethics and statutory patient privacy standards",
      "Avoid sensationalized testimonials or before/after claims without explicit clinical disclaimers",
    ],
    recommendedGoalKeys: ["thirty_day_growth_plan", "seo_audit", "brand_audit", "report"],
    goalReasons: {
      thirty_day_growth_plan: "Structure a responsible patient acquisition and appointment growth plan.",
      seo_audit: "Rank for high-intent local clinic and specialist searches in your service area.",
      brand_audit: "Strengthen patient trust, doctor credentials, and verified Google reviews.",
      report: "Track monthly patient inquiry growth and local search ranking movements.",
    },
  },
  "Professional Services": {
    standardModel: "B2B Client Services & Consulting",
    defaultTone: "Consultative, credible, strategic, and results-driven",
    targetAudienceTemplate: (name) =>
      `Corporate executives, business owners, and organizations seeking dependable strategic guidance and professional expertise from ${name}.`,
    descriptionTemplate: (name, srv) =>
      `${name} provides specialized advisory and professional solutions${
        srv.length ? ` in ${srv.slice(0, 3).join(", ")}` : ""
      }, assisting clients in navigating complex challenges and unlocking measurable business value.`,
    offersTemplate: [
      "Strategic Consultation & Advisory",
      "End-to-End Project Execution",
      "Compliance & Operational Audits",
      "Retainer & Managed Services",
    ],
    safeRestrictions: [
      "Do not guarantee specific financial, legal, or regulatory outcomes without a signed engagement agreement",
      "Protect confidential client names unless written consent is obtained",
      "Avoid absolute claims of market exclusivity",
    ],
    recommendedGoalKeys: ["thirty_day_growth_plan", "brand_audit", "proposal", "seo_audit"],
    goalReasons: {
      thirty_day_growth_plan: "Build a reliable inbound pipeline of high-ticket consultation leads.",
      brand_audit: "Refine case studies, client positioning, and professional authority signals.",
      proposal: "Standardize client-facing proposals and audit deliverables for fast closing.",
      seo_audit: "Capture organic search queries for specialized consulting and advisory services.",
    },
  },
  "Retail & E-Commerce": {
    standardModel: "D2C / E-Commerce / Multi-Channel Retail",
    defaultTone: "Dynamic, customer-centric, engaging, and clear",
    targetAudienceTemplate: (name) =>
      `Discerning consumers and repeat buyers looking for quality products, curated collections, and dependable delivery from ${name}.`,
    descriptionTemplate: (name, srv) =>
      `${name} offers a curated catalog of premium products${
        srv.length ? ` featuring ${srv.slice(0, 3).join(", ")}` : ""
      }, delivering seamless shopping experiences and responsive customer care.`,
    offersTemplate: [
      "Curated Product Collections",
      "Direct-to-Consumer Online Delivery",
      "Exclusive Seasonal Bundles & Offers",
      "Dedicated Customer Support & Easy Returns",
    ],
    safeRestrictions: [
      "Ensure all return policies, shipping times, and warranties are clearly stated without hidden conditions",
      "Do not display misleading original price discounts or artificial urgency timers",
      "Verify all product claims and material specifications",
    ],
    recommendedGoalKeys: ["thirty_day_growth_plan", "social_campaign", "website_landing_page", "content_calendar"],
    goalReasons: {
      thirty_day_growth_plan: "Scale return on ad spend and maximize customer lifetime value.",
      social_campaign: "Launch seasonal visual campaigns and product showcases across Instagram and Facebook.",
      website_landing_page: "Optimize category pages, checkout flow, and promotional landing pages.",
      content_calendar: "Schedule new arrivals, flash offers, and user-generated product reviews.",
    },
  },
  "Beauty & Personal Care": {
    standardModel: "Local Appointments & Walk-ins",
    defaultTone: "Inspiring, stylish, welcoming, and detail-oriented",
    targetAudienceTemplate: (name, loc) =>
      `Clients seeking expert styling, self-care, and personalized beauty treatments${
        loc ? ` in ${loc}` : ""
      } at ${name}.`,
    descriptionTemplate: (name, srv, loc) =>
      `${name} is a premier salon and beauty destination${
        loc ? ` in ${loc}` : ""
      }${
        srv.length ? ` specializing in ${srv.slice(0, 3).join(", ")}` : ""
      }, delivering tailored styling and rejuvenating self-care experiences.`,
    offersTemplate: [
      "Personalized Styling & Treatments",
      "Bridal & Special Occasion Packages",
      "Premium Skin & Hair Care",
      "Appointment & Walk-in Services",
    ],
    safeRestrictions: [
      "Do not guarantee permanent skin or hair transformation results",
      "Ensure all cosmetic products and dermatological claims are clearly described",
      "Maintain clear cancellation and appointment deposit guidelines",
    ],
    recommendedGoalKeys: ["thirty_day_growth_plan", "social_campaign", "content_calendar", "brand_audit"],
    goalReasons: {
      thirty_day_growth_plan: "Fill empty appointment slots and drive high-margin package bookings.",
      social_campaign: "Showcase before-and-after transformations and client style spotlights.",
      content_calendar: "Maintain steady Instagram Reels, festive booking reminders, and stylist highlights.",
      brand_audit: "Upgrade local Google Maps presence and verified 5-star customer reviews.",
    },
  },
  "Real Estate & Construction": {
    standardModel: "High-Value Inquiries & Consultations",
    defaultTone: "Solid, trustworthy, visionary, and professional",
    targetAudienceTemplate: (name, loc) =>
      `Property buyers, investors, families, and commercial clients looking for trusted real estate and development expertise${
        loc ? ` in ${loc}` : ""
      } with ${name}.`,
    descriptionTemplate: (name, srv, loc) =>
      `${name} specializes in high-quality property development and real estate services${
        loc ? ` across ${loc}` : ""
      }${
        srv.length ? ` focusing on ${srv.slice(0, 3).join(", ")}` : ""
      }, combining architectural integrity with dependable project delivery.`,
    offersTemplate: [
      "Residential & Commercial Property Advisory",
      "Turnkey Construction & Development",
      "Site Visits & Investment Consultations",
      "Project Planning & Approvals Support",
    ],
    safeRestrictions: [
      "Never promise guaranteed property appreciation or ROI percentages without explicit market disclaimers",
      "Ensure all statutory approvals and project RERA registrations are accurately stated",
      "Do not use misleading architectural renderings as finished project photographs",
    ],
    recommendedGoalKeys: ["thirty_day_growth_plan", "seo_audit", "proposal", "brand_audit"],
    goalReasons: {
      thirty_day_growth_plan: "Capture high-intent property inquiries and streamline lead qualification.",
      seo_audit: "Rank for localized property and developer search terms.",
      proposal: "Generate professional project brochures and investor presentation decks.",
      brand_audit: "Solidify reputation, past delivery milestones, and client testimonials.",
    },
  },
};

const DEFAULT_PRESET: IndustryProfilePreset = {
  standardModel: "Local Business & Professional Services",
  defaultTone: "Professional, trustworthy, approachable, and customer-focused",
  targetAudienceTemplate: (name, loc) =>
    `Customers, clients, and partners seeking reliable, high-quality products and services${
      loc ? ` in ${loc}` : ""
    } from ${name}.`,
  descriptionTemplate: (name, srv, loc) =>
    `${name} provides trusted, high-quality solutions${
      loc ? ` in ${loc}` : ""
    }${
      srv.length ? ` including ${srv.slice(0, 3).join(", ")}` : ""
    }, dedicated to client satisfaction and consistent value.`,
  offersTemplate: [
    "Core Service Consultation",
    "Tailored Solution Delivery",
    "Customer Support & Maintenance",
    "Flexible Engagement Packages",
  ],
  safeRestrictions: [
    "Do not make unverified claims or promise absolute guarantees without written scope",
    "Comply with standard advertising truthfulness and customer privacy policies",
    "Avoid misleading competitive comparisons",
  ],
  recommendedGoalKeys: ["thirty_day_growth_plan", "brand_audit", "seo_audit", "content_calendar"],
  goalReasons: {
    thirty_day_growth_plan: "Establish a clear 30-day roadmap for online growth and inquiry generation.",
    brand_audit: "Review digital presence, customer reviews, and brand messaging across all channels.",
    seo_audit: "Improve search visibility so local customers find you first on Google.",
    content_calendar: "Maintain an organized, regular schedule of customer updates and offers.",
  },
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Main synthesis function: Combines all available discovery streams
 */
export function synthesizeOnboardingBusinessIntelligence(
  sources: SynthesisInputSources
): SynthesizedBusinessIntelligence {
  const provenance: SynthesizedBusinessIntelligence["provenance"] = {};
  let confidenceAccumulator = 0;
  let factorCount = 0;

  // 1. Resolve Business Name
  let businessName = "";
  if (sources.existingDraft?.businessName?.trim()) {
    businessName = sources.existingDraft.businessName.trim();
    provenance.businessName = "USER_PROVIDED";
    confidenceAccumulator += 1.0;
    factorCount++;
  } else if (sources.websiteData?.businessName?.trim()) {
    businessName = sources.websiteData.businessName.trim();
    provenance.businessName = "WEBSITE";
    confidenceAccumulator += 0.95;
    factorCount++;
  } else if (sources.googleMapsData?.placeName?.trim()) {
    businessName = sources.googleMapsData.placeName.trim();
    provenance.businessName = "GOOGLE_MAPS";
    confidenceAccumulator += 0.9;
    factorCount++;
  } else if (sources.confirmedSocials && sources.confirmedSocials.length > 0) {
    const handle = sources.confirmedSocials[0].handle.replace(/^@/, "").trim();
    businessName = handle;
    provenance.businessName = "CONFIRMED_SOCIAL";
    confidenceAccumulator += 0.75;
    factorCount++;
  } else {
    businessName = "My Business";
    provenance.businessName = "USER_PROVIDED";
    confidenceAccumulator += 0.3;
    factorCount++;
  }

  // 2. Resolve Industry & Model
  let industry = sources.selectedIndustry?.trim() || "";
  if (industry) {
    provenance.industry = "USER_PROVIDED";
    confidenceAccumulator += 1.0;
    factorCount++;
  } else if (sources.websiteData?.industry) {
    industry = sources.websiteData.industry;
    provenance.industry = "WEBSITE";
    confidenceAccumulator += 0.85;
    factorCount++;
  } else {
    industry = "General Business & Services";
    provenance.industry = "INDUSTRY_INFERENCE";
    confidenceAccumulator += 0.5;
    factorCount++;
  }

  // Match preset based on industry string
  let preset = DEFAULT_PRESET;
  for (const [key, p] of Object.entries(INDUSTRY_PRESETS)) {
    if (industry.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(industry.toLowerCase())) {
      preset = p;
      break;
    }
  }

  const businessModel = sources.websiteData?.businessModel || preset.standardModel;
  provenance.businessModel = sources.websiteData?.businessModel ? "WEBSITE" : "INDUSTRY_INFERENCE";

  // 3. Resolve Location
  let location = sources.existingDraft?.location?.trim() || "";
  if (location) {
    provenance.location = "USER_PROVIDED";
  } else if (sources.googleMapsData?.displayHandle && sources.googleMapsData.displayHandle !== "Google Maps Place") {
    // If GBP has place info
    location = sources.googleMapsData.displayHandle;
    provenance.location = "GOOGLE_MAPS";
  } else if (sources.websiteData?.location) {
    location = sources.websiteData.location;
    provenance.location = "WEBSITE";
  }

  // 4. Resolve WhatsApp / Phone
  let whatsapp = sources.existingDraft?.whatsapp?.trim() || "";
  if (whatsapp) {
    provenance.whatsapp = "USER_PROVIDED";
  } else if (sources.websiteData?.whatsapp || sources.websiteData?.phone) {
    whatsapp = sources.websiteData.whatsapp || sources.websiteData.phone || "";
    provenance.whatsapp = "WEBSITE";
  }

  // 5. Resolve Services & Primary Offer
  let services = (sources.websiteData?.services && sources.websiteData.services.length > 0)
    ? sources.websiteData.services
    : preset.offersTemplate;
  const primaryOffer = sources.websiteData?.primaryOffer || services[0] || "Consultation & Growth Support";
  provenance.offers = sources.websiteData?.services?.length ? "WEBSITE" : "INDUSTRY_INFERENCE";

  // 6. Generate Short Description
  let description = "";
  if (sources.websiteData?.description && sources.websiteData.description.length > 20) {
    description = sources.websiteData.description;
    provenance.description = "WEBSITE";
  } else {
    description = preset.descriptionTemplate(businessName, services, location);
    provenance.description = "INDUSTRY_INFERENCE";
  }

  // 7. Generate Target Audience
  let audience = "";
  if (sources.websiteData?.targetAudience) {
    audience = sources.websiteData.targetAudience;
    provenance.audience = "WEBSITE";
  } else {
    audience = preset.targetAudienceTemplate(businessName, location);
    provenance.audience = "INDUSTRY_INFERENCE";
  }

  // 8. Generate Brand Tone
  let tone = "";
  if (sources.websiteData?.toneOfVoice) {
    tone = sources.websiteData.toneOfVoice;
    provenance.tone = "WEBSITE";
  } else {
    tone = preset.defaultTone;
    provenance.tone = "INDUSTRY_INFERENCE";
  }

  // 9. Format Offers Text (Newline Separated)
  const offersText = services.slice(0, 6).join("\n");

  // 10. Format Restrictions Text (Newline Separated)
  const restrictionsText = (sources.websiteData?.guarantees && sources.websiteData.guarantees.length > 0)
    ? sources.websiteData.guarantees.concat(preset.safeRestrictions).slice(0, 4).join("\n")
    : preset.safeRestrictions.join("\n");
  provenance.restrictions = "INDUSTRY_INFERENCE";

  // 11. Formulate Recommended Goals from SERVICE_CATALOGUE
  const recommendedGoalKeys = preset.recommendedGoalKeys;
  const candidateGoals = SERVICE_CATALOGUE
    .filter((entry) => entry.key !== "custom_mission" && entry.key !== "owner_operating_brain_context")
    .map((entry) => {
      const isRecommended = recommendedGoalKeys.includes(entry.key);
      const reason = preset.goalReasons[entry.key] || entry.description;
      return {
        key: entry.key,
        label: entry.label,
        description: entry.description,
        reason,
        isRecommended,
      };
    })
    .sort((a, b) => (b.isRecommended ? 1 : 0) - (a.isRecommended ? 1 : 0));

  // 12. Strict Zero-Social Fabrication Rule:
  // If no confirmed socials were discovered or provided, socials stay empty.
  const socials: DiscoveredSocialDraft[] = (sources.confirmedSocials && sources.confirmedSocials.length > 0)
    ? sources.confirmedSocials
    : [];

  const confidenceScore = factorCount > 0 ? Number((confidenceAccumulator / factorCount).toFixed(2)) : 0.8;

  return {
    business: {
      name: businessName,
      slug: slugify(businessName),
      industry,
      businessModel,
      website: sources.websiteData?.websiteUrl || "",
      googleMapsUrl: sources.googleMapsData?.canonicalUrl || "",
      location,
      stage: sources.websiteData?.businessStage || "GROWING",
      whatsapp,
      services,
      primaryOffer,
      socials,
    },
    brand: {
      businessName,
      description,
      audience,
      tone,
      offers: offersText,
      restrictions: restrictionsText,
    },
    goals: {
      recommendedKeys: recommendedGoalKeys,
      candidates: candidateGoals,
    },
    provenance,
    confidenceScore,
  };
}
