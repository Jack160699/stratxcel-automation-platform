/**
 * Smart Website Discovery Engine with Explicit State Machine, Strict Timeouts,
 * Deep Multi-Page Public Signals, Google Business Discovery, Stage Detection,
 * Contextual Goal Recommendations, and Provenance Tagging.
 *
 * States:
 * IDLE -> VALIDATING -> FETCHING -> DISCOVERING -> EXTRACTING -> VERIFYING -> COMPLETE | PARTIAL | FAILED | TIMEOUT
 */

import { lookup } from "node:dns/promises";
import {
  normalizeWebsiteUrl,
  extractAllSocialLinksFromHtml,
  type DiscoveredSocialLink,
} from "../../identity/smart-url.ts";
import { assertSafePublicHttpUrl } from "./url.ts";

export type DiscoveryState =
  | "IDLE"
  | "VALIDATING"
  | "FETCHING"
  | "DISCOVERING"
  | "EXTRACTING"
  | "VERIFYING"
  | "COMPLETE"
  | "PARTIAL"
  | "FAILED"
  | "TIMEOUT";

export type BusinessStage =
  | "IDEA"
  | "PRE-LAUNCH"
  | "NEW/STARTING"
  | "EARLY BUSINESS"
  | "GROWING"
  | "ESTABLISHED"
  | "MATURE";

export type ProvenanceTag = "VERIFIED_PUBLIC" | "AI_INFERRED" | "CUSTOMER_PROVIDED" | "UNKNOWN";

export interface CandidateGoal {
  id: string;
  label: string;
  rationale: string;
  isRecommended: boolean;
}

export interface GoogleBusinessSignal {
  name?: string;
  category?: string;
  address?: string;
  phone?: string;
  rating?: number;
  reviewCount?: number;
  openingHours?: string[];
  url?: string;
  isEmbed?: boolean;
  verifiedViaOAuth?: boolean;
}

export interface DiscoveredBusinessData {
  websiteUrl: string;
  businessName?: string;
  legalName?: string;
  logoUrl?: string;
  tagline?: string;
  description?: string;
  industry?: string;
  businessModel?: string;
  location?: string;
  serviceAreas?: string[];
  phone?: string;
  email?: string;
  whatsapp?: string;
  services: string[];
  products: string[];
  primaryOffer?: string;
  pricingSignals?: string[];
  targetAudience?: string;
  differentiators?: string[];
  positioning?: string;
  toneOfVoice?: string;
  businessStage: BusinessStage;
  routedDeliverable: "BUSINESS_AUDIT" | "BUSINESS_PLAN";
  socialLinks: DiscoveredSocialLink[];
  googleBusiness?: GoogleBusinessSignal;
  ctas: string[];
  bookingLinks: string[];
  newsletter: boolean;
  testimonials: Array<{ quote?: string; author?: string; rating?: number }>;
  reviews?: { rating: number; count: number | null; source?: string };
  trustBadges: string[];
  certifications: string[];
  awards: string[];
  guarantees: string[];
  blogResources: string[];
  faqs: Array<{ question: string; answer: string }>;
  seoSignals: {
    title?: string;
    metaDescription?: string;
    headings: string[];
    canonicalUrl?: string;
    hasStructuredData: boolean;
    structuredDataTypes: string[];
    hasRobotsOrSitemap: boolean;
    publicKeywords: string[];
  };
  metaTags: Record<string, string>;
  title?: string;
  httpStatus?: number;
  isReachable: boolean;
  confidenceTags: Record<string, ProvenanceTag>;
  recommendedGoals: string[];
  candidateGoals: CandidateGoal[];
  recommendedPackage: string;
  knownFields: string[];
  uncertainFields: string[];
  missingFields: string[];
  transformation: {
    current: string[];
    target: string[];
    thirtyDayAction: string;
  };
}

export interface DiscoveryProgressEvent {
  operationId: string;
  state: DiscoveryState;
  message: string;
  timestamp: string;
  data?: Partial<DiscoveredBusinessData>;
  error?: string;
}

export interface SmartDiscoveryResult {
  operationId: string;
  finalState: DiscoveryState;
  isSuccess: boolean;
  isPartial: boolean;
  data: DiscoveredBusinessData;
  events: DiscoveryProgressEvent[];
  startedAt: string;
  completedAt: string;
  error?: string;
}

const FETCH_TIMEOUT_MS = 6_000;

const MULTI_PAGE_PATHS = [
  "/about",
  "/about-us",
  "/services",
  "/products",
  "/pricing",
  "/contact",
  "/contact-us",
  "/team",
  "/faq",
];

function cleanText(val: string | undefined | null): string | undefined {
  if (!val) return undefined;
  const cleaned = val.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 500) : undefined;
}

function parseJsonLd(html: string): Record<string, unknown>[] {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const out: Record<string, unknown>[] = [];
  for (const block of blocks) {
    try {
      const parsed: unknown = JSON.parse(block[1] ?? "{}");
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          out.push(entry as Record<string, unknown>);
        }
      }
    } catch {
      // Ignore invalid JSON-LD blocks
    }
  }
  return out;
}

function inferIndustryAndModel(textCorpus: string): { industry?: string; model?: string } {
  const lower = textCorpus.toLowerCase();
  let industry: string | undefined;
  let model: string | undefined;

  if (/saas|software|platform|cloud|api|developer|automation|tech\b/i.test(lower)) {
    industry = "SaaS & Technology";
    model = "B2B Subscription / Software";
  } else if (/clinic|dental|hospital|doctor|health|physio|care|medical|therapy/i.test(lower)) {
    industry = "Healthcare & Wellness";
    model = "Local Healthcare / Appointments";
  } else if (/restaurant|cafe|bakery|food|dining|bistro|bar|catering|kitchen/i.test(lower)) {
    industry = "Food & Hospitality";
    model = "Local Dining / Hospitality";
  } else if (/consult|advis|law|attorney|account|tax|ca\b|agency|marketing|digital|coaching/i.test(lower)) {
    industry = "Professional Services";
    model = "B2B Client Services & Consulting";
  } else if (/shop|store|cart|buy|apparel|clothing|jewel|retail|ecommerce|fashion/i.test(lower)) {
    industry = "Retail & E-Commerce";
    model = "D2C / E-Commerce / Retail";
  } else if (/school|academy|course|coaching|tutor|education|learning|institute/i.test(lower)) {
    industry = "Education & Training";
    model = "Education / Training";
  } else if (/realty|real estate|builder|property|apartment|housing|architect/i.test(lower)) {
    industry = "Real Estate & Construction";
    model = "High-Value Inquiries / Real Estate";
  } else if (/salon|spa|beauty|makeup|hair|skincare/i.test(lower)) {
    industry = "Beauty & Personal Care";
    model = "Local Appointments & Walk-ins";
  } else if (/travel|tour|resort|hotel|flight|vacation/i.test(lower)) {
    industry = "Travel & Tourism";
    model = "Bookings & Tourism";
  }

  return { industry, model };
}

function extractServicesFromHtml(html: string): string[] {
  const services = new Set<string>();
  const serviceRegex = /<(?:li|h2|h3|h4|span|p|a)[^>]*>(?:Our\s+)?([A-Z][a-zA-Z\s&]{3,40}(?:Services?|Solutions?|Management|Design|Consulting|Automation|Marketing|Development|Support|Integration|Care|Strategy|Audit|Advisory|System|Platform))<\/(?:li|h2|h3|h4|span|p|a)>/gi;
  let m: RegExpExecArray | null;
  while ((m = serviceRegex.exec(html)) !== null) {
    const raw = cleanText(m[1]);
    if (raw && raw.length > 3 && raw.length < 50 && !/^(about|contact|home|privacy|terms|menu|navigation|learn more)/i.test(raw)) {
      services.add(raw);
    }
  }
  return Array.from(services).slice(0, 8);
}

function extractCtasFromHtml(html: string): string[] {
  const ctas = new Set<string>();
  const ctaRegex = /<(?:button|a)[^>]*class=["'][^"']*(?:btn|cta|button)[^"']*["'][^>]*>([\s\S]*?)<\/(?:button|a)>/gi;
  let m: RegExpExecArray | null;
  while ((m = ctaRegex.exec(html)) !== null) {
    const textVal = cleanText(m[1]);
    if (textVal && textVal.length > 2 && textVal.length < 40 && !/^(home|login|sign in|menu|close)$/i.test(textVal)) {
      ctas.add(textVal);
    }
  }
  return Array.from(ctas).slice(0, 5);
}

function extractHeadingsFromHtml(html: string): string[] {
  const headings = new Set<string>();
  const hRegex = /<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi;
  let m: RegExpExecArray | null;
  while ((m = hRegex.exec(html)) !== null) {
    const textVal = cleanText(m[1]);
    if (textVal && textVal.length > 5 && textVal.length < 120) {
      headings.add(textVal);
    }
  }
  return Array.from(headings).slice(0, 6);
}

function extractPublicKeywords(html: string): string[] {
  const metaKeywords = /<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  if (metaKeywords) {
    return metaKeywords.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 8);
  }
  return [];
}

function extractTestimonials(html: string): Array<{ quote?: string; author?: string; rating?: number }> {
  const testimonials: Array<{ quote?: string; author?: string; rating?: number }> = [];
  const quoteRegex = /<(?:blockquote|p|div)[^>]*class=["'][^"']*(?:testimonial|quote|review)[^"']*["'][^>]*>([\s\S]*?)<\/(?:blockquote|p|div)>/gi;
  let m: RegExpExecArray | null;
  while ((m = quoteRegex.exec(html)) !== null) {
    const rawQuote = cleanText(m[1]);
    if (rawQuote && rawQuote.length > 15 && rawQuote.length < 300) {
      testimonials.push({ quote: rawQuote });
      if (testimonials.length >= 3) break;
    }
  }
  return testimonials;
}

function extractGoogleBusinessSignal(
  html: string,
  jsonLdNodes: Record<string, unknown>[],
  socialLinks: DiscoveredSocialLink[]
): GoogleBusinessSignal | undefined {
  const mapsLink = socialLinks.find((l) => l.platform === "google_business");
  let rating: number | undefined;
  let reviewCount: number | undefined;
  let address: string | undefined;
  let phone: string | undefined;
  let category: string | undefined;
  let placeName: string | undefined;

  for (const node of jsonLdNodes) {
    const type = String(node["@type"] ?? "");
    if (/LocalBusiness|Store|Restaurant|MedicalClinic|ProfessionalService/i.test(type)) {
      category = type;
      if (typeof node.name === "string") placeName = node.name;
      if (typeof node.telephone === "string") phone = node.telephone;
      if (node.address && typeof node.address === "object") {
        const addr = node.address as Record<string, unknown>;
        address = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode, addr.addressCountry]
          .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
          .join(", ");
      }
      if (node.aggregateRating && typeof node.aggregateRating === "object") {
        const agg = node.aggregateRating as Record<string, unknown>;
        const r = Number(agg.ratingValue);
        const c = Number(agg.reviewCount ?? agg.ratingCount);
        if (!isNaN(r)) rating = r;
        if (!isNaN(c)) reviewCount = c;
      }
    }
  }

  // Check embed iframe
  const embedMatch = /<iframe[^>]+src=["'](https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\/embed[^"']+)["']/i.exec(html);

  if (mapsLink || embedMatch || (address && (phone || rating))) {
    return {
      name: placeName || mapsLink?.displayName || mapsLink?.handle,
      category,
      address,
      phone,
      rating,
      reviewCount,
      url: mapsLink?.url || embedMatch?.[1],
      isEmbed: Boolean(embedMatch),
      verifiedViaOAuth: false,
    };
  }

  return undefined;
}

export function detectBusinessStage(data: {
  isReachable: boolean;
  businessName?: string;
  hasDescription: boolean;
  socialCount: number;
  pageCount: number;
  hasReviews: boolean;
  hasPricingOrProducts: boolean;
}): BusinessStage {
  if (!data.isReachable || (!data.businessName && !data.hasDescription)) {
    return "IDEA";
  }
  if (data.pageCount <= 1 && data.socialCount === 0 && !data.hasReviews) {
    return "PRE-LAUNCH";
  }
  if (data.socialCount <= 1 && !data.hasReviews) {
    return "NEW/STARTING";
  }
  if (data.socialCount >= 3 && data.hasReviews) {
    return "ESTABLISHED";
  }
  if (data.socialCount >= 2 && data.pageCount >= 2 && data.hasPricingOrProducts) {
    return "GROWING";
  }
  return "EARLY BUSINESS";
}

export function generateCandidateGoals(stage: BusinessStage, data: Partial<DiscoveredBusinessData>): CandidateGoal[] {
  const goals: CandidateGoal[] = [];
  const socials = data.socialLinks ?? [];
  const hasWhatsapp = socials.some((s) => s.platform === "whatsapp") || Boolean(data.whatsapp);
  const hasSocials = socials.some((s) => ["instagram", "facebook", "youtube", "linkedin"].includes(s.platform));
  const hasGoogle = Boolean(data.googleBusiness?.url || socials.some((s) => s.platform === "google_business"));
  const hasServices = (data.services?.length ?? 0) > 0;

  if (stage === "IDEA" || stage === "PRE-LAUNCH") {
    goals.push({
      id: "launch_website",
      label: "Launch high-converting business website",
      rationale: "No live public web presence detected",
      isRecommended: true,
    });
    goals.push({
      id: "brand_social_launch",
      label: "Establish brand identity & social profiles",
      rationale: "Build first-party social touchpoints",
      isRecommended: true,
    });
    goals.push({
      id: "whatsapp_reception",
      label: "Set up instant WhatsApp business reception",
      rationale: "Capture every initial inquiry 24/7",
      isRecommended: true,
    });
    goals.push({
      id: "validation_offers",
      label: "Validate primary product/service offer",
      rationale: "Test market willingness to pay",
      isRecommended: false,
    });
  } else {
    if (hasServices) {
      goals.push({
        id: "lead_generation",
        label: "Generate qualified inbound leads & appointments",
        rationale: "Website offers services requiring active lead capture",
        isRecommended: true,
      });
    } else {
      goals.push({
        id: "increase_sales",
        label: "Increase customer acquisition & repeat sales",
        rationale: "Accelerate revenue growth across active channels",
        isRecommended: true,
      });
    }

    if (!hasGoogle) {
      goals.push({
        id: "google_local_visibility",
        label: "Optimize Google Business & local AI search discovery",
        rationale: "No verified Google Maps listing found on website",
        isRecommended: true,
      });
    } else {
      goals.push({
        id: "search_ranking_growth",
        label: "Improve Google search rank & review volume",
        rationale: "Strengthen high-intent local discovery",
        isRecommended: false,
      });
    }

    if (hasSocials) {
      goals.push({
        id: "social_conversion",
        label: "Automate social publishing & convert audience to leads",
        rationale: "Active social channels can run on autopilot",
        isRecommended: true,
      });
    } else {
      goals.push({
        id: "social_channel_launch",
        label: "Launch Instagram, Facebook & LinkedIn presence",
        rationale: "Missing active social touchpoints",
        isRecommended: true,
      });
    }

    if (!hasWhatsapp) {
      goals.push({
        id: "whatsapp_automation",
        label: "Deploy automated WhatsApp lead qualification & follow-up",
        rationale: "No instant WhatsApp link detected on website",
        isRecommended: true,
      });
    } else {
      goals.push({
        id: "whatsapp_pipeline",
        label: "Connect WhatsApp chats directly to CRM pipeline",
        rationale: "Prevent lost enquiries across chat threads",
        isRecommended: false,
      });
    }

    goals.push({
      id: "centralized_crm",
      label: "Centralize CRM, lead tracking & customer records",
      rationale: "Eliminate manual spreadsheets and scattered notes",
      isRecommended: true,
    });
  }

  return goals;
}

function calculateFieldCompleteness(data: DiscoveredBusinessData): {
  knownFields: string[];
  uncertainFields: string[];
  missingFields: string[];
} {
  const knownFields: string[] = [];
  const uncertainFields: string[] = [];
  const missingFields: string[] = [];

  // Business Name
  if (data.businessName && data.confidenceTags.businessName === "VERIFIED_PUBLIC") {
    knownFields.push("businessName");
  } else if (data.businessName) {
    uncertainFields.push("businessName");
  } else {
    missingFields.push("businessName");
  }

  // Industry
  if (data.industry && data.confidenceTags.industry === "VERIFIED_PUBLIC") {
    knownFields.push("industry");
  } else if (data.industry) {
    uncertainFields.push("industry");
  } else {
    missingFields.push("industry");
  }

  // Location
  if (data.location) {
    knownFields.push("location");
  } else if (data.googleBusiness?.address) {
    uncertainFields.push("location");
  } else {
    missingFields.push("location");
  }

  // Services / Offerings
  if (data.services.length > 0) {
    knownFields.push("services");
  } else {
    missingFields.push("services");
  }

  // Target Customer / Audience
  if (data.targetAudience) {
    uncertainFields.push("targetAudience");
  } else {
    missingFields.push("targetAudience");
  }

  // Primary Goal
  if (data.recommendedGoals.length > 0) {
    uncertainFields.push("primaryGoal");
  } else {
    missingFields.push("primaryGoal");
  }

  return { knownFields, uncertainFields, missingFields };
}

function generateContextualPackageAndTransformation(stage: BusinessStage, data: Partial<DiscoveredBusinessData>): {
  recommendedPackage: string;
  transformation: { current: string[]; target: string[]; thirtyDayAction: string };
} {
  if (stage === "IDEA" || stage === "PRE-LAUNCH") {
    return {
      recommendedPackage: "Starter — Digital Foundation & Launch",
      transformation: {
        current: [
          "No public customer website",
          "No organized social presence",
          "Manual or missing WhatsApp contact",
          "No CRM for customer tracking",
        ],
        target: [
          "Live high-converting website & domain",
          "Connected social channels & brand voice",
          "Instant automated WhatsApp reception",
          "Centralized customer inbox & CRM",
        ],
        thirtyDayAction: "Launch brand foundation, website, WhatsApp automations, and initial acquisition pipeline.",
      },
    };
  }

  const socials = data.socialLinks ?? [];
  const hasSocials = socials.length > 0;

  return {
    recommendedPackage: "Growth — Active Lead Generation & Automation",
    transformation: {
      current: [
        "Inconsistent social publishing",
        hasSocials ? "Manual customer follow-up" : "Unconnected social channels",
        "Scattered leads across platforms",
        "Moderate organic search visibility",
      ],
      target: [
        "Automated daily brand content publishing",
        "Instant 24/7 WhatsApp response & qualification",
        "Single unified CRM inbox with smart pipeline",
        "Optimized AI & local search discovery",
      ],
      thirtyDayAction: "Deploy WhatsApp instant qualification, connect social autopilot, and streamline lead conversion.",
    },
  };
}

export async function runSmartWebsiteDiscovery(
  rawInput: string,
  options?: {
    timeoutMs?: number;
    fetcher?: typeof fetch;
    resolver?: typeof lookup;
  }
): Promise<SmartDiscoveryResult> {
  const operationId = `disc_op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = new Date().toISOString();
  const events: DiscoveryProgressEvent[] = [];
  const fetcher = options?.fetcher ?? fetch;

  function pushEvent(state: DiscoveryState, message: string, data?: Partial<DiscoveredBusinessData>, error?: string) {
    events.push({
      operationId,
      state,
      message,
      timestamp: new Date().toISOString(),
      data,
      error,
    });
  }

  const confidenceTags: Record<string, ProvenanceTag> = {
    businessName: "UNKNOWN",
    industry: "UNKNOWN",
    businessModel: "UNKNOWN",
    location: "UNKNOWN",
    websiteUrl: "UNKNOWN",
    phone: "UNKNOWN",
    email: "UNKNOWN",
    services: "UNKNOWN",
    businessStage: "UNKNOWN",
  };

  const resultData: DiscoveredBusinessData = {
    websiteUrl: rawInput,
    services: [],
    products: [],
    socialLinks: [],
    ctas: [],
    bookingLinks: [],
    newsletter: false,
    testimonials: [],
    trustBadges: [],
    certifications: [],
    awards: [],
    guarantees: [],
    blogResources: [],
    faqs: [],
    seoSignals: {
      headings: [],
      hasStructuredData: false,
      structuredDataTypes: [],
      hasRobotsOrSitemap: false,
      publicKeywords: [],
    },
    metaTags: {},
    isReachable: false,
    businessStage: "IDEA",
    routedDeliverable: "BUSINESS_PLAN",
    confidenceTags,
    recommendedGoals: [],
    candidateGoals: [],
    recommendedPackage: "Starter",
    knownFields: [],
    uncertainFields: [],
    missingFields: [],
    transformation: {
      current: [],
      target: [],
      thirtyDayAction: "",
    },
  };

  // State 1: VALIDATING
  pushEvent("VALIDATING", "Validating domain and security checks...");
  const norm = normalizeWebsiteUrl(rawInput);
  if (!norm.ok || !norm.url) {
    const errorMsg = norm.error ?? "Invalid website URL format";
    pushEvent("FAILED", errorMsg, undefined, errorMsg);
    return {
      operationId,
      finalState: "FAILED",
      isSuccess: false,
      isPartial: false,
      data: resultData,
      events,
      startedAt,
      completedAt: new Date().toISOString(),
      error: errorMsg,
    };
  }

  resultData.websiteUrl = norm.url;
  confidenceTags.websiteUrl = "VERIFIED_PUBLIC";

  // DNS / SSRF Safety check
  try {
    await assertSafePublicHttpUrl(norm.url, options?.resolver);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Target host is unreachable or not a public IP address";
    pushEvent("FAILED", errorMsg, undefined, errorMsg);
    return {
      operationId,
      finalState: "FAILED",
      isSuccess: false,
      isPartial: false,
      data: resultData,
      events,
      startedAt,
      completedAt: new Date().toISOString(),
      error: errorMsg,
    };
  }

  // State 2: FETCHING
  pushEvent("FETCHING", `Connecting to ${norm.host}...`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html = "";
  let httpStatus = 0;
  let fetchedPagesCount = 0;
  const discoveredCorpus: string[] = [];

  try {
    const response = await fetcher(norm.url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "StratxcelBusinessDiscovery/1.0 (+https://www.stratxcel.in)",
      },
    });
    clearTimeout(timer);
    httpStatus = response.status;
    resultData.httpStatus = httpStatus;
    resultData.isReachable = response.ok;

    if (!response.ok) {
      pushEvent("PARTIAL", `Server responded with status ${response.status}`, { httpStatus });
    } else {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
        html = (await response.text()).slice(0, 1_000_000);
        fetchedPagesCount++;
        discoveredCorpus.push(html);
      }
    }
  } catch (fetchErr) {
    clearTimeout(timer);
    const isTimeout = fetchErr instanceof Error && (fetchErr.name === "AbortError" || fetchErr.message.includes("aborted"));
    const finalState: DiscoveryState = isTimeout ? "TIMEOUT" : "FAILED";
    const errorMsg = isTimeout
      ? "Website connection timed out after 6 seconds."
      : fetchErr instanceof Error ? fetchErr.message : "Could not reach website.";

    pushEvent(finalState, errorMsg, undefined, errorMsg);
    resultData.businessStage = "IDEA";
    resultData.routedDeliverable = "BUSINESS_PLAN";
    const candidateGoals = generateCandidateGoals("IDEA", resultData);
    resultData.candidateGoals = candidateGoals;
    resultData.recommendedGoals = candidateGoals.filter((g) => g.isRecommended).map((g) => g.label);
    const pack = generateContextualPackageAndTransformation("IDEA", resultData);
    resultData.recommendedPackage = pack.recommendedPackage;
    resultData.transformation = pack.transformation;

    const comp = calculateFieldCompleteness(resultData);
    resultData.knownFields = comp.knownFields;
    resultData.uncertainFields = comp.uncertainFields;
    resultData.missingFields = comp.missingFields;

    return {
      operationId,
      finalState,
      isSuccess: false,
      isPartial: false,
      data: resultData,
      events,
      startedAt,
      completedAt: new Date().toISOString(),
      error: errorMsg,
    };
  }

  if (!html) {
    pushEvent("PARTIAL", "Website was reachable but returned no readable HTML content.");
    resultData.businessStage = "IDEA";
    resultData.routedDeliverable = "BUSINESS_PLAN";
    const candidateGoals = generateCandidateGoals("IDEA", resultData);
    resultData.candidateGoals = candidateGoals;
    resultData.recommendedGoals = candidateGoals.filter((g) => g.isRecommended).map((g) => g.label);
    const pack = generateContextualPackageAndTransformation("IDEA", resultData);
    resultData.recommendedPackage = pack.recommendedPackage;
    resultData.transformation = pack.transformation;

    const comp = calculateFieldCompleteness(resultData);
    resultData.knownFields = comp.knownFields;
    resultData.uncertainFields = comp.uncertainFields;
    resultData.missingFields = comp.missingFields;

    return {
      operationId,
      finalState: "PARTIAL",
      isSuccess: false,
      isPartial: true,
      data: resultData,
      events,
      startedAt,
      completedAt: new Date().toISOString(),
      error: "No HTML content found",
    };
  }

  // State 3: DISCOVERING
  pushEvent("DISCOVERING", "Reading public pages and marketing signals...");

  // Extract <title>
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const rawTitle = cleanText(titleMatch?.[1]);
  if (rawTitle) {
    resultData.title = rawTitle;
    resultData.seoSignals.title = rawTitle;
    resultData.businessName = rawTitle.split(/[|\-–:]/)[0]?.trim();
    confidenceTags.businessName = "AI_INFERRED";
  }

  // Extract meta tags
  const ogSiteName = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  if (ogSiteName) {
    resultData.businessName = cleanText(ogSiteName) || resultData.businessName;
    confidenceTags.businessName = "VERIFIED_PUBLIC";
  }

  const metaDesc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i.exec(html)?.[1]
    || /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  if (metaDesc) {
    resultData.description = cleanText(metaDesc);
    resultData.seoSignals.metaDescription = cleanText(metaDesc);
    resultData.positioning = cleanText(metaDesc);
  }

  // Extract logo
  const ogImage = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  if (ogImage) {
    resultData.logoUrl = ogImage;
  }

  // Extract canonical URL
  const canonicalMatch = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i.exec(html)?.[1];
  if (canonicalMatch) {
    resultData.seoSignals.canonicalUrl = canonicalMatch;
  }

  // Extract JSON-LD structured data
  pushEvent("EXTRACTING", "Finding social profiles & checking Google presence...");
  const jsonLd = parseJsonLd(html);
  resultData.seoSignals.hasStructuredData = jsonLd.length > 0;
  resultData.seoSignals.structuredDataTypes = jsonLd.map((n) => String(n["@type"] ?? "")).filter(Boolean);

  for (const node of jsonLd) {
    const type = String(node["@type"] ?? "");
    if (/Organization|LocalBusiness|Store|Corporation|ProfessionalService|MedicalClinic/i.test(type)) {
      if (typeof node.name === "string" && node.name.trim()) {
        resultData.businessName = node.name.trim();
        confidenceTags.businessName = "VERIFIED_PUBLIC";
      }
      if (typeof node.legalName === "string" && node.legalName.trim()) {
        resultData.legalName = node.legalName.trim();
      }
      if (typeof node.description === "string" && node.description.trim()) {
        resultData.description = node.description.trim();
      }
      if (typeof node.telephone === "string") {
        resultData.phone = node.telephone.trim();
        confidenceTags.phone = "VERIFIED_PUBLIC";
      }
      if (typeof node.email === "string") {
        resultData.email = node.email.trim();
        confidenceTags.email = "VERIFIED_PUBLIC";
      }
      if (node.address && typeof node.address === "object") {
        const addr = node.address as Record<string, unknown>;
        const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.addressCountry]
          .filter((p): p is string => typeof p === "string" && p.trim().length > 0);
        if (parts.length) {
          resultData.location = parts.join(", ");
          confidenceTags.location = "VERIFIED_PUBLIC";
        }
      }
      if (node.aggregateRating && typeof node.aggregateRating === "object") {
        const agg = node.aggregateRating as Record<string, unknown>;
        const r = Number(agg.ratingValue);
        const c = Number(agg.reviewCount ?? agg.ratingCount);
        if (!isNaN(r)) {
          resultData.reviews = { rating: r, count: isNaN(c) ? null : c, source: "Schema AggregateRating" };
        }
      }
    }
  }

  // Multi-page subpage exploration
  const rootUrl = new URL(norm.url);
  for (const path of MULTI_PAGE_PATHS.slice(0, 4)) {
    try {
      const subUrl = new URL(path, rootUrl).href;
      const subRes = await fetcher(subUrl, {
        headers: { Accept: "text/html", "User-Agent": "StratxcelBusinessDiscovery/1.0 (+https://www.stratxcel.in)" },
      });
      if (subRes.ok) {
        const subHtml = (await subRes.text()).slice(0, 250_000);
        fetchedPagesCount++;
        discoveredCorpus.push(subHtml);
      }
    } catch {
      // Non-fatal subpage fetch
    }
  }

  const fullCorpus = discoveredCorpus.join(" ");

  // Extract all social links
  const socialLinks = extractAllSocialLinksFromHtml(fullCorpus);
  resultData.socialLinks = socialLinks;

  // Extract Google Business / Map signals
  const googleSig = extractGoogleBusinessSignal(fullCorpus, jsonLd, socialLinks);
  if (googleSig) {
    resultData.googleBusiness = googleSig;
  }

  // Infer industry and business model
  const { industry, model } = inferIndustryAndModel(fullCorpus);
  if (industry) {
    resultData.industry = industry;
    confidenceTags.industry = "AI_INFERRED";
  }
  if (model) {
    resultData.businessModel = model;
    confidenceTags.businessModel = "AI_INFERRED";
  }

  // Extract services, CTAs, Headings, Keywords
  resultData.services = extractServicesFromHtml(fullCorpus);
  if (resultData.services.length > 0) {
    confidenceTags.services = "AI_INFERRED";
    resultData.primaryOffer = resultData.services[0];
  }
  resultData.ctas = extractCtasFromHtml(fullCorpus);
  resultData.seoSignals.headings = extractHeadingsFromHtml(fullCorpus);
  resultData.seoSignals.publicKeywords = extractPublicKeywords(html);
  resultData.testimonials = extractTestimonials(fullCorpus);

  // State 4: VERIFYING
  pushEvent("VERIFYING", "Collecting public reviews & mapping market signals...");

  // Derive Business Stage
  const stage = detectBusinessStage({
    isReachable: resultData.isReachable,
    businessName: resultData.businessName,
    hasDescription: Boolean(resultData.description),
    socialCount: socialLinks.length,
    pageCount: fetchedPagesCount,
    hasReviews: Boolean(resultData.reviews || resultData.testimonials.length > 0),
    hasPricingOrProducts: resultData.services.length > 0 || /pricing|₹|\$/i.test(fullCorpus),
  });
  resultData.businessStage = stage;
  confidenceTags.businessStage = "AI_INFERRED";

  // Route deliverable based on stage
  resultData.routedDeliverable = (stage === "IDEA" || stage === "PRE-LAUNCH") ? "BUSINESS_PLAN" : "BUSINESS_AUDIT";

  // Generate candidate and recommended goals
  const candidateGoals = generateCandidateGoals(stage, resultData);
  resultData.candidateGoals = candidateGoals;
  resultData.recommendedGoals = candidateGoals.filter((g) => g.isRecommended).map((g) => g.label);

  const pack = generateContextualPackageAndTransformation(stage, resultData);
  resultData.recommendedPackage = pack.recommendedPackage;
  resultData.transformation = pack.transformation;

  // Compute completeness
  const completeness = calculateFieldCompleteness(resultData);
  resultData.knownFields = completeness.knownFields;
  resultData.uncertainFields = completeness.uncertainFields;
  resultData.missingFields = completeness.missingFields;

  const hasSubstantialData = Boolean(resultData.businessName || resultData.description || socialLinks.length > 0);
  const finalState: DiscoveryState = hasSubstantialData ? "COMPLETE" : "PARTIAL";

  pushEvent(finalState, finalState === "COMPLETE" ? "Website discovery completed successfully." : "Partial business information discovered.", resultData);

  return {
    operationId,
    finalState,
    isSuccess: finalState === "COMPLETE",
    isPartial: finalState === "PARTIAL",
    data: resultData,
    events,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}


