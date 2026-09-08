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

  // 5. STRATXCEL BUSINESS DISCOVERY redesign: real Google Places data ranks
  //    above website data and the old regex-only googleMapsData, per-field,
  //    without ever fabricating a field it has no real value for -----------
  {
    const placeData = {
      placeId: "ChIJ_test_medroute",
      place: "places/ChIJ_test_medroute",
      displayName: "MedRoute Consultancy",
      formattedAddress: "123 Main Rd, Raipur, Chhattisgarh 492001, India",
      city: "Raipur",
      state: "Chhattisgarh",
      country: "India",
      postalCode: "492001",
      latitude: 21.25,
      longitude: 81.63,
      types: ["health_consultant", "point_of_interest", "establishment"],
      category: "Health Consultant",
      phone: "098765 43210",
      websiteUri: "https://www.medrouteconsultancy.com",
      googleMapsUri: "https://maps.google.com/?cid=12345",
      rating: 4.6,
      userRatingCount: 128,
      openingHoursWeekdayText: null,
      photoNames: [],
    };

    const result = synthesizeOnboardingBusinessIntelligence({
      googlePlaceData: placeData,
      websiteData: {
        websiteUrl: "https://www.medrouteconsultancy.com",
        businessName: "MedRoute", // deliberately different/weaker than the real Places name
        industry: "Consulting",
        description: "A long, real scraped description of what MedRoute actually does for its students, well over twenty characters.",
      },
      googleMapsData: {
        rawInput: "https://maps.app.goo.gl/old",
        canonicalUrl: "https://maps.app.goo.gl/old",
        placeName: "MedRoute (old regex guess)",
        displayHandle: "MedRoute (old regex guess)",
      },
    });

    assert.equal(result.business.name, "MedRoute Consultancy", "real Places displayName must win over both website businessName and the old regex-only googleMapsData placeName");
    assert.equal(result.provenance.businessName, "GOOGLE_MAPS");
    assert.equal(result.business.location, "123 Main Rd, Raipur, Chhattisgarh 492001, India", "real formattedAddress must win over the old displayHandle fallback");
    assert.equal(result.provenance.location, "GOOGLE_MAPS");
    assert.equal(result.business.website, "https://www.medrouteconsultancy.com", "website resolution still works when both googlePlaceData and websiteData agree");
    assert.equal(result.business.googleMapsUrl, "https://maps.google.com/?cid=12345", "real googleMapsUri must win over the old canonicalUrl");
    // Description stays website-sourced (Places has no description field) --
    // proves googlePlaceData never blanket-overrides fields it has no real
    // data for.
    assert.ok(result.brand.description.includes("MedRoute actually does"));
    assert.equal(result.provenance.description, "WEBSITE");

    // Google Places-only, and Google itself has no website on file -- must
    // still populate name/location/industry/whatsapp honestly from real
    // data, and must never fabricate a website.
    const placeDataNoWebsite = { ...placeData, websiteUri: null };
    const placeOnly = synthesizeOnboardingBusinessIntelligence({ googlePlaceData: placeDataNoWebsite });
    assert.equal(placeOnly.business.name, "MedRoute Consultancy");
    // Mapped through the real dropdown's own option list, not Google's raw
    // "Health Consultant" category string -- StepBusiness.tsx's "Type of
    // business" <select> has no such option, so storing the raw string
    // would leave the dropdown rendering as nothing-selected.
    assert.equal(placeOnly.business.industry, "Healthcare & Clinics");
    assert.equal(placeOnly.provenance.industry, "GOOGLE_MAPS");
    assert.equal(placeOnly.business.whatsapp, "098765 43210");
    assert.equal(placeOnly.provenance.whatsapp, "GOOGLE_MAPS");
    assert.equal(placeOnly.business.website, "", "must never fabricate a website when Places has none and no website was crawled");

    console.log("✓ Test 5: real Google Places data correctly outranks website/regex data per-field, never fabricates an absent field");
  }

  console.log("business-intelligence-synthesis.test.ts: ALL PASS");
}

run();
