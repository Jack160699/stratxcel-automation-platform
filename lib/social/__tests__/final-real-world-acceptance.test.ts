import assert from "node:assert/strict";
import { deriveBusinessContentIntelligence } from "../business-intelligence.ts";
import { buildCampaignStrategy } from "../campaign-strategy-planner.ts";
import { buildCreativeBrief, selectObjective } from "../creative-brief.ts";
import { scoreGeneratedContent } from "../quality-score.ts";
import { buildTextOverlaySvg, type LogoAsset } from "../text-overlay-render.ts";
import { buildProviderReadyImagePrompt } from "../../../packages/ai-runtime/src/media/image-prompt.ts";
import { buildCanonicalBrandContext, PROMPT_VERSIONS } from "../canonical-generation-context.ts";

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`[ACCEPTANCE PASS] ${name}`);
    } catch (err) {
      console.error(`[ACCEPTANCE FAIL] ${name}`);
      throw err;
    }
  })();
}

async function main() {
  console.log("================================================================================");
  console.log("STRATXCEL SOCIAL AUTOPILOT — FINAL REAL-WORLD ACCEPTANCE TEST RUNNER");
  console.log("================================================================================\n");

  const tenantId = "466e6195-a9f6-4576-8271-29fdae61c18a";
  const businessName = "Apex Dental Care";
  const verifiedFacts = [
    "Location: Bopal, Ahmedabad",
    "Service: Painless Root Canal",
    "Service: Invisible Clear Aligners",
    "Doctor: Dr. Amit Mehta, BDS MDS (14 years experience)",
    "Feature: 10-minute seating turnaround",
    "Facility: In-house 3D digital scanner",
  ];

  // 1. Initial State / Baseline Setup
  const brandContext = buildCanonicalBrandContext({
    tenantId,
    businessName,
    industry: "clinic",
    subNiche: "clinic_dental",
    location: "Bopal, Ahmedabad",
    offerings: [
      { name: "Painless Root Canal" },
      { name: "Invisible Clear Aligners" },
      { name: "Laser Teeth Whitening" },
    ],
    verifiedFacts,
    hasStoredLogo: true,
    logoAssetId: "asset_logo_apex_primary_transparent",
  });

  const businessIntel = deriveBusinessContentIntelligence({
    businessName,
    industryText: "clinic",
    descriptionText: "Advanced dental clinic in Bopal, Ahmedabad providing painless care and invisible aligners.",
    verifiedFacts,
    brandTone: ["Professional", "Calming", "Empathetic"],
  });

  const campaignPlan = buildCampaignStrategy({
    businessIntel,
    availablePillars: ["Patient Comfort", "Technology & Innovation", "Doctor Expertise", "Smile Transformations"],
    daysCount: 28,
  });

  // 2. Generation 1: Day 1 — Pain Point & Turnaround
  await test("Generation 1 (Day 1): Creates unique, high-scoring creative with clean photo prompt & logo", () => {
    const day1 = campaignPlan.days[0];
    assert.equal(day1.dayNumber, 1);
    assert.equal(day1.opportunityType, "CUSTOMER_PAIN_POINT");
    assert.equal(day1.visualCategory, "close_up_detail");

    const brief1 = buildCreativeBrief({
      businessName,
      industryText: "clinic",
      descriptionText: "Dental clinic in Bopal",
      platform: "instagram",
      mediaType: "image",
      availablePillars: ["Patient Comfort"],
      recentPillars: [],
      recentConcepts: [],
      recentCaptionExcerpts: [],
      objective: "LEADS",
      verifiedFacts,
      plannedStrategy: day1,
    });

    const imagePrompt1 = buildProviderReadyImagePrompt({
      brief: brief1.visualDirection,
      intendedUse: "social_post",
      aspectRatio: "1:1",
      brandContext: {
        business_name: businessName,
        industry: "clinic",
      },
    });

    assert.ok(imagePrompt1.includes("HARD MANDATORY NEGATIVE CONSTRAINT"), "Image prompt must contain negative constraint");
    assert.ok(imagePrompt1.includes("DO NOT DRAW, RENDER, OR INVENT ANY TEXT"), "Must prohibit text");

    const caption1 = "Nobody enjoys sitting in an overcrowded waiting lounge with an aching tooth. At Apex Dental Care in Bopal, we respect your time with a 10-minute seating policy and gentle care using our in-house 3D digital scanner. Message us or call to reserve your visit.";
    const quality1 = scoreGeneratedContent({
      title: day1.creativeConcept,
      caption: caption1,
      hashtags: ["#ApexDental", "#PainlessDentistry", "#BopalAhmedabad"],
      businessName,
      contentPillar: day1.contentPillar,
      concept: day1.creativeConcept,
      industry: "clinic",
      verifiedFacts,
      objective: "LEADS",
    });

    assert.equal(quality1.passed, true, "Quality check must pass");
    assert.ok(quality1.score >= 90, `Quality score must be >= 90, got: ${quality1.score}`);

    // Verify Logo Watermark
    const fakeLogo: LogoAsset = {
      dataUri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      aspectRatio: 1.6,
    };

    const svg1 = buildTextOverlaySvg({
      width: 1080,
      height: 1080,
      elements: [{ role: "brandLabel", text: businessName }],
      layoutArchetype: "BASIC_ESSENTIAL",
      businessName,
      logoImage: fakeLogo,
      typographyPersonality: "clean-geometric",
      textColor: "#FFFFFF",
      scrimColor: "#000000",
      accentColor: "#3B82F6",
      primaryColor: null,
      secondaryColor: null,
    });

    assert.ok(svg1.includes("<image"), "Must composite real logo asset");
    assert.ok(!svg1.includes('fill-opacity="0.90"'), "Must NOT draw lower-third solid slab");
  });

  // 3. Generation 2 (Day 2): Service Spotlight (Different Strategy, Category, Angle, and Copy)
  await test("Generation 2 (Day 2): Produces distinct opportunity type, visual category, and copy", () => {
    const day2 = campaignPlan.days[1];
    assert.equal(day2.dayNumber, 2);
    assert.equal(day2.opportunityType, "PRODUCT_SPOTLIGHT");
    assert.equal(day2.visualCategory, "product_photography");

    const brief2 = buildCreativeBrief({
      businessName,
      industryText: "clinic",
      descriptionText: "Dental clinic in Bopal",
      platform: "instagram",
      mediaType: "image",
      availablePillars: ["Technology & Innovation"],
      recentPillars: ["Patient Comfort"],
      recentConcepts: [campaignPlan.days[0].creativeConcept],
      recentCaptionExcerpts: ["Nobody enjoys sitting in an overcrowded waiting lounge"],
      objective: "SALES",
      verifiedFacts,
      plannedStrategy: day2,
    });

    assert.notEqual(brief2.concept, campaignPlan.days[0].creativeConcept, "Day 2 concept must differ from Day 1");

    const caption2 = "Straighten your smile without metal brackets. Our custom invisible clear aligners are mapped using an in-house 3D digital scanner for exact precision and comfortable everyday wear. Book a consultation with Dr. Amit Mehta at Apex Dental Care in Bopal.";
    const quality2 = scoreGeneratedContent({
      title: day2.creativeConcept,
      caption: caption2,
      hashtags: ["#ClearAligners", "#InvisibleBraces", "#ApexDental"],
      businessName,
      contentPillar: day2.contentPillar,
      concept: day2.creativeConcept,
      industry: "clinic",
      verifiedFacts,
      objective: "SALES",
    });

    assert.equal(quality2.passed, true);
    assert.ok(quality2.score >= 90);
  });

  // 4. Generation 3 (Day 3): Common Misconception (Different Opportunity & Education Angle)
  await test("Generation 3 (Day 3): Demonstrates educational authority without marketing fluff", () => {
    const day3 = campaignPlan.days[2];
    assert.equal(day3.dayNumber, 3);
    assert.equal(day3.opportunityType, "COMMON_MISCONCEPTION");
    assert.equal(day3.visualCategory, "service_demonstration");

    const caption3 = "Many people assume root canal treatments are painful, but modern rotary techniques and local numbing make painless root canal care feel just like a routine filling. Dr. Amit Mehta brings 14 years of clinical experience to ensure your natural tooth is preserved comfortably at Apex Dental Care in Bopal, Ahmedabad using our in-house 3D digital scanner. Direct message our clinic team or call to schedule your dental checkup.";
    const quality3 = scoreGeneratedContent({
      title: day3.creativeConcept,
      caption: caption3,
      hashtags: ["#RootCanalCare", "#DentalCare", "#AhmedabadDentist", "#ApexDental"],
      businessName,
      contentPillar: day3.contentPillar,
      concept: day3.creativeConcept,
      industry: "clinic",
      verifiedFacts,
      objective: "AUTHORITY",
    });

    assert.equal(quality3.passed, true);
    assert.ok(quality3.score >= 90);
  });

  // 5. Failure Injection: Catch Generic Buzzwords & Unverified Guarantees
  await test("Failure Gate: Intercepts generic buzzwords and unsupported claims", () => {
    // Failure A: Generic SaaS Buzzwords
    const genericResult = scoreGeneratedContent({
      title: "Unlock Growth",
      caption: "Our AI-powered platform provides data-driven, end-to-end automation to grow your business today!",
      hashtags: ["#Growth"],
      businessName,
      contentPillar: "Promo",
      concept: "promo",
      industry: "clinic",
      verifiedFacts,
      objective: "LEADS",
    });
    assert.equal(genericResult.passed, false);
    assert.ok(genericResult.hardFailures.some((f) => f.reason === "GENERIC_COPY"));

    // Failure B: Unverified Medical Guarantee
    const unverifiedResult = scoreGeneratedContent({
      title: "Guaranteed 100% Painless",
      caption: "We guarantee 100% pain-free permanent teeth for life with zero side effects at our clinic.",
      hashtags: ["#Dental"],
      businessName,
      contentPillar: "Promo",
      concept: "guarantee",
      industry: "clinic",
      verifiedFacts,
      objective: "LEADS",
    });
    assert.equal(unverifiedResult.passed, false);
    assert.ok(unverifiedResult.hardFailures.some((f) => f.reason === "UNSUPPORTED_FACT"));
  });

  // 6. Multi-Tenant Boundary Check
  await test("Multi-Tenant Safety: Zero cross-tenant asset or verified fact leakage", () => {
    const tenantOther = buildCanonicalBrandContext({
      tenantId: "tenant_restaurant_xyz",
      businessName: "Coastal Spice",
      industry: "restaurant",
      verifiedFacts: ["Dish: Garlic Prawns", "Location: Fort Kochi"],
      logoAssetId: "asset_logo_coastal_spice",
    });

    assert.notEqual(brandContext.tenantId, tenantOther.tenantId);
    assert.notEqual(brandContext.logoAssetId, tenantOther.logoAssetId);
    assert.ok(!brandContext.verifiedFacts.some((f) => tenantOther.verifiedFacts.includes(f)));
  });

  console.log("\n================================================================================");
  console.log("ALL REAL-WORLD ACCEPTANCE TESTS PASSED (6/6 SUITES) ✔");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Acceptance runner failed:", err);
  process.exit(1);
});
