import { crawlWebsite, type StructuredPageData, type CanonicalCrawlResult } from "@stratxcel/search-discovery";
import { lookup } from "node:dns/promises";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface NormalizedFact<T> {
  value: T;
  source: string;
  evidence: string;
  confidence: ConfidenceLevel;
  observed_at: string;
}

export function createFact<T>(
  value: T,
  source: string,
  evidence: string,
  confidence: ConfidenceLevel = "HIGH",
): NormalizedFact<T> {
  return {
    value,
    source,
    evidence,
    confidence,
    observed_at: new Date().toISOString(),
  };
}

export function unknownFact<T>(fallbackValue: T, source = "website_crawler"): NormalizedFact<T> {
  return {
    value: fallbackValue,
    source,
    evidence: "No verified public evidence found during discovery crawl",
    confidence: "LOW",
    observed_at: new Date().toISOString(),
  };
}

export interface DiscoveredChannel {
  platform: string;
  url: string;
  handle: string;
  confidence: ConfidenceLevel;
}

export interface NormalizedWebsiteIntelligence {
  websiteUrl: string;
  crawledPagesCount: number;
  sitemapPresent: boolean;
  robotsPresent: boolean;
  generatedAt: string;

  // Identity
  identity: {
    businessName: NormalizedFact<string>;
    legalName: NormalizedFact<string>;
    tagline: NormalizedFact<string>;
    description: NormalizedFact<string>;
    logoUrl: NormalizedFact<string>;
  };

  // Business
  business: {
    industry: NormalizedFact<string>;
    businessType: NormalizedFact<string>;
    businessModel: NormalizedFact<string>;
    locations: NormalizedFact<string[]>;
    services: NormalizedFact<string[]>;
    products: NormalizedFact<string[]>;
    pricing: NormalizedFact<string[]>;
    openingHours: NormalizedFact<string[]>;
    bookingAvailable: NormalizedFact<boolean>;
    ecommerceAvailable: NormalizedFact<boolean>;
    digitalMaturity: NormalizedFact<"LOW" | "MEDIUM" | "HIGH">;
  };

  // Audience
  audience: {
    targetAudience: NormalizedFact<string>;
    customerSegments: NormalizedFact<string[]>;
    b2bOrB2c: NormalizedFact<"B2B" | "B2C" | "HYBRID" | "UNKNOWN">;
  };

  // Brand
  brand: {
    positioning: NormalizedFact<string>;
    valueProposition: NormalizedFact<string>;
    tone: NormalizedFact<string>;
    personality: NormalizedFact<string>;
    differentiators: NormalizedFact<string[]>;
    offers: NormalizedFact<string[]>;
  };

  // SEO & Technical
  seo: {
    indexablePages: number;
    titlePresentRatio: number;
    metaDescriptionPresentRatio: number;
    h1PresentRatio: number;
    schemaTypes: string[];
    canonicalConsistency: boolean;
    brokenLinksCount: number;
  };

  // Social & Digital Presence
  digitalPresence: {
    socialChannels: DiscoveredChannel[];
    missingSocials: string[];
  };

  // Trust
  trust: {
    reviewsFound: boolean;
    rating: number | null;
    reviewCount: number | null;
    testimonials: string[];
    certifications: string[];
    guarantees: string[];
    policies: string[];
  };

  // Conversion
  conversion: {
    whatsapp: NormalizedFact<string | null>;
    phone: NormalizedFact<string | null>;
    email: NormalizedFact<string | null>;
    hasForms: boolean;
    bookingLinks: string[];
    primaryCtas: string[];
    conversionStrengths: string[];
    conversionWeaknesses: string[];
  };
}

/**
 * Canonical Website Intelligence Pipeline.
 * Runs discovery crawl and extracts normalized facts with strict evidence tagging.
 */
export async function runWebsiteIntelligencePipeline(
  websiteUrl: string,
  options: {
    maxPages?: number;
    fetcher?: typeof fetch;
    resolver?: typeof lookup;
    signal?: AbortSignal;
  } = {},
): Promise<NormalizedWebsiteIntelligence> {
  const crawlResult: CanonicalCrawlResult = await crawlWebsite(websiteUrl, {
    limits: { maxPages: options.maxPages ?? 15 },
    fetcher: options.fetcher,
    resolver: options.resolver,
    signal: options.signal,
  });

  const structuredPages = crawlResult.structuredPages;
  const homePage = structuredPages.find((p) => {
    try {
      return new URL(p.technical.url).pathname === "/";
    } catch {
      return false;
    }
  }) ?? structuredPages[0];

  // 1. Identity Agent
  let businessName = "UNKNOWN";
  let nameSource = websiteUrl;
  let nameEvidence = "Derived from domain/title";
  let nameConfidence: ConfidenceLevel = "LOW";

  let legalName = "UNKNOWN";
  let tagline = "UNKNOWN";
  let description = "UNKNOWN";
  let logoUrl = "UNKNOWN";

  // Check Schema.org in structured pages
  for (const page of structuredPages) {
    for (const obj of page.jsonLdObjects) {
      const type = String(obj["@type"] ?? "");
      if (/Organization|LocalBusiness|Store|Restaurant|MedicalBusiness|Dentist|Plumbing|Plumber|Electrician|Service|Corporation|ProfessionalService|Clinic|Business|Place/i.test(type)) {
        if (typeof obj.name === "string" && obj.name.trim()) {
          businessName = obj.name.trim();
          nameSource = page.technical.url;
          nameEvidence = `Schema.org ${type} name: "${businessName}"`;
          nameConfidence = "HIGH";
        }
        if (typeof obj.legalName === "string" && obj.legalName.trim()) {
          legalName = obj.legalName.trim();
        }
        if (typeof obj.description === "string" && obj.description.trim()) {
          description = obj.description.trim().slice(0, 300);
        }
        if (typeof obj.logo === "string") {
          logoUrl = obj.logo;
        } else if (obj.logo && typeof obj.logo === "object" && "url" in (obj.logo as Record<string, unknown>)) {
          logoUrl = String((obj.logo as Record<string, unknown>).url);
        }
      }
    }
  }

  // Fallback to title / og:site_name if business name still unknown
  if (businessName === "UNKNOWN" && homePage) {
    if (homePage.metaTags["og:site_name"]) {
      businessName = homePage.metaTags["og:site_name"];
      nameSource = homePage.technical.url;
      nameEvidence = `og:site_name meta tag: "${businessName}"`;
      nameConfidence = "MEDIUM";
    } else if (homePage.technical.title) {
      const parts = homePage.technical.title.split(/[-|–•:]/);
      if (parts[0] && parts[0].trim().length > 2) {
        businessName = parts[0].trim();
        nameSource = homePage.technical.url;
        nameEvidence = `Extracted from page title: "${homePage.technical.title}"`;
        nameConfidence = "MEDIUM";
      }
    }
  }

  if (description === "UNKNOWN" && homePage?.technical.metaDescription) {
    description = homePage.technical.metaDescription;
  }

  // 2. Business Agent
  let industry = "UNKNOWN";
  let businessType = "UNKNOWN";
  let businessModel = "UNKNOWN";
  const locations: string[] = [];
  const services = new Set<string>();
  const products = new Set<string>();
  const pricingSignals: string[] = [];
  const openingHours: string[] = [];
  let isEcommerce = false;
  let isBooking = false;

  for (const page of structuredPages) {
    // Check tech
    if (page.techSignals.isShopify || page.techSignals.isWooCommerce) isEcommerce = true;
    if (page.contactSignals.bookingLinks.length > 0) isBooking = true;

    // Check JSON-LD
    for (const obj of page.jsonLdObjects) {
      const type = String(obj["@type"] ?? "");
      if (/Store|GroceryStore|GeneralStore/i.test(type)) {
        businessType = "General Store / Retail";
        industry = "Retail";
      } else if (/Restaurant|FoodEstablishment|Cafe/i.test(type)) {
        businessType = "Restaurant / Food Service";
        industry = "Food & Hospitality";
      } else if (/MedicalBusiness|Dentist|Physician|Clinic/i.test(type)) {
        businessType = "Healthcare / Clinic";
        industry = "Healthcare";
      } else if (/Plumbing|Plumber|Electrician|Locksmith|HVAC|Contractor/i.test(type)) {
        businessType = "Local Home Services / Contractor";
        industry = "Home & Repair Services";
      } else if (/LocalBusiness/i.test(type)) {
        businessType = "Local Business";
        if (industry === "UNKNOWN") industry = "Local Services";
      }

      if (obj.address) {
        const addr = typeof obj.address === "string" ? obj.address : JSON.stringify(obj.address);
        locations.push(addr);
      }
      if (obj.openingHoursSpecification || obj.openingHours) {
        openingHours.push(JSON.stringify(obj.openingHoursSpecification ?? obj.openingHours));
      }
      if (/Product/i.test(type) && typeof obj.name === "string") {
        products.add(obj.name);
        isEcommerce = true;
      }
      if (/Service/i.test(type) && typeof obj.name === "string") {
        services.add(obj.name);
      }
    }

    // Check Headings & Links for Services / Products
    for (const h2 of page.headings.h2) {
      if (page.technical.url.includes("service") || page.technical.url.includes("solution")) {
        if (h2.length < 60 && !/subscribe|contact|newsletter|footer|about/i.test(h2)) {
          services.add(h2);
        }
      }
    }
  }

  // Determine B2B / B2C
  let b2bOrB2c: "B2B" | "B2C" | "HYBRID" | "UNKNOWN" = "UNKNOWN";
  const allText = structuredPages.map((p) => `${p.technical.title ?? ""} ${p.technical.metaDescription ?? ""}`).join(" ");
  if (/b2b|enterprise|procurement|wholesale|corporate clients/i.test(allText)) {
    b2bOrB2c = "B2B";
  } else if (/retail|shop now|order online|patients|walk-in|dine-in|store hours/i.test(allText)) {
    b2bOrB2c = "B2C";
  }

  // 3. Brand Agent
  let valueProposition = "UNKNOWN";
  let tone = "UNKNOWN";
  let personality = "UNKNOWN";
  const differentiators: string[] = [];
  const offers: string[] = [];

  if (homePage?.headings.h1[0]) {
    valueProposition = homePage.headings.h1[0];
  } else if (description !== "UNKNOWN") {
    valueProposition = description;
  }

  // 4. Contact & Conversion Agent
  const allWhatsapps = new Set<string>();
  const allPhones = new Set<string>();
  const allEmails = new Set<string>();
  const allBookingLinks = new Set<string>();
  let hasForms = false;

  for (const page of structuredPages) {
    for (const w of page.contactSignals.whatsapps) allWhatsapps.add(w);
    for (const p of page.contactSignals.phones) allPhones.add(p);
    for (const e of page.contactSignals.emails) allEmails.add(e);
    for (const b of page.contactSignals.bookingLinks) allBookingLinks.add(b);
    if (page.contactSignals.forms) hasForms = true;
  }

  // 5. Social & Digital Presence
  const discoveredSocials = new Map<string, DiscoveredChannel>();
  for (const page of structuredPages) {
    for (const link of page.socialLinks) {
      try {
        const u = new URL(link);
        let platform = "other";
        if (/instagram\.com/i.test(u.hostname)) platform = "instagram";
        else if (/facebook\.com|fb\.com/i.test(u.hostname)) platform = "facebook";
        else if (/linkedin\.com/i.test(u.hostname)) platform = "linkedin";
        else if (/youtube\.com/i.test(u.hostname)) platform = "youtube";
        else if (/twitter\.com|x\.com/i.test(u.hostname)) platform = "x";
        else if (/threads\.net/i.test(u.hostname)) platform = "threads";
        else if (/pinterest\.com/i.test(u.hostname)) platform = "pinterest";

        if (platform !== "other" && !discoveredSocials.has(platform)) {
          const parts = u.pathname.split("/").filter(Boolean);
          const handle = parts[0] ?? "";
          if (handle && !["p", "reel", "share", "watch", "intent", "pages"].includes(handle.toLowerCase())) {
            discoveredSocials.set(platform, {
              platform,
              url: link,
              handle,
              confidence: "HIGH",
            });
          }
        }
      } catch {
        // bad link
      }
    }
  }

  const standardPlatforms = ["instagram", "facebook", "google_business", "linkedin", "youtube"];
  const missingSocials = standardPlatforms.filter((p) => !discoveredSocials.has(p));

  // 6. Trust Agent
  let reviewsFound = false;
  let rating: number | null = null;
  let reviewCount: number | null = null;
  const testimonials: string[] = [];
  const certifications: string[] = [];

  for (const page of structuredPages) {
    for (const obj of page.jsonLdObjects) {
      if (obj.aggregateRating && typeof obj.aggregateRating === "object") {
        const ar = obj.aggregateRating as Record<string, unknown>;
        rating = Number(ar.ratingValue) || null;
        reviewCount = Number(ar.reviewCount) || null;
        reviewsFound = true;
      }
      if (obj.review || obj.reviews) {
        reviewsFound = true;
      }
    }
  }

  // 7. SEO Technical Summary
  const indexablePages = structuredPages.filter((p) => p.technical.indexable).length;
  const titlePresentCount = structuredPages.filter((p) => p.technical.title).length;
  const metaDescPresentCount = structuredPages.filter((p) => p.technical.metaDescription).length;
  const h1PresentCount = structuredPages.filter((p) => p.technical.h1Count && p.technical.h1Count > 0).length;

  const totalPages = Math.max(1, structuredPages.length);
  const allSchemas = [...new Set(structuredPages.flatMap((p) => p.technical.structuredDataTypes ?? []))];

  // Digital maturity assessment
  let maturityScore = 0;
  if (crawlResult.sitemapPresent) maturityScore++;
  if (allSchemas.length > 0) maturityScore++;
  if (discoveredSocials.size >= 2) maturityScore++;
  if (hasForms || allWhatsapps.size > 0) maturityScore++;
  if (isEcommerce || isBooking) maturityScore++;

  const digitalMaturity: "LOW" | "MEDIUM" | "HIGH" =
    maturityScore >= 4 ? "HIGH" : maturityScore >= 2 ? "MEDIUM" : "LOW";

  return {
    websiteUrl,
    crawledPagesCount: structuredPages.length,
    sitemapPresent: crawlResult.sitemapPresent,
    robotsPresent: crawlResult.robotsPresent,
    generatedAt: new Date().toISOString(),

    identity: {
      businessName: createFact(businessName, nameSource, nameEvidence, nameConfidence),
      legalName: legalName !== "UNKNOWN" ? createFact(legalName, websiteUrl, "Schema legalName", "HIGH") : unknownFact("UNKNOWN"),
      tagline: tagline !== "UNKNOWN" ? createFact(tagline, websiteUrl, "Extracted tagline", "MEDIUM") : unknownFact("UNKNOWN"),
      description: description !== "UNKNOWN" ? createFact(description, websiteUrl, "Extracted description", "HIGH") : unknownFact("UNKNOWN"),
      logoUrl: logoUrl !== "UNKNOWN" ? createFact(logoUrl, websiteUrl, "Logo reference", "HIGH") : unknownFact("UNKNOWN"),
    },

    business: {
      industry: industry !== "UNKNOWN" ? createFact(industry, websiteUrl, `Classified from schema & content: ${industry}`, "HIGH") : unknownFact("UNKNOWN"),
      businessType: businessType !== "UNKNOWN" ? createFact(businessType, websiteUrl, `Identified type: ${businessType}`, "HIGH") : unknownFact("Local Business"),
      businessModel: businessModel !== "UNKNOWN" ? createFact(businessModel, websiteUrl, "Extracted business model", "MEDIUM") : unknownFact("UNKNOWN"),
      locations: locations.length > 0 ? createFact(locations, websiteUrl, "Discovered address / location schemas", "HIGH") : unknownFact([]),
      services: services.size > 0 ? createFact([...services], websiteUrl, "Extracted service offerings", "HIGH") : unknownFact([]),
      products: products.size > 0 ? createFact([...products], websiteUrl, "Extracted product catalog", "HIGH") : unknownFact([]),
      pricing: pricingSignals.length > 0 ? createFact(pricingSignals, websiteUrl, "Discovered pricing signals", "MEDIUM") : unknownFact([]),
      openingHours: openingHours.length > 0 ? createFact(openingHours, websiteUrl, "Schema opening hours", "HIGH") : unknownFact([]),
      bookingAvailable: createFact(isBooking, websiteUrl, isBooking ? "Booking widgets/links discovered" : "No booking system found", "HIGH"),
      ecommerceAvailable: createFact(isEcommerce, websiteUrl, isEcommerce ? "E-commerce platform detected" : "No e-commerce cart detected", "HIGH"),
      digitalMaturity: createFact(digitalMaturity, websiteUrl, `Digital maturity score: ${maturityScore}/5`, "HIGH"),
    },

    audience: {
      targetAudience: unknownFact("UNKNOWN"),
      customerSegments: unknownFact([]),
      b2bOrB2c: b2bOrB2c !== "UNKNOWN" ? createFact(b2bOrB2c, websiteUrl, "Audience signals from content/pricing", "MEDIUM") : unknownFact("UNKNOWN"),
    },

    brand: {
      positioning: valueProposition !== "UNKNOWN" ? createFact(valueProposition, websiteUrl, "Primary headline / hero value proposition", "HIGH") : unknownFact("UNKNOWN"),
      valueProposition: valueProposition !== "UNKNOWN" ? createFact(valueProposition, websiteUrl, "Hero statement", "HIGH") : unknownFact("UNKNOWN"),
      tone: tone !== "UNKNOWN" ? createFact(tone, websiteUrl, "Tone analysis", "MEDIUM") : unknownFact("Professional"),
      personality: personality !== "UNKNOWN" ? createFact(personality, websiteUrl, "Brand personality", "LOW") : unknownFact("UNKNOWN"),
      differentiators: differentiators.length > 0 ? createFact(differentiators, websiteUrl, "Extracted unique points", "MEDIUM") : unknownFact([]),
      offers: offers.length > 0 ? createFact(offers, websiteUrl, "Identified promotions", "HIGH") : unknownFact([]),
    },

    seo: {
      indexablePages,
      titlePresentRatio: titlePresentCount / totalPages,
      metaDescriptionPresentRatio: metaDescPresentCount / totalPages,
      h1PresentRatio: h1PresentCount / totalPages,
      schemaTypes: allSchemas,
      canonicalConsistency: structuredPages.every((p) => p.technical.canonical != null),
      brokenLinksCount: crawlResult.errors.length,
    },

    digitalPresence: {
      socialChannels: [...discoveredSocials.values()],
      missingSocials,
    },

    trust: {
      reviewsFound,
      rating,
      reviewCount,
      testimonials,
      certifications,
      guarantees: [],
      policies: structuredPages
        .filter((p) => /privacy|terms/i.test(p.technical.url))
        .map((p) => p.technical.url),
    },

    conversion: {
      whatsapp: allWhatsapps.size > 0 ? createFact([...allWhatsapps][0]!, websiteUrl, "WhatsApp direct link found", "HIGH") : createFact<string | null>(null, websiteUrl, "No WhatsApp link found", "HIGH"),
      phone: allPhones.size > 0 ? createFact([...allPhones][0]!, websiteUrl, "Phone contact found", "HIGH") : createFact<string | null>(null, websiteUrl, "No phone found", "HIGH"),
      email: allEmails.size > 0 ? createFact([...allEmails][0]!, websiteUrl, "Email contact found", "HIGH") : createFact<string | null>(null, websiteUrl, "No email found", "HIGH"),
      hasForms,
      bookingLinks: [...allBookingLinks],
      primaryCtas: homePage?.headings.h2.slice(0, 3) ?? [],
      conversionStrengths: [
        ...(allWhatsapps.size > 0 ? ["Direct WhatsApp conversion path active"] : []),
        ...(allPhones.size > 0 ? ["Phone call link accessible"] : []),
        ...(hasForms ? ["Lead capture form present"] : []),
        ...(isBooking ? ["Direct appointment booking enabled"] : []),
      ],
      conversionWeaknesses: [
        ...(allWhatsapps.size === 0 ? ["No direct WhatsApp contact button for instant messaging"] : []),
        ...(!hasForms && allPhones.size === 0 ? ["No contact form or phone number found on crawled pages"] : []),
        ...(!reviewsFound ? ["No verified public reviews or trust badges displayed"] : []),
      ],
    },
  };
}
