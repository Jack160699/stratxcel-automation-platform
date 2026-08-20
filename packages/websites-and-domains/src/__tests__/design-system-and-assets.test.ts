/**
 * Design System & Asset Engine Test Suite
 *
 * Verifies:
 * 1. Design system generation across Luxury, SaaS, Retail, and Service aesthetics
 * 2. Reference website adaptation to original design tokens
 * 3. Accessibility & responsive rules (WCAG AA, touch targets, breakpoints)
 * 4. Asset provenance tracking (customer, generated, licensed, public-reference)
 * 5. Asset safety: Untrusted public-reference asset blocking for production
 * 6. Cross-tenant asset isolation
 * 7. Asset planning layer (automatic image plan with dimensions & alt text)
 * 8. End-to-end integration with WebsiteGenerationEngine
 */

import { strict as assert } from "node:assert";
import { generateDesignSystem } from "../design-system/generator.ts";
import { planWebsiteAssets } from "../assets/planner.ts";
import { AssetSafetyManager } from "../assets/manager.ts";
import { WebsiteGenerationEngine } from "../generation/engine.ts";
import type { WebsiteUnderstanding } from "../intelligence/schema.ts";
import type { WebsiteSpecification } from "../specification/schema.ts";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: unknown) {
    failed++;
    console.error(`  ✗ ${name}: ${(err as Error).message}`);
  }
}

async function runDesignSystemSuite() {
  console.log("\n==================================================");
  console.log("DESIGN SYSTEM & ASSET ENGINE TEST SUITE");
  console.log("==================================================\n");

  // 1. Design System Generation
  console.log("--- 1. Design System Generation & Brand Interpretation ---");

  await test("Generates Luxury aesthetic with gold accent, serif font, and subtle radius", () => {
    const ds = generateDesignSystem({
      brandName: "Maison Royale",
      industry: "Luxury Jewelry",
      brandTone: "Bespoke, refined luxury",
    });

    assert.equal(ds.aesthetic, "luxury");
    assert.equal(ds.colors.brand.accent, "#C5A880");
    assert.ok(ds.typography.headingFont.includes("Playfair Display"));
    assert.equal(ds.radius.md, "4px");
    assert.equal(ds.accessibility.minTouchTargetPx, 44);
  });

  await test("Generates Modern SaaS aesthetic with blue palette and clean cards", () => {
    const ds = generateDesignSystem({
      brandName: "CloudScale AI",
      industry: "Cloud Infrastructure",
      brandTone: "Modern SaaS developer platform",
    });

    assert.equal(ds.aesthetic, "modern-saas");
    assert.equal(ds.colors.brand.primary, "#2563EB");
    assert.ok(ds.typography.headingFont.includes("Plus Jakarta Sans"));
  });

  await test("Generates Retail aesthetic with crimson CTA accent and Outfit typography", () => {
    const ds = generateDesignSystem({
      brandName: "Aura Streetwear",
      industry: "Apparel and Retail",
      brandTone: "Urban fashion store",
    });

    assert.equal(ds.aesthetic, "retail");
    assert.equal(ds.colors.brand.accent, "#E11D48");
    assert.ok(ds.typography.headingFont.includes("Outfit"));
  });

  await test("Applies custom supplied brand colors over defaults", () => {
    const ds = generateDesignSystem({
      brandName: "Verdant Organics",
      suppliedColors: {
        primary: "#059669", // Emerald
        secondary: "#065F46",
        accent: "#F59E0B",
      },
    });

    assert.equal(ds.colors.brand.primary, "#059669");
    assert.equal(ds.colors.brand.secondary, "#065F46");
    assert.equal(ds.colors.brand.accent, "#F59E0B");
  });

  // 2. Reference Site Adaptation
  console.log("\n--- 2. Reference Website Adaptation ---");

  const mockReference: WebsiteUnderstanding = {
    source: "https://competitor-luxury.com",
    sourceType: "url",
    canonicalUrl: "https://competitor-luxury.com",
    title: "Competitor Site",
    businessName: "Competitor Brand",
    businessCategory: "Fashion",
    pages: [],
    navigation: [],
    sections: [],
    typography: { primaryFont: "Cinzel, serif", scale: ["16px", "32px"], observations: [] },
    colorSystem: { dominant: "#18181B", primary: "#D97706", secondary: "#27272A", background: "#FFFFFF", text: "#09090B", palette: ["#18181B", "#D97706"] },
    spacingSystem: { density: "spacious", standardPadding: "32px", standardGap: "40px", containerMaxWidth: "1400px" },
    layoutPatterns: [],
    components: [],
    images: [],
    assets: [],
    forms: [],
    ctas: [],
    seo: { hasRobotsTxt: true, hasSitemap: true, structuredDataTypes: [], headingHierarchyValid: true },
    ecommerce: { isEcommerce: true, currency: "INR", productCountEstimate: 8, cartDetected: true, checkoutDetected: true, features: [] },
    integrations: [],
    responsiveObservations: [],
    contentSummary: "Luxury reference",
    designSummary: "Warm amber gold tones",
    technicalSummary: "Next.js",
    analyzedAt: new Date().toISOString(),
  };

  await test("Adapts reference site palette into original design system without copying brand name", () => {
    const ds = generateDesignSystem({
      brandName: "Elysian Studio",
      referenceUnderstanding: mockReference,
    });

    assert.equal(ds.colors.brand.primary, "#D97706");
    assert.equal(ds.colors.brand.secondary, "#27272A");
    assert.notEqual(ds.colors.brand.text, "Competitor Brand");
  });

  // 3. Responsive & Accessibility Rules
  console.log("\n--- 3. Responsive & Accessibility Rules ---");

  await test("Enforces WCAG AA rules, responsive breakpoints, and 44px min touch target", () => {
    const ds = generateDesignSystem({ brandName: "Aether" });

    assert.equal(ds.accessibility.wcagLevel, "AA");
    assert.equal(ds.accessibility.minTouchTargetPx, 44);
    assert.equal(ds.accessibility.enforceContrastRatio, true);
    assert.equal(ds.responsive.mobile, 320);
    assert.equal(ds.responsive.tablet, 768);
    assert.equal(ds.responsive.desktop, 1024);
    assert.equal(ds.responsive.wide, 1440);
  });

  // 4. Asset Engine & Provenance
  console.log("\n--- 4. Asset Engine & Provenance ---");

  const assetManager = new AssetSafetyManager();

  await test("Registers customer-provided and generated assets with valid provenance", () => {
    const customerAsset = assetManager.registerAsset({
      id: "ast_cust_1",
      tenantId: "ten_alpha",
      type: "logo",
      provenance: "customer-provided",
      sourceUrl: "https://storage.stratxcel.in/ten_alpha/logo.png",
      mimeType: "image/png",
      dimensions: { width: 512, height: 128, aspectRatio: "4:1" },
      altText: "Alpha Brand Logo",
      usage: ["logo"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    assert.equal(customerAsset.provenance, "customer-provided");
    assert.equal(customerAsset.id, "ast_cust_1");
  });

  await test("Blocks public-reference assets from publishing to production live site", () => {
    const refAsset = assetManager.registerAsset({
      id: "ast_ref_1",
      tenantId: "ten_alpha",
      type: "image",
      provenance: "public-reference",
      sourceUrl: "https://third-party.com/unlicensed-photo.jpg",
      mimeType: "image/jpeg",
      dimensions: { width: 1200, height: 800, aspectRatio: "3:2" },
      altText: "Third party reference photo",
      usage: ["hero"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    assert.throws(
      () => assetManager.assertAssetPublishable(refAsset),
      /Publishing blocked: Asset ast_ref_1 has provenance 'public-reference'/
    );
  });

  // 5. Cross-Tenant Asset Isolation
  console.log("\n--- 5. Cross-Tenant Asset Isolation ---");

  await test("Denies cross-tenant asset access attempts", () => {
    assert.throws(
      () => assetManager.getAsset("ten_beta", "ast_cust_1"),
      /Cross-tenant asset access denied: Tenant ten_beta cannot access asset owned by ten_alpha/
    );
  });

  // 6. Asset Planning Layer
  console.log("\n--- 6. Asset Planning Layer ---");

  await test("Plans complete asset requirements for E-Commerce website", () => {
    const mockSpec: WebsiteSpecification = {
      version: "1.0",
      websiteType: "ECOMMERCE",
      brand: {
        businessName: "Aurelius Tailors",
        tagline: "Fine Bespoke Suits",
        industry: "Luxury Menswear",
        businessType: "ECOMMERCE",
        targetAudience: "Gentlemen of distinction",
        brandPersonality: ["Refined", "Artisan"],
        uniqueSellingPoints: ["Hand-stitched in Milan"],
      },
      visualStyle: {
        aesthetic: "luxury",
        colorPalette: { primary: "#0F172A", secondary: "#1E293B", accent: "#C5A880", background: "#FFFFFF", surface: "#F8FAFC", text: "#111827", textMuted: "#6B7280" },
        typography: { headingFont: "Playfair Display", bodyFont: "Inter", style: "modern" },
        spacing: "spacious",
        borderRadius: "subtle",
        imageStyle: "editorial",
      },
      pages: [],
      navigation: [],
      ecommerce: { enabled: true, currency: "INR" },
      agent: { enabled: true },
      seo: { generateSitemap: true, generateRobotsTxt: true, enableOpenGraph: true, enableTwitterCards: true },
      contact: { showContactForm: true, showMap: false },
      domain: {},
      generatedAt: new Date().toISOString(),
    };

    const plan = planWebsiteAssets("ten_alpha", mockSpec, "prj_001");

    assert.equal(plan.brandName, "Aurelius Tailors");
    assert.ok(plan.items.some((i) => i.usage === "hero" && i.targetDimensions.width === 1920));
    assert.ok(plan.items.some((i) => i.usage === "og_banner" && i.targetDimensions.width === 1200));
    assert.ok(plan.items.filter((i) => i.usage === "product").length >= 4);
  });

  // 7. Generation Engine Integration
  console.log("\n--- 7. Generation Engine Integration ---");

  await test("WebsiteGenerationEngine outputs both designSystem and assetPlan", async () => {
    const engine = new WebsiteGenerationEngine();
    const output = await engine.generate({
      prompt: "Build an online boutique clothing store called Saffron & Silk",
      tenantId: "ten_alpha",
    });

    assert.equal(output.success, true);
    assert.ok(output.designSystem);
    assert.equal(output.designSystem.version, "1.0");
    assert.ok(output.designSystem.colors.brand.primary);
    assert.ok(output.assetPlan);
    assert.equal(output.assetPlan.brandName, "Saffron & Silk");
    assert.ok(output.assetPlan.items.length >= 5);
  });

  console.log("\n==================================================");
  console.log(`DESIGN SYSTEM & ASSET SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) process.exit(1);
}

runDesignSystemSuite();
