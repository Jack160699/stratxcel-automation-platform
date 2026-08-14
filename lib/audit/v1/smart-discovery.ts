/**
 * Smart Website Discovery Engine with Explicit State Machine, Strict Timeouts,
 * Multi-Page Public Signals, Business Stage Detection, and Contextual Recommendations.
 *
 * States:
 * IDLE -> VALIDATING -> FETCHING -> DISCOVERING -> EXTRACTING -> VERIFYING -> COMPLETE | PARTIAL | FAILED | TIMEOUT
 */

import { lookup } from "node:dns/promises";
import { normalizeWebsiteUrl, extractAllSocialLinksFromHtml, type DiscoveredSocialLink } from "../../identity/smart-url.ts";
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

export type ProvenanceTag = "VERIFIED" | "INFERRED" | "USER_CONFIRMED" | "UNKNOWN";

export interface DiscoveredBusinessData {
  websiteUrl: string;
  businessName?: string;
  description?: string;
  industry?: string;
  businessModel?: string;
  location?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  services: string[];
  products: string[];
  primaryOffer?: string;
  targetAudience?: string;
  toneOfVoice?: string;
  businessStage: BusinessStage;
  socialLinks: DiscoveredSocialLink[];
  metaTags: Record<string, string>;
  title?: string;
  httpStatus?: number;
  isReachable: boolean;
  confidenceTags: Record<string, ProvenanceTag>;
  recommendedGoals: string[];
  recommendedPackage: string;
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

const DEFAULT_TIMEOUT_MS = 10_000;
const FETCH_TIMEOUT_MS = 6_000;

const MULTI_PAGE_PATHS = [
  "/about",
  "/about-us",
  "/services",
  "/products",
  "/pricing",
  "/contact",
  "/team",
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

  if (/saas|software|platform|cloud|api|developer|automation/i.test(lower)) {
    industry = "SaaS & Technology";
    model = "B2B Subscription";
  } else if (/clinic|dental|hospital|doctor|health|physio|care/i.test(lower)) {
    industry = "Healthcare & Wellness";
    model = "Local Healthcare Provider";
  } else if (/restaurant|cafe|bakery|food|dining|bistro|bar/i.test(lower)) {
    industry = "Food & Hospitality";
    model = "Local Dining / Retail";
  } else if (/consult|advis|law|attorney|account|tax|ca\b|agency|marketing/i.test(lower)) {
    industry = "Professional Services";
    model = "B2B Client Services";
  } else if (/shop|store|cart|buy|apparel|clothing|jewel|retail|ecommerce/i.test(lower)) {
    industry = "Retail & E-Commerce";
    model = "D2C / Retail";
  } else if (/school|academy|course|coaching|tutor|education|learning/i.test(lower)) {
    industry = "Education & Training";
    model = "Education / Training";
  } else if (/realty|real estate|builder|property|apartment|housing/i.test(lower)) {
    industry = "Real Estate & Construction";
    model = "High-Value Transaction / Inquiries";
  } else if (/salon|spa|beauty|makeup|hair/i.test(lower)) {
    industry = "Beauty & Personal Care";
    model = "Local Appointments";
  }

  return { industry, model };
}

function extractServicesFromHtml(html: string): string[] {
  const services = new Set<string>();
  const serviceRegex = /<(?:li|h2|h3|h4|span|p)[^>]*>(?:Our\s+)?([A-Z][a-zA-Z\s&]{3,40}(?:Services?|Solutions?|Management|Design|Consulting|Automation|Marketing|Development|Support|Integration|Care|Strategy))<\/(?:li|h2|h3|h4|span|p)>/gi;
  let m: RegExpExecArray | null;
  while ((m = serviceRegex.exec(html)) !== null) {
    const raw = cleanText(m[1]);
    if (raw && raw.length > 3 && raw.length < 50 && !/^(about|contact|home|privacy|terms|menu|navigation)/i.test(raw)) {
      services.add(raw);
    }
  }
  return Array.from(services).slice(0, 8);
}

function detectBusinessStage(data: {
  isReachable: boolean;
  businessName?: string;
  hasDescription: boolean;
  socialCount: number;
  pageCount: number;
  hasReviews: boolean;
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
  if (data.socialCount >= 2 && data.pageCount >= 2) {
    return "GROWING";
  }
  return "EARLY BUSINESS";
}

function generateContextualGoals(stage: BusinessStage, data: Partial<DiscoveredBusinessData>): string[] {
  const goals: string[] = [];
  const socials = data.socialLinks ?? [];
  const hasWhatsapp = socials.some((s) => s.platform === "whatsapp") || Boolean(data.whatsapp);
  const hasSocials = socials.some((s) => ["instagram", "facebook", "youtube", "linkedin"].includes(s.platform));

  if (stage === "IDEA" || stage === "PRE-LAUNCH") {
    goals.push("Build professional website & landing page");
    goals.push("Set up brand identity & social profiles");
    goals.push("Set up WhatsApp business communication");
  } else {
    goals.push("Generate more qualified customer leads");
    goals.push("Improve online visibility & Google discovery");
    if (!hasSocials) {
      goals.push("Grow social presence & content consistency");
    }
    if (!hasWhatsapp) {
      goals.push("Automate WhatsApp follow-up & replies");
    }
    goals.push("Centralize CRM & lead tracking");
    goals.push("Run targeted Meta Ads for growth");
  }

  return goals.slice(0, 6);
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
    metaTags: {},
    isReachable: false,
    businessStage: "IDEA",
    confidenceTags,
    recommendedGoals: [],
    recommendedPackage: "Starter",
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
  confidenceTags.websiteUrl = "VERIFIED";

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

  // State 2: FETCHING with hard timeout
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
    const pack = generateContextualPackageAndTransformation("IDEA", resultData);
    resultData.recommendedPackage = pack.recommendedPackage;
    resultData.transformation = pack.transformation;
    resultData.recommendedGoals = generateContextualGoals("IDEA", resultData);

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
    const pack = generateContextualPackageAndTransformation("IDEA", resultData);
    resultData.recommendedPackage = pack.recommendedPackage;
    resultData.transformation = pack.transformation;
    resultData.recommendedGoals = generateContextualGoals("IDEA", resultData);

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

  // State 3: DISCOVERING & EXTRACTING
  pushEvent("DISCOVERING", "Discovering business metadata and social channels...");

  // Extract <title>
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const rawTitle = cleanText(titleMatch?.[1]);
  if (rawTitle) {
    resultData.title = rawTitle;
    resultData.businessName = rawTitle.split(/[|\-–:]/)[0]?.trim();
    confidenceTags.businessName = "INFERRED";
  }

  // Extract meta tags
  const ogSiteName = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  if (ogSiteName) {
    resultData.businessName = cleanText(ogSiteName) || resultData.businessName;
    confidenceTags.businessName = "VERIFIED";
  }

  const metaDesc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i.exec(html)?.[1]
    || /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  if (metaDesc) {
    resultData.description = cleanText(metaDesc);
  }

  // Extract JSON-LD structured data
  pushEvent("EXTRACTING", "Parsing structured schema & address...");
  const jsonLd = parseJsonLd(html);
  for (const node of jsonLd) {
    const type = String(node["@type"] ?? "");
    if (/Organization|LocalBusiness|Store|Corporation|ProfessionalService/i.test(type)) {
      if (typeof node.name === "string" && node.name.trim()) {
        resultData.businessName = node.name.trim();
        confidenceTags.businessName = "VERIFIED";
      }
      if (typeof node.description === "string" && node.description.trim()) {
        resultData.description = node.description.trim();
      }
      if (typeof node.telephone === "string") {
        resultData.phone = node.telephone.trim();
        confidenceTags.phone = "VERIFIED";
      }
      if (typeof node.email === "string") {
        resultData.email = node.email.trim();
        confidenceTags.email = "VERIFIED";
      }
      if (node.address && typeof node.address === "object") {
        const addr = node.address as Record<string, unknown>;
        const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
          .filter((p): p is string => typeof p === "string" && p.trim().length > 0);
        if (parts.length) {
          resultData.location = parts.join(", ");
          confidenceTags.location = "VERIFIED";
        }
      }
    }
  }

  // Secondary subpage exploration (multi-page signals)
  const rootUrl = new URL(norm.url);
  for (const path of MULTI_PAGE_PATHS.slice(0, 3)) {
    try {
      const subUrl = new URL(path, rootUrl).href;
      const subRes = await fetcher(subUrl, {
        headers: { Accept: "text/html", "User-Agent": "StratxcelBusinessDiscovery/1.0 (+https://www.stratxcel.in)" },
      });
      if (subRes.ok) {
        const subHtml = (await subRes.text()).slice(0, 200_000);
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

  // Infer industry and business model
  const { industry, model } = inferIndustryAndModel(fullCorpus);
  if (industry) {
    resultData.industry = industry;
    confidenceTags.industry = "INFERRED";
  }
  if (model) {
    resultData.businessModel = model;
    confidenceTags.businessModel = "INFERRED";
  }

  // Extract services
  resultData.services = extractServicesFromHtml(fullCorpus);
  if (resultData.services.length > 0) {
    confidenceTags.services = "INFERRED";
    resultData.primaryOffer = resultData.services[0];
  }

  // Derive Business Stage
  const stage = detectBusinessStage({
    isReachable: resultData.isReachable,
    businessName: resultData.businessName,
    hasDescription: Boolean(resultData.description),
    socialCount: socialLinks.length,
    pageCount: fetchedPagesCount,
    hasReviews: /review|testimonial|rating|star/i.test(fullCorpus),
  });
  resultData.businessStage = stage;
  confidenceTags.businessStage = "INFERRED";

  // Generate contextual goals & transformation
  resultData.recommendedGoals = generateContextualGoals(stage, resultData);
  const pack = generateContextualPackageAndTransformation(stage, resultData);
  resultData.recommendedPackage = pack.recommendedPackage;
  resultData.transformation = pack.transformation;

  // State 4: VERIFYING & COMPLETING
  pushEvent("VERIFYING", "Verifying extraction consistency...");
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

