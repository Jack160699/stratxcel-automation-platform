import assert from "node:assert/strict";
import { synthesizeOnboardingBusinessIntelligence } from "../../../../lib/intelligence/onboarding-business-intelligence.ts";

function run() {
  console.log("Running Business Intelligence Synthesis & Industry Heuristics Tests...");

  // 1. Full Multi-Source Presence (SaaS / Tech)
  {
    const result = synthesizeOnboardingBusinessIntelligence({
      websiteData: {
        websiteUrl: "https://stratxcel.in",
        businessName: "StratXcel Solutions",
        description: "AI-native agency growth and business automation platform.",
        industry: "SaaS & Technology",
        services: ["AI Automation", "Social Copilot", "Website Intelligence"],
        primaryOffer: "AI Automation",
        location: "Bhilai, Chhattisgarh, IN",
        whatsapp: "+917777812777",
      },
      googleMapsData: {
        rawInput: "https://maps.app.goo.gl/xyz",
        canonicalUrl: "https://maps.app.goo.gl/xyz",
        placeName: "StratXcel Solutions Office",
        displayHandle: "StratXcel Solutions Office",
      },
      selectedIndustry: "SaaS & Technology",
      confirmedSocials: [
        { platform: "instagram", handle: "@stratxcel.ai", url: "https://instagram.com/stratxcel.ai", confirmed: true },
        { platform: "youtube", handle: "@StratxcelSolutions", url: "https://youtube.com/@StratxcelSolutions", confirmed: true },
      ],
    });

    assert.equal(result.business.name, "StratXcel Solutions");
    assert.equal(result.business.industry, "SaaS & Technology");
    assert.equal(result.business.socials.length, 2);
    assert.ok(result.brand.description.length > 20, "Must synthesize rich description");
    assert.ok(result.brand.audience.includes("StratXcel Solutions") || result.brand.audience.includes("businesses"));
    assert.ok(result.brand.tone.toLowerCase().includes("authoritative") || result.brand.tone.toLowerCase().includes("modern"));
    assert.ok(result.brand.offers.includes("AI Automation"));
    assert.ok(result.brand.restrictions.includes("revenue"));
    assert.ok(result.goals.recommendedKeys.includes("thirty_day_growth_plan"));
    assert.ok(result.goals.recommendedKeys.includes("seo_audit"));
    assert.ok(result.confidenceScore >= 0.85);
  }

  // 2. Local Business (Food & Hospitality / Bakery) with Google Maps Only
  {
    const result = synthesizeOnboardingBusinessIntelligence({
      googleMapsData: {
        rawInput: "https://www.google.com/maps/place/Sweet+Bakes+Bakery/@12.97,77.64,15z",
        canonicalUrl: "https://www.google.com/maps/place/Sweet+Bakes+Bakery/@12.97,77.64,15z",
        placeName: "Sweet Bakes Bakery",
        displayHandle: "Sweet Bakes Bakery",
      },
      selectedIndustry: "Food & Hospitality",
    });

    assert.equal(result.business.name, "Sweet Bakes Bakery");
    assert.equal(result.business.industry, "Food & Hospitality");
    assert.equal(result.provenance.businessName, "GOOGLE_MAPS");
    assert.ok(result.brand.tone.toLowerCase().includes("warm") || result.brand.tone.toLowerCase().includes("artisanal"));
    assert.ok(result.brand.description.includes("Sweet Bakes Bakery"));
    assert.ok(result.brand.restrictions.includes("allergen") || result.brand.restrictions.includes("dietary"));
    assert.ok(result.goals.recommendedKeys.includes("social_campaign") || result.goals.recommendedKeys.includes("thirty_day_growth_plan"));
  }

  // 3. Strict Zero-Social Fabrication Guard
  {
    const result = synthesizeOnboardingBusinessIntelligence({
      websiteData: {
        websiteUrl: "https://localclinic.org",
        businessName: "Care Dental Clinic",
        industry: "Healthcare & Wellness",
      },
      selectedIndustry: "Healthcare & Wellness",
      confirmedSocials: [], // No social accounts provided
    });

    assert.equal(result.business.socials.length, 0, "Socials must be empty when none confirmed");
    // Audience must not fabricate social channel facts
    assert.equal(result.brand.audience.includes("Instagram followers"), false);
    assert.ok(result.brand.restrictions.includes("medical") || result.brand.restrictions.includes("cures"));
  }

  // 4. Candidate Goals are grounded in canonical catalogue
  {
    const result = synthesizeOnboardingBusinessIntelligence({
      selectedIndustry: "Professional Services",
    });

    assert.ok(result.goals.candidates.length >= 5);
    const hasInvalid = result.goals.candidates.some((c) => !c.key || !c.label || !c.reason);
    assert.equal(hasInvalid, false, "All candidate goals must be valid catalogue entries");
  }

  console.log("business-intelligence-synthesis.test.ts: ALL PASS");
}

run();
