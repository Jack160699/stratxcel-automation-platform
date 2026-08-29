// Run with: node --experimental-strip-types lib/social/__tests__/mission-g-creative-intelligence.test.ts
import assert from "node:assert/strict";
import { deriveBusinessContentIntelligence } from "../business-intelligence.ts";
import { classifySubNiche } from "../industry-taxonomy.ts";
import { CONTENT_OPPORTUNITY_DEFINITIONS } from "../opportunity-map.ts";
import { buildCampaignStrategy } from "../campaign-strategy-planner.ts";
import { evaluateVisualQuality } from "../visual-quality-score.ts";
import { scoreGeneratedContent } from "../quality-score.ts";
import { buildCreativeBrief, formatCreativeBriefForPrompt } from "../creative-brief.ts";

function testSubNicheClassification() {
  assert.equal(classifySubNiche("restaurant", "Specialty espresso roastery and artisan sourdough bakery"), "restaurant_cafe");
  assert.equal(classifySubNiche("restaurant", "Authentic family thali and tandoor dining"), "restaurant_family");
  assert.equal(classifySubNiche("clinic", "Specialized pediatric and toddler vaccination clinic"), "clinic_general_pediatric");
  assert.equal(classifySubNiche("clinic", "Dental implant and smile aligner clinic"), "clinic_dental");
  assert.equal(classifySubNiche("clinic", "Medical dermatology and PRP hair loss treatment"), "clinic_dermatology");
  assert.equal(classifySubNiche("gym", "CrossFit box, Olympic lifting, and functional WODs"), "gym_crossfit_hiit");
  assert.equal(classifySubNiche("gym", "Reformer Pilates and mindful mobility yoga studio"), "gym_yoga_pilates");
  assert.equal(classifySubNiche("retail", "Handloom pure silk sarees and designer boutique"), "retail_fashion_boutique");
  assert.equal(classifySubNiche("local_service", "Emergency plumbing, leak detection, and AC servicing"), "service_plumbing_hvac");
  console.log("mission-g-creative-intelligence.test.ts: sub-niche classification — PASS");
}

function testAudiencePsychologyExtraction() {
  const intel = deriveBusinessContentIntelligence({
    businessName: "Indiranagar Dental Lounge",
    industryText: "Dental Clinic",
    descriptionText: "State-of-the-art painless dental implants, clear aligners, and cosmetic smile makeovers in Indiranagar, Bangalore.",
    verifiedFacts: [
      "Location: 100ft Road, Indiranagar, Bangalore",
      "Service: Clear Aligners & Digital 3D Scanning",
      "Service: Painless Dental Implants",
      "Target audience: Working professionals and families in East Bangalore seeking gentle dentistry",
    ],
    brandTone: ["gentle", "authoritative", "transparent"],
  });

  assert.equal(intel.businessName, "Indiranagar Dental Lounge");
  assert.ok(intel.offerings.length >= 2, "must extract at least 2 offerings");
  assert.ok(intel.primaryAudience.primaryWorries.length >= 2, "must extract audience worries");
  assert.ok(intel.primaryAudience.trustTriggers.length >= 2, "must extract trust triggers");
  assert.equal(intel.localMarket.location, "100ft Road, Indiranagar, Bangalore");
  assert.ok(intel.brandVoice.blockedPhrases.includes("AI-powered"));
  assert.ok(intel.brandVoice.blockedPhrases.includes("grow your business"));
  console.log("mission-g-creative-intelligence.test.ts: audience psychology extraction — PASS");
}

function testContentOpportunityMapAndBlueprint() {
  const keys = Object.keys(CONTENT_OPPORTUNITY_DEFINITIONS);
  assert.ok(keys.length >= 20, "must define at least 20 opportunity categories");
  assert.ok(keys.includes("CUSTOMER_PAIN_POINT"));
  assert.ok(keys.includes("COMMON_MISCONCEPTION"));
  assert.ok(keys.includes("PURCHASE_OBJECTION"));
  assert.ok(keys.includes("BEHIND_THE_SCENES"));
  assert.ok(keys.includes("PROOF_OUTCOME"));
  assert.ok(keys.includes("MISTAKE_LESSON"));
  assert.ok(keys.includes("EXPERT_TIP"));
  assert.ok(keys.includes("PROCESS_TRANSPARENCY"));

  const intel = deriveBusinessContentIntelligence({
    businessName: "Coastal Spice Haven",
    industryText: "Regional Seafood Restaurant",
    descriptionText: "Traditional coastal Mangalorean and Chettinad seafood with freshly ground stone spices.",
    verifiedFacts: [
      "Location: Koramangala, Bangalore",
      "Offering: Ghee Roast Crab & Neer Dosa",
      "Offering: Stone-ground Coastal Fish Curry",
      "Fact: All spices roasted fresh every morning in brass pans",
    ],
  });

  const plan = buildCampaignStrategy({
    businessIntel: intel,
    availablePillars: ["Heritage Recipes", "Ingredient Purity", "Kitchen Craft", "Local Community"],
    daysCount: 28,
  });

  assert.equal(plan.days.length, 28, "must plan exactly 28 days");
  const uniqueAngles = new Set(plan.days.map((d) => `${d.topic}__${d.uniqueAngle}`));
  assert.equal(uniqueAngles.size, 28, "every single day must have a distinct angle");

  for (const day of plan.days) {
    assert.ok(day.customerProblem.length > 5);
    assert.ok(day.researchInsight.length > 10);
    assert.ok(day.hookStrategy.length > 10);
    assert.ok(day.ctaStrategy.length > 10);
  }
  console.log("mission-g-creative-intelligence.test.ts: 28-day campaign strategy blueprint — PASS");
}

function testHardAntiTemplateQualityGate() {
  const buzzwordResult = scoreGeneratedContent({
    caption: "We offer an AI-powered end-to-end dental solution to grow your business! Book today.",
    title: "AI-Powered Dental Care",
    hashtags: ["Dental", "Bangalore"],
    businessName: "Indiranagar Dental Lounge",
    contentPillar: "Quality Care",
    concept: "dental tech",
    industry: "clinic",
    objective: "LEADS",
    verifiedFacts: ["Location: Indiranagar"],
  });
  assert.equal(buzzwordResult.passed, false);
  assert.ok(buzzwordResult.hardFailures.some((f) => f.reason === "GENERIC_COPY"));

  const genericResult = scoreGeneratedContent({
    caption: "Experience excellence with our premium team today! We make your dreams come true. Contact us!",
    title: "Experience Excellence",
    hashtags: ["Excellence", "Premium"],
    businessName: "Indiranagar Dental Lounge",
    contentPillar: "Quality Care",
    concept: "quality",
    industry: "clinic",
    objective: "LEADS",
    verifiedFacts: ["Location: Indiranagar"],
  });
  assert.equal(genericResult.passed, false);
  assert.ok(genericResult.hardFailures.some((f) => f.reason === "LOW_BUSINESS_SPECIFICITY" || f.reason === "GENERIC_COPY"));

  const specificResult = scoreGeneratedContent({
    caption: "Bleeding when you brush isn't just surface irritation — it's the earliest sign of gum inflammation. At Indiranagar Dental Lounge, our digital 3D intraoral scan pinpoints enamel and gum health in minutes without any painful poking. Schedule your gentle check-up at our 100ft Road clinic this week.",
    title: "Why Bleeding Gums Aren't Normal",
    hashtags: ["IndiranagarDental", "BangaloreDentist", "PainlessDentistry"],
    businessName: "Indiranagar Dental Lounge",
    contentPillar: "Preventative Education",
    concept: "dental hygiene myth",
    industry: "clinic",
    objective: "LEADS",
    verifiedFacts: [
      "Location: 100ft Road, Indiranagar",
      "Service: Digital 3D Scanning",
    ],
  });
  assert.equal(specificResult.hardFailures.length, 0);
  assert.equal(specificResult.passed, true);
  assert.ok(specificResult.score >= 88);
  console.log("mission-g-creative-intelligence.test.ts: hard anti-template quality gate — PASS");
}

function testVisualQualityScoring() {
  const posterFail = evaluateVisualQuality({
    caption: "Delicious artisan sourdough baked fresh daily.",
    concept: "sourdough crust",
    businessName: "Crust & Crumb",
    industry: "restaurant_bakery",
    visualCategory: "close_up_detail",
    onImageTextLength: 120,
    hasMassiveLowerThird: true,
  });
  assert.equal(posterFail.passed, false);
  assert.ok(posterFail.hardFailures.some((f) => f.reason === "TEXT_OVERLOAD_POSTER_STYLE"));

  const mismatchFail = evaluateVisualQuality({
    caption: "Taste the slow-cooked Mangalorean crab curry with fresh neer dosa.",
    concept: "signature dish",
    businessName: "Coastal Spice",
    industry: "restaurant",
    visualCategory: "product_photography",
    imagePromptBrief: "corporate businessman holding phone in office lobby",
  });
  assert.equal(mismatchFail.passed, false);
  assert.ok(mismatchFail.hardFailures.some((f) => f.reason === "CONTENT_VISUAL_MISMATCH"));

  const cleanPass = evaluateVisualQuality({
    caption: "Steam rising off a freshly tempered curry pot.",
    concept: "fresh cooking",
    businessName: "Coastal Spice",
    industry: "restaurant",
    visualCategory: "close_up_detail",
    onImageTextLength: 18,
    hasMassiveLowerThird: false,
    imagePromptBrief: "Close-up 45-degree angle food photography of steaming Mangalorean curry in an authentic brass vessel, fresh curry leaves on top, warm natural lighting, shallow depth of field",
  });
  assert.equal(cleanPass.passed, true);
  assert.ok(cleanPass.score >= 85);
  console.log("mission-g-creative-intelligence.test.ts: visual quality evaluation — PASS");
}

function testEndToEndFixtures() {
  const FIXTURES = [
    {
      name: "Fixture A: Artisanal Café & Bakery",
      businessName: "Roast & Crumb Café",
      industry: "Artisanal Coffee & Bakery",
      desc: "Single-origin pour-overs, cold brews, and 24-hour wild ferment sourdough in Koramangala.",
      facts: ["Location: 5th Block, Koramangala, Bangalore", "Offering: Single-origin Ethiopian pour-overs", "Offering: 24h Wild Ferment Sourdough"],
    },
    {
      name: "Fixture B: Dental & Smile Makeover Clinic",
      businessName: "Aura Dental Suite",
      industry: "Dental & Orthodontic Clinic",
      desc: "Pain-free digital dentistry, clear aligners, and teeth whitening in Indiranagar.",
      facts: ["Location: Indiranagar, Bangalore", "Offering: Pain-free Clear Aligners", "Offering: Digital 3D Smile Scanning"],
    },
    {
      name: "Fixture C: CrossFit & Functional Gym",
      businessName: "IronPeak Functional Box",
      industry: "CrossFit & Functional Fitness Gym",
      desc: "High-intensity functional fitness, Olympic lifting, and beginner On-Ramp classes.",
      facts: ["Location: HSR Layout, Bangalore", "Offering: Beginner 3-week On-Ramp", "Offering: Olympic Lifting Workshops"],
    },
    {
      name: "Fixture D: Handloom Fashion Boutique",
      businessName: "Virasat Handlooms",
      industry: "Designer Handloom Apparel",
      desc: "Authentic mulberry silk sarees, hand-block printed kurtas, and festive capsule wardrobes.",
      facts: ["Location: Jayanagar, Bangalore", "Offering: Pure Mulberry Silk Sarees", "Offering: Hand-block Printed Kurtas"],
    },
    {
      name: "Fixture E: HVAC & Electrical Home Services",
      businessName: "Apex Climate Care",
      industry: "HVAC & Home Electrical Services",
      desc: "Certified AC servicing, leakage repair, and pre-monsoon waterproofing with 90-day warranty.",
      facts: ["Location: Whitefield, Bangalore", "Offering: Jet-Pump AC Deep Clean", "Offering: 90-day Service Guarantee"],
    },
  ];

  for (const fixture of FIXTURES) {
    const intel = deriveBusinessContentIntelligence({
      businessName: fixture.businessName,
      industryText: fixture.industry,
      descriptionText: fixture.desc,
      verifiedFacts: fixture.facts,
    });

    const plan = buildCampaignStrategy({
      businessIntel: intel,
      availablePillars: ["Expertise", "Craft", "Customer Outcomes", "Behind The Scenes"],
      daysCount: 28,
    });

    assert.equal(plan.days.length, 28);
    const day1 = plan.days[0];
    const brief = buildCreativeBrief({
      businessName: fixture.businessName,
      industryText: fixture.industry,
      descriptionText: fixture.desc,
      platform: "instagram",
      mediaType: "image",
      availablePillars: ["Expertise", "Craft", "Customer Outcomes", "Behind The Scenes"],
      objective: day1.objective,
      verifiedFacts: fixture.facts,
      plannedStrategy: day1,
    });

    const prompt = formatCreativeBriefForPrompt(brief);
    assert.ok(prompt.includes(fixture.businessName));
    assert.ok(prompt.includes(day1.uniqueAngle));
    assert.ok(prompt.includes("HARD ANTI-TEMPLATE RULE"));
  }
  console.log("mission-g-creative-intelligence.test.ts: end-to-end Fixtures A-E — PASS");
}

function run() {
  testSubNicheClassification();
  testAudiencePsychologyExtraction();
  testContentOpportunityMapAndBlueprint();
  testHardAntiTemplateQualityGate();
  testVisualQualityScoring();
  testEndToEndFixtures();
  console.log("mission-g-creative-intelligence.test.ts: ALL PASS");
}

run();
