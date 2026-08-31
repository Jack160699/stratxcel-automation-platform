// Run with: node --experimental-strip-types lib/growth/__tests__/growth-autopilot-context.test.ts
//
// STRATXCEL final autonomous growth-engine brief, Section 2: the one
// canonical GrowthAutopilotContext. buildGrowthAutopilotContext is a pure
// function (no I/O), so it's tested directly with real, representative
// input shapes -- no fake Supabase client or mocked network needed.
import assert from "node:assert/strict";
import { buildGrowthAutopilotContext } from "../growth-autopilot-context.ts";
import { buildSocialAutopilotContext } from "../../social/social-autopilot-context.ts";
import type { BrandProfileRow } from "../../social/repositories/brand.ts";
import { createFact, unknownFact, type NormalizedWebsiteIntelligence } from "../../intelligence/website-intelligence.ts";

const REAL_STRATXCEL_BRAND_PROFILE: BrandProfileRow = {
  id: "bp1",
  owner_id: "9381030b-b14a-4551-a6e9-b5918f017e1b",
  identity: { name: "Stratxcel", industry: "generic", positioning: "AI-powered marketing automation for local businesses", business_model: "B2B SaaS subscription", description: "Autonomous marketing engine for founders without an in-house marketing team" },
  audiences: [{ name: "Local business owners", description: "Founders and small teams across India", pain_points: "No time for consistent marketing; no in-house marketing team" }],
  voice: { tone: ["direct", "confident", "founder-to-founder"], blocked_phrases: [], forbidden_claims: [] },
  visual: { colors: ["#1a56db", "#0b1120"], priorities: ["clarity", "trust"] },
  goals: [],
  competitors: [],
  source_material: [],
  products: [{ name: "Social Autopilot", description: "Automated social content generation and publishing" }],
  content_pillars: [{ name: "AI Automation in Real Business" }],
  rules: [{ kind: "never", text: "Never claim a specific ROI percentage without a verified case study" }],
  updated_at: "2026-08-30T00:00:00Z",
};

function fakeIntelligence(overrides: { metaDescriptionPresentRatio?: number; brokenLinksCount?: number } = {}): NormalizedWebsiteIntelligence {
  return {
    websiteUrl: "https://stratxcel.in",
    crawledPagesCount: 12,
    sitemapPresent: true,
    robotsPresent: true,
    generatedAt: "2026-08-31T00:00:00Z",
    identity: {
      businessName: createFact("Stratxcel", "https://stratxcel.in", "og:site_name", "HIGH"),
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
      bookingAvailable: createFact(false, "https://stratxcel.in", "No booking system found", "HIGH"),
      ecommerceAvailable: createFact(false, "https://stratxcel.in", "No e-commerce cart detected", "HIGH"),
      digitalMaturity: createFact("MEDIUM", "https://stratxcel.in", "score", "HIGH"),
    },
    audience: { targetAudience: unknownFact("UNKNOWN"), customerSegments: unknownFact([]), b2bOrB2c: unknownFact("UNKNOWN") },
    brand: {
      positioning: unknownFact("UNKNOWN"),
      valueProposition: unknownFact("UNKNOWN"),
      tone: unknownFact("Professional"),
      personality: unknownFact("UNKNOWN"),
      differentiators: unknownFact([]),
      offers: unknownFact([]),
    },
    seo: {
      indexablePages: 12,
      titlePresentRatio: 0.9,
      metaDescriptionPresentRatio: overrides.metaDescriptionPresentRatio ?? 0.5,
      h1PresentRatio: 1,
      schemaTypes: ["Organization"],
      canonicalConsistency: true,
      brokenLinksCount: overrides.brokenLinksCount ?? 0,
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
  };
}

function run() {
  const social = buildSocialAutopilotContext({
    tenantId: "466e6195-a9f6-4576-8271-29fdae61c18a",
    ownerId: "9381030b-b14a-4551-a6e9-b5918f017e1b",
    subscriptionId: "0b2fe0ef-91b8-4417-bf95-664d56d36a0c",
    brandProfile: REAL_STRATXCEL_BRAND_PROFILE,
    brandBrainContent: { location: "Bhilai, Chhattisgarh, India", logo_url: "https://example.com/logo.png", logo_variants: null } as never,
    verifiedFacts: ["Business location (as provided by the owner): Bhilai, Chhattisgarh, India"],
    research: null,
    campaignHistory: [],
    weekStart: "2026-08-24",
    weekEnd: "2026-08-30",
    subscriptionEntitlements: null,
    auditEntitlements: { allowed: 5, used: 0, remaining: 5 },
  });

  // --- No website/GBP data supplied: everything honestly absent, never fabricated ---
  const bare = buildGrowthAutopilotContext({ social });
  assert.equal(bare.social.tenantId, "466e6195-a9f6-4576-8271-29fdae61c18a");
  assert.equal(bare.website.url, null);
  assert.equal(bare.website.intelligence, null);
  assert.equal(bare.website.platform, "UNKNOWN");
  assert.equal(bare.website.authorization, "NONE");
  assert.equal(bare.googleBusiness.status, "NOT_CHECKED");
  assert.equal(bare.googleBusiness.profile, null);
  assert.equal(bare.seo.technicalSnapshot, null);
  assert.deepEqual(bare.seo.opportunities, [], "no crawl yet -- the director must not be invoked, not just return an empty fabricated list");
  assert.deepEqual(bare.aeo.opportunities, []);
  assert.deepEqual(bare.geo.opportunities, []);
  assert.deepEqual(bare.trendSignals, []);
  assert.equal(bare.searchConsole, null);

  // --- Real website intelligence supplied: seo.technicalSnapshot maps straight through, AND the SEO/AEO/GEO directors run for real off it ---
  const withWebsite = buildGrowthAutopilotContext({
    social,
    websiteUrl: "https://stratxcel.in",
    websiteIntelligence: fakeIntelligence(),
    websitePlatform: "NEXTJS",
    websiteAuthorization: "ANALYZE_ONLY",
  });
  assert.equal(withWebsite.website.url, "https://stratxcel.in");
  assert.equal(withWebsite.website.platform, "NEXTJS");
  assert.equal(withWebsite.website.authorization, "ANALYZE_ONLY");
  assert.equal(withWebsite.seo.technicalSnapshot?.indexablePages, 12);
  assert.equal(withWebsite.seo.technicalSnapshot?.brokenLinksCount, 0);
  // real director output: a 50% meta-description ratio is a real, evidenced gap
  assert.ok(withWebsite.seo.opportunities.some((a) => a.id === "seo-missing-meta-description"));
  // real director output: no GBP supplied -> the one honest "cannot verify NAP" GEO action
  assert.deepEqual(withWebsite.geo.opportunities.map((a) => a.id), ["geo-no-gbp-connected"]);

  // --- Evidence changes -> output changes (Section 35's bar, applied at the context-assembly level) ---
  const healthier = buildGrowthAutopilotContext({
    social,
    websiteUrl: "https://stratxcel.in",
    websiteIntelligence: fakeIntelligence({ metaDescriptionPresentRatio: 1, brokenLinksCount: 0 }),
  });
  assert.ok(
    !healthier.seo.opportunities.some((a) => a.id === "seo-missing-meta-description"),
    "improved evidence must remove the corresponding action, not leave a stale one behind",
  );

  console.log("growth-autopilot-context.test.ts: real data maps correctly, real SEO/AEO/GEO directors run off it, absent data stays honestly empty — PASS");
}

run();
