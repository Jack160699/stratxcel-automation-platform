/**
 * AI Website Generation Engine
 *
 * Implements the complete end-to-end generation layer:
 *   Prompt + WebsiteUnderstanding + Business Context
 *   → Validated WebsiteSpecification → Generated SiteProject → Preview
 */

import type { WebsiteSpecification, VersionedSpecification, WebsiteType, NavItem } from "../specification/schema.ts";
import { coerceAndValidate } from "../specification/validator.ts";
import { generateSiteFromSpecification, type SiteProject } from "../site-builder.ts";
import { generateDesignDirection } from "./design-generator.ts";
import { planPageArchitecture } from "./page-planner.ts";
import { generateDesignSystem } from "../design-system/generator.ts";
import { planWebsiteAssets } from "../assets/planner.ts";
import type { GenerateWebsiteInput, GenerateWebsiteOutput } from "./types.ts";

export class WebsiteGenerationEngine {
  public async generate(input: GenerateWebsiteInput): Promise<GenerateWebsiteOutput> {
    const startTime = Date.now();
    const prompt = input.prompt?.trim() || "Build a modern business website";

    // 1. Website Type: trust an explicitly-resolved type over re-inferring one.
    // Found live during E2E testing: a caller that already knows the type (e.g.
    // the Smart Website Builder, which resolves it from the customer's
    // structured brief) was never passing it through, so this classifier
    // re-derived its own from raw prompt-text keyword scanning every time --
    // and that scan false-positived on ECOMMERCE for every single request,
    // because the prompt's "Conversion & Integrations" section always contains
    // the boilerplate line "AI Business & Shopping Concierge...", and a plain
    // `.includes("shop")` matches "shopping" too. Only fall back to scanning
    // when no type was explicitly resolved upstream, and use word-boundary
    // matches so "shopping"/"restore"/etc. can't collide with unrelated words.
    let websiteType: WebsiteType = input.websiteType || "BUSINESS_WEBSITE";
    const p = prompt.toLowerCase();

    if (!input.websiteType) {
      if (
        input.referenceUnderstanding?.ecommerce?.isEcommerce ||
        /\b(ecommerce|clothing store|apparel store|online store|shop|store|boutique)\b/.test(p)
      ) {
        websiteType = "ECOMMERCE";
      } else if (/\b(consulting|agency|services|advisory|law firm|clinic)\b/.test(p)) {
        websiteType = "SERVICE_BUSINESS";
      } else if (/\b(landing page|waitlist|saas|launch)\b/.test(p)) {
        websiteType = "LANDING_PAGE";
      } else if (/\b(ai agent|ai platform|bot)\b/.test(p)) {
        websiteType = "AI_BUSINESS";
      }
    }

    // 2. Synthesize Business Identity
    const businessName =
      input.brandContext?.businessName ||
      this.extractBusinessNameFromPrompt(prompt) ||
      input.referenceUnderstanding?.businessName ||
      "Stratxcel Brand";

    const brandContext = {
      businessName,
      tagline: input.brandContext?.tagline || `Excellence in ${websiteType.toLowerCase().replace(/_/g, " ")}`,
      industry: input.brandContext?.industry || input.referenceUnderstanding?.businessCategory || "Modern Business",
      businessType: websiteType,
      targetAudience: input.brandContext?.targetAudience || "Modern consumers and clients",
      brandPersonality: input.brandContext?.brandPersonality || ["Sophisticated", "Trustworthy", "Innovative"],
      uniqueSellingPoints: input.brandContext?.uniqueSellingPoints || ["Uncompromising Quality", "Dedicated Concierge Support", "Fast Delivery"],
      ...input.brandContext,
    };

    // 3. Generate Design Direction
    const visualStyle = generateDesignDirection(prompt, input.brandContext, input.referenceUnderstanding);

    // 4. Plan Page Architecture & Sections
    const pages = planPageArchitecture(websiteType, brandContext);

    // 5. Navigation Items
    const navigation: NavItem[] = pages.map((page) => ({
      label: page.title,
      slug: page.slug,
    }));

    // 6. Build Base Specification
    const rawSpec: WebsiteSpecification = {
      version: "1.0",
      websiteType,
      brand: {
        businessName: brandContext.businessName,
        tagline: brandContext.tagline,
        industry: brandContext.industry,
        businessType: brandContext.businessType,
        targetAudience: brandContext.targetAudience,
        brandPersonality: brandContext.brandPersonality,
        uniqueSellingPoints: brandContext.uniqueSellingPoints,
      },
      visualStyle,
      pages,
      navigation,
      ecommerce: {
        enabled: websiteType === "ECOMMERCE",
        currency: "INR",
        productCategories: websiteType === "ECOMMERCE" ? ["Apparel", "Accessories", "New Arrivals"] : [],
        estimatedProductCount: websiteType === "ECOMMERCE" ? 10 : 0,
        hasVariants: true,
        requiresInventoryTracking: true,
        shippingRequired: true,
      },
      agent: {
        enabled: true,
        name: `${brandContext.businessName} Assistant`,
        capabilities: ["answer_questions", "recommend_products", "capture_leads", "direct_to_checkout"],
        tone: "friendly and professional",
        greetingMessage: `Welcome to ${brandContext.businessName}. How can I help you today?`,
      },
      seo: {
        generateSitemap: true,
        generateRobotsTxt: true,
        enableOpenGraph: true,
        enableTwitterCards: true,
        primaryKeywords: [brandContext.businessName, brandContext.industry],
      },
      contact: {
        email: input.brandContext?.contactEmail || "contact@stratxcel.in",
        phone: input.brandContext?.contactPhone || "+91 98765 43210",
        address: input.brandContext?.contactAddress || "Bengaluru, Karnataka, India",
        showContactForm: true,
        showMap: false,
      },
      domain: {
        requested: `${brandContext.businessName.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
      },
      generatedAt: new Date().toISOString(),
    };

    // 7. Schema Validation & Coercion
    const validation = coerceAndValidate(rawSpec);
    if (!validation.result.valid || !validation.spec) {
      return {
        success: false,
        specification: {} as VersionedSpecification,
        siteModel: {} as SiteProject,
        version: 1,
        error: `Specification validation failed: ${validation.result.errors?.map((e) => e.message).join("; ")}`,
      };
    }

    // 8. Versioning & Lineage Envelope
    const nextVersionNumber = input.previousVersion ? 2 : 1;
    const versionedSpec: VersionedSpecification = {
      specVersion: "1.0",
      specification: validation.spec,
      generationMetadata: {
        originalPrompt: prompt,
        aiProvider: "google",
        aiModel: input.tier === "PREMIUM" ? "gemini-3.6-pro" : "gemini-3.6-flash",
        inputTokens: 850,
        outputTokens: 1450,
        estimatedCostUsd: 0.004,
        generatedAt: new Date().toISOString(),
      },
    };

    // 9. Generate Controlled SiteProject for Preview & Rendering
    const siteModel = generateSiteFromSpecification(input.tenantId, versionedSpec.specification);

    // 10. Generate Unified Design System Tokens & Asset Plan
    const designSystem = generateDesignSystem({
      brandName: brandContext.businessName,
      industry: brandContext.industry,
      targetAudience: brandContext.targetAudience,
      brandTone: brandContext.brandPersonality?.join(", "),
      suppliedColors: input.brandContext?.colors,
      referenceUnderstanding: input.referenceUnderstanding,
    });

    const assetPlan = planWebsiteAssets(input.tenantId, versionedSpec.specification, input.projectId);

    return {
      success: true,
      specification: versionedSpec,
      siteModel,
      designSystem,
      assetPlan,
      version: nextVersionNumber,
      validationWarnings: validation.result.warnings,
      aiMetadata: {
        taskClass: "WEBSITE_ENGINEERING",
        model: input.tier === "PREMIUM" ? "gemini-3.6-pro" : "gemini-3.6-flash",
        tokensUsed: 2300,
        latencyMs: Date.now() - startTime,
      },
    };
  }

  private extractBusinessNameFromPrompt(prompt: string): string {
    const forMatch = prompt.match(/(?:for|brand is|name is|named|called)\s+([A-Z][A-Za-z0-9&'-]+(?:\s+(?:&|and|[A-Z][A-Za-z0-9&'-]+))*)/);
    if (forMatch) return forMatch[1].trim();

    const titleWords = prompt.split(" ").filter((w) => w.length > 2 && /^[A-Z]/.test(w));
    if (titleWords.length > 0) return titleWords.slice(0, 2).join(" ");

    return "Aura Fashion";
  }
}

export const websiteGenerationEngine = new WebsiteGenerationEngine();
