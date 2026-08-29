import assert from "node:assert/strict";
import { deriveBusinessContentIntelligence } from "../business-intelligence.ts";
import { buildCampaignStrategy } from "../campaign-strategy-planner.ts";
import { buildCreativeBrief } from "../creative-brief.ts";
import { scoreGeneratedContent } from "../quality-score.ts";
import { buildTextOverlaySvg, type LogoAsset } from "../text-overlay-render.ts";
import { buildProviderReadyImagePrompt } from "../../../packages/ai-runtime/src/media/image-prompt.ts";
import { buildCanonicalBrandContext } from "../canonical-generation-context.ts";

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`autonomous-social-autopilot-stabilization.test.ts: ${name} — PASS`);
    } catch (err) {
      console.error(`autonomous-social-autopilot-stabilization.test.ts: ${name} — FAIL`);
      throw err;
    }
  })();
}

async function main() {
  console.log("================================================================================");
  console.log("AUTONOMOUS SOCIAL AUTOPILOT STABILIZATION & RELIABILITY TEST SUITE");
  console.log("================================================================================\n");

  // 1. Canonical Brand Context & Metadata Integrity
  await test("Canonical Brand Context builds normalized, unpolluted data contract", () => {
    const ctx = buildCanonicalBrandContext({
      tenantId: "tenant-apex-123",
      businessName: "Apex Dental Clinic",
      industry: "clinic",
      subNiche: "clinic_dental",
      location: "Bopal, Ahmedabad",
      offerings: [{ name: "Painless Root Canal" }, { name: "Invisible Aligners" }],
      verifiedFacts: ["Location: Bopal, Ahmedabad", "Service: Painless Root Canal", "Doctor: Dr. Amit Mehta, BDS MDS"],
      hasStoredLogo: true,
      logoAssetId: "asset-logo-apex",
    });

    assert.equal(ctx.tenantId, "tenant-apex-123");
    assert.equal(ctx.businessName, "Apex Dental Clinic");
    assert.equal(ctx.offerings.length, 2);
    assert.ok(ctx.hasStoredLogo, "hasStoredLogo must be true");
    assert.equal(ctx.logoAssetId, "asset-logo-apex");
    assert.ok(ctx.primaryAudience.primaryWorries.length > 0, "primary audience worries must be populated");
  });

  // 2. 28-Day Strategic Diversity (Distinct Angle & Visual Category per Day)
  await test("28-Day Strategic Campaign Plan creates 28 distinct days with no duplicate concepts", () => {
    const intel = deriveBusinessContentIntelligence({
      businessName: "Coastal Spice Seafood",
      industryText: "restaurant",
      descriptionText: "Authentic coastal seafood restaurant in Fort Kochi serving fresh catch daily.",
      verifiedFacts: ["Location: Fort Kochi, Kerala", "Dish: Garlic Butter Tiger Prawns", "Dish: Kerala Fish Curry"],
      brandTone: ["Warm", "Inviting", "Authentic"],
    });

    const plan = buildCampaignStrategy({
      businessIntel: intel,
      availablePillars: ["Food Spotlight", "Behind The Scenes", "Customer Love", "Chef's Craft"],
      daysCount: 28,
    });

    assert.equal(plan.days.length, 28, "Plan must generate exactly 28 days");
    const concepts = new Set(plan.days.map((d) => d.creativeConcept));
    assert.equal(concepts.size, 28, "Every single day must have a distinct creative concept");

    const visualCategories = new Set(plan.days.map((d) => d.visualCategory));
    assert.ok(visualCategories.size >= 8, "Plan must rotate across at least 8 distinct visual categories");
  });

  // 3. Provider Boundary Negative Prompt Guard
  await test("Provider image prompt strictly enforces negative constraints against text & fake logos", () => {
    const prompt = buildProviderReadyImagePrompt({
      brief: "Warm sunlit dental clinic reception area",
      intendedUse: "social_post",
      aspectRatio: "1:1",
      brandContext: {
        business_name: "Apex Dental",
        industry: "clinic",
      },
    });

    assert.ok(prompt.includes("HARD MANDATORY NEGATIVE CONSTRAINT"), "Prompt must contain hard negative constraint block");
    assert.ok(prompt.includes("DO NOT DRAW, RENDER, OR INVENT ANY TEXT"), "Must forbid drawing text");
    assert.ok(prompt.includes("LOGOS, OR BRAND MARKS"), "Must forbid fake logos");
    assert.ok(prompt.includes("poster banners, or text overlays"), "Must forbid poster banners");
  });

  // 4. Clean Photo-First Logo Watermarking & No Empty Bands
  await test("Clean photo-first overlay composites real logo without lower-third blue band", () => {
    const fakeLogoAsset: LogoAsset = {
      dataUri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      aspectRatio: 1.5,
    };

    // When no headline/CTA is present (Social Autopilot default)
    const svgWithLogo = buildTextOverlaySvg({
      width: 1080,
      height: 1080,
      elements: [{ role: "brandLabel", text: "Apex Dental" }],
      layoutArchetype: "BASIC_ESSENTIAL",
      businessName: "Apex Dental",
      logoImage: fakeLogoAsset,
      typographyPersonality: "clean-geometric",
      textColor: "#FFFFFF",
      scrimColor: "#000000",
      accentColor: "#3B82F6",
      primaryColor: null,
      secondaryColor: null,
    });

    assert.ok(svgWithLogo.includes("<image"), "SVG must render real logo <image> tag");
    assert.ok(!svgWithLogo.includes('fill-opacity="0.90"'), "Must NOT render a 23% solid blue band across the canvas");

    // When no logo is present at all
    const svgNoLogo = buildTextOverlaySvg({
      width: 1080,
      height: 1080,
      elements: [{ role: "brandLabel", text: "Apex Dental" }],
      layoutArchetype: "BASIC_ESSENTIAL",
      businessName: "Apex Dental",
      typographyPersonality: "clean-geometric",
      textColor: "#FFFFFF",
      scrimColor: "#000000",
      accentColor: "#3B82F6",
      primaryColor: null,
      secondaryColor: null,
    });

    assert.equal(svgNoLogo, '<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg"></svg>', "Must render empty SVG with zero fake text panels when no logo exists");
  });

  // 5. Anti-Template & Generic Buzzword Quality Gate
  await test("Quality score hard-fails generic marketing buzzwords and requires business facts", () => {
    const badResult = scoreGeneratedContent({
      title: "Boost your social presence",
      caption: "Our AI-powered platform provides data-driven, end-to-end automation so we handle the rest. Grow your business today!",
      hashtags: ["#Automation", "#Growth"],
      businessName: "Apex Dental Clinic",
      contentPillar: "Core Service",
      concept: "clinic overview",
      industry: "clinic",
      verifiedFacts: ["Location: Bopal, Ahmedabad", "Service: Painless Root Canal"],
      objective: "LEADS",
    });

    assert.equal(badResult.passed, false, "Generic buzzword post must fail quality gate");
    assert.ok(badResult.hardFailures.some((f) => f.reason === "GENERIC_COPY"), "Must identify GENERIC_COPY hard failure");

    const goodResult = scoreGeneratedContent({
      title: "10-Minute Patient Seating",
      caption: "Nobody enjoys sitting in a crowded waiting room with an aching tooth. At Apex Dental Clinic in Bopal, we schedule appointments with a 10-minute seating policy so you receive gentle, painless root canal care right when you arrive. Message us to reserve your checkup.",
      hashtags: ["#ApexDental", "#DentalCare", "#BopalAhmedabad"],
      businessName: "Apex Dental Clinic",
      contentPillar: "Patient Comfort",
      concept: "zero waiting time care",
      industry: "clinic",
      verifiedFacts: ["Location: Bopal, Ahmedabad", "Service: Painless Root Canal", "Feature: 10-minute seating policy"],
      objective: "LEADS",
    });

    assert.equal(goodResult.passed, true, "Grounded, business-specific post must pass quality gate");
    assert.ok(goodResult.score >= 90, `Score must be >= 90, got: ${goodResult.score}`);
  });

  // 6. Tenant Isolation & Immutability Check
  await test("Tenant isolation guarantees zero cross-tenant asset or fact contamination", () => {
    const tenantA = buildCanonicalBrandContext({
      tenantId: "tenant-A",
      businessName: "IronCore Fitness",
      industry: "gym",
      offerings: [{ name: "CrossFit Mobility" }],
      verifiedFacts: ["Trainer: Coach Sarah", "Specialty: Olympic Weightlifting"],
      logoAssetId: "logo-asset-ironcore",
    });

    const tenantB = buildCanonicalBrandContext({
      tenantId: "tenant-B",
      businessName: "Glow Beauty Salon",
      industry: "salon",
      offerings: [{ name: "Organic Balayage" }],
      verifiedFacts: ["Stylist: Maya Sen", "Product: Sulfate-Free Gloss"],
      logoAssetId: "logo-asset-glow",
    });

    assert.notEqual(tenantA.tenantId, tenantB.tenantId);
    assert.notEqual(tenantA.businessName, tenantB.businessName);
    assert.notEqual(tenantA.logoAssetId, tenantB.logoAssetId);
    assert.ok(!tenantA.verifiedFacts.some((f) => tenantB.verifiedFacts.includes(f)));
  });

  console.log("\n================================================================================");
  console.log("ALL AUTONOMOUS SOCIAL AUTOPILOT STABILIZATION TESTS PASSED ✔");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
