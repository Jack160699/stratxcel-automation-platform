// Run with: node --experimental-strip-types lib/growth/__tests__/search-growth-director.test.ts
//
// STRATXCEL final autonomous growth-OS brief, Section 35's "Strategy
// Learning Test" bar applied to the SEO/AEO/GEO Director layer: different
// real evidence MUST produce different real, executable output. Every
// assertion here traces a specific input field to a specific output
// action, proving this is real computation, not a static list.
import assert from "node:assert/strict";
import { computeSeoOpportunities, computeAeoOpportunities, computeGeoOpportunities } from "../search-growth-director.ts";
import { createFact, unknownFact, type NormalizedWebsiteIntelligence } from "../../intelligence/website-intelligence.ts";
import type { GoogleBusinessLocationDetails } from "../../google/google-growth-engine.ts";

function baseIntel(overrides: Partial<NormalizedWebsiteIntelligence> = {}): NormalizedWebsiteIntelligence {
  return {
    websiteUrl: "https://example-business.test",
    crawledPagesCount: 10,
    sitemapPresent: true,
    robotsPresent: true,
    generatedAt: "2026-08-31T00:00:00Z",
    identity: {
      businessName: createFact("Example Business", "https://example-business.test", "og:site_name", "HIGH"),
      legalName: unknownFact("UNKNOWN"),
      tagline: unknownFact("UNKNOWN"),
      description: unknownFact("UNKNOWN"),
      logoUrl: unknownFact("UNKNOWN"),
    },
    business: {
      industry: unknownFact("UNKNOWN"),
      businessType: unknownFact("Local Business"),
      businessModel: unknownFact("UNKNOWN"),
      locations: unknownFact([]),
      services: unknownFact([]),
      products: unknownFact([]),
      pricing: unknownFact([]),
      openingHours: unknownFact([]),
      bookingAvailable: createFact(false, "https://example-business.test", "No booking system found", "HIGH"),
      ecommerceAvailable: createFact(false, "https://example-business.test", "No e-commerce cart detected", "HIGH"),
      digitalMaturity: createFact("LOW", "https://example-business.test", "score", "HIGH"),
    },
    audience: {
      targetAudience: unknownFact("UNKNOWN"),
      customerSegments: unknownFact([]),
      b2bOrB2c: unknownFact("UNKNOWN"),
    },
    brand: {
      positioning: unknownFact("UNKNOWN"),
      valueProposition: unknownFact("UNKNOWN"),
      tone: unknownFact("Professional"),
      personality: unknownFact("UNKNOWN"),
      differentiators: unknownFact([]),
      offers: unknownFact([]),
    },
    seo: {
      indexablePages: 10,
      titlePresentRatio: 1,
      metaDescriptionPresentRatio: 1,
      h1PresentRatio: 1,
      schemaTypes: ["Organization"],
      canonicalConsistency: true,
      brokenLinksCount: 0,
    },
    digitalPresence: { socialChannels: [], missingSocials: [] },
    trust: { reviewsFound: false, rating: null, reviewCount: null, testimonials: [], certifications: [], guarantees: [], policies: [] },
    conversion: {
      whatsapp: createFact<string | null>(null, "x", "none", "HIGH"),
      phone: createFact<string | null>(null, "x", "none", "HIGH"),
      email: createFact<string | null>(null, "x", "none", "HIGH"),
      hasForms: false,
      bookingLinks: [],
      primaryCtas: [],
      conversionStrengths: [],
      conversionWeaknesses: [],
    },
    ...overrides,
  };
}

function run() {
  // --- SEO: a fully healthy site produces zero actions -- no manufactured busywork ---
  const healthy = baseIntel();
  assert.deepEqual(computeSeoOpportunities(healthy), [], "a technically clean site must not receive fabricated SEO actions");

  // --- SEO: real defects produce real, distinct actions tied to the exact evidence ---
  const unhealthy = baseIntel({
    sitemapPresent: false,
    robotsPresent: false,
    seo: {
      indexablePages: 4,
      titlePresentRatio: 0.5,
      metaDescriptionPresentRatio: 0.2,
      h1PresentRatio: 0.8,
      schemaTypes: [],
      canonicalConsistency: false,
      brokenLinksCount: 5,
    },
  });
  const seoActions = computeSeoOpportunities(unhealthy);
  const seoIds = seoActions.map((a) => a.id);
  assert.ok(seoIds.includes("seo-missing-sitemap"));
  assert.ok(seoIds.includes("seo-missing-robots"));
  assert.ok(seoIds.includes("seo-missing-titles"));
  assert.ok(seoIds.includes("seo-missing-meta-description"));
  assert.ok(seoIds.includes("seo-missing-h1"));
  assert.ok(seoIds.includes("seo-canonical-inconsistency"));
  assert.ok(seoIds.includes("seo-broken-links"));
  assert.ok(seoIds.includes("seo-missing-org-schema"));
  const metaAction = seoActions.find((a) => a.id === "seo-missing-meta-description")!;
  assert.equal(metaAction.impact, "HIGH", "a 20% meta-description ratio must be scored HIGH impact, not MEDIUM");
  const brokenLinksAction = seoActions.find((a) => a.id === "seo-broken-links")!;
  assert.ok(brokenLinksAction.why.includes("5"), "the action must cite the real broken-link count, not a generic message");

  // --- AEO: no services/pricing/booking data -> only the always-relevant pricing gap fires ---
  const aeoSparse = computeAeoOpportunities(baseIntel());
  assert.equal(aeoSparse.length, 1);
  assert.equal(aeoSparse[0]!.id, "aeo-missing-pricing-answer");

  // --- AEO: real services + real pricing + real booking -> different, evidence-tied actions ---
  const aeoRich = computeAeoOpportunities(
    baseIntel({
      business: {
        ...baseIntel().business,
        services: createFact(["AC Repair", "Installation"], "https://example-business.test", "extracted", "HIGH"),
        pricing: createFact(["Starting at ₹499"], "https://example-business.test", "pricing page", "MEDIUM"),
        bookingAvailable: createFact(true, "https://example-business.test", "booking widget found", "HIGH"),
      },
    }),
  );
  const aeoIds = aeoRich.map((a) => a.id);
  assert.ok(aeoIds.includes("aeo-service-scope-ac-repair"));
  assert.ok(aeoIds.includes("aeo-service-scope-installation"));
  assert.ok(aeoIds.includes("aeo-booking-how-to"));
  assert.ok(!aeoIds.includes("aeo-missing-pricing-answer"), "real pricing data must suppress the missing-pricing action");

  // --- GEO: no GBP connected -> the one honest "cannot verify" action, no fabricated NAP claims ---
  const geoNoGbp = computeGeoOpportunities(baseIntel(), null);
  assert.equal(geoNoGbp.length, 1);
  assert.equal(geoNoGbp[0]!.id, "geo-no-gbp-connected");

  // --- GEO: GBP connected with a mismatched phone -> real NAP-mismatch action ---
  const gbp: GoogleBusinessLocationDetails = {
    locationId: "loc1",
    businessName: "Example Business",
    primaryCategory: "HVAC Contractor",
    address: { streetAddress: "12 Main St", city: "Bhilai", state: "Chhattisgarh", postalCode: "490001", country: "IN" },
    phone: "+91 98765 43210",
    websiteUrl: "https://example-business.test",
    description: "",
    photoCount: 0,
    verificationStatus: "VERIFIED",
    reviewCount: 0,
    averageRating: 0,
  };
  const geoWithGbp = computeGeoOpportunities(
    baseIntel({ conversion: { ...baseIntel().conversion, phone: createFact<string | null>("011-2345678", "x", "found on site", "HIGH") } }),
    gbp,
  );
  const geoIds = geoWithGbp.map((a) => a.id);
  assert.ok(geoIds.includes("geo-nap-phone-mismatch"));
  assert.ok(geoIds.includes("geo-no-address-on-website"));
  assert.ok(geoIds.includes("geo-missing-localbusiness-schema"));

  // --- GEO: matching phone + address + schema present -> the specific action disappears ---
  const geoConsistent = computeGeoOpportunities(
    baseIntel({
      conversion: { ...baseIntel().conversion, phone: createFact<string | null>("+919876543210", "x", "found on site", "HIGH") },
      business: { ...baseIntel().business, locations: createFact(["12 Main St, Bhilai"], "x", "address schema", "HIGH") },
      seo: { ...baseIntel().seo, schemaTypes: ["LocalBusiness"] },
    }),
    gbp,
  );
  assert.deepEqual(geoConsistent.map((a) => a.id), [], "fully NAP-consistent evidence must produce zero fabricated GEO actions");

  console.log("search-growth-director.test.ts: real evidence drives real, distinct, traceable actions; clean evidence produces none — PASS");
}

run();
