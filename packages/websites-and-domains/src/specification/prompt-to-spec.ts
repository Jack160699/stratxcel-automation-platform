/**
 * AI Prompt → Structured Website Specification
 *
 * Uses the existing @stratxcel/ai-runtime with the WEBSITE_ENGINEERING task
 * class to transform a natural-language customer prompt into a validated
 * WebsiteSpecification. Uses Gemini structured output for reliable JSON.
 *
 * This module has NO Supabase/database dependency — it takes an already-
 * constructed AIRuntime and returns a pure specification. The caller is
 * responsible for persistence, tenant context, and usage recording.
 */

import type { AIRuntime } from "@stratxcel/ai-runtime";
import type { AIBudgetEnvelope } from "@stratxcel/ai-runtime";
import type { WebsiteSpecification, WebsiteType, VersionedSpecification } from "./schema.ts";
import { coerceAndValidate } from "./validator.ts";

export interface PromptToSpecInput {
  /** The customer's natural-language request. */
  prompt: string;
  /** Tenant ID for AI usage attribution. */
  tenantId: string;
  /** Known business info from onboarding / Brand Brain. */
  knownContext?: {
    businessName?: string;
    industry?: string;
    description?: string;
    contactEmail?: string;
    contactPhone?: string;
    contactAddress?: string;
    targetAudience?: string;
    toneOfVoice?: string;
    brandPillars?: string[];
  };
  /** Explicit website type override. If not provided, AI will infer from prompt. */
  websiteType?: WebsiteType;
  /** AI budget envelope for this operation. */
  budgetEnvelope?: AIBudgetEnvelope;
}

export interface PromptToSpecResult {
  ok: boolean;
  specification?: VersionedSpecification;
  validationErrors?: Array<{ path: string; message: string; code: string }>;
  validationWarnings?: Array<{ path: string; message: string }>;
  /** Safe user-facing error when generation fails. */
  userError?: string;
  /** AI execution metadata. */
  aiMetadata?: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    latencyMs: number;
  };
}

const SYSTEM_PROMPT = `You are a premium website architect for Stratxcel, an AI website creation platform.

Your job is to transform a customer's natural-language request into a structured website specification.

RULES:
1. NEVER fabricate facts the customer didn't provide (phone numbers, email addresses, testimonials, client counts, awards, team members).
2. For any content you cannot derive from the customer's input, use placeholder text wrapped in square brackets: [Add your tagline here]
3. Generate a complete, production-ready specification that covers: brand identity, visual style, all pages with sections, navigation, SEO, contact info, and e-commerce/agent settings if applicable.
4. Choose colors, typography, and layout that match the customer's stated aesthetic or industry best practices.
5. The homepage MUST have slug "" (empty string).
6. Every page MUST have SEO metadata (title, metaDescription).
7. Use appropriate section types for each page.
8. The specification MUST be valid JSON matching the WebsiteSpecification schema.

WEBSITE TYPES:
- LANDING_PAGE: 1 premium conversion-focused page
- BUSINESS_WEBSITE: 4-7 page company website (default)
- ECOMMERCE: Products, collections, cart, checkout
- SERVICE_BUSINESS: Lead generation, booking/contact flows
- AI_BUSINESS: Website + embedded AI business agent

COLOR GUIDELINES:
- Use curated, harmonious color palettes with hex codes
- Avoid generic primary colors (pure #ff0000, #0000ff)
- Ensure sufficient contrast between text and background
- Match the brand personality and industry conventions

TYPOGRAPHY GUIDELINES:
- Recommend specific Google Fonts (e.g., "Inter", "Playfair Display", "DM Sans")
- Match typography to the brand's personality and target audience
- Specify both heading and body fonts`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    version: { type: "string", enum: ["1.0"] },
    websiteType: { type: "string", enum: ["LANDING_PAGE", "BUSINESS_WEBSITE", "ECOMMERCE", "SERVICE_BUSINESS", "AI_BUSINESS"] },
    brand: {
      type: "object",
      properties: {
        businessName: { type: "string" },
        tagline: { type: "string" },
        industry: { type: "string" },
        businessType: { type: "string" },
        targetAudience: { type: "string" },
        brandPersonality: { type: "array", items: { type: "string" } },
        uniqueSellingPoints: { type: "array", items: { type: "string" } },
      },
      required: ["businessName", "industry", "businessType", "targetAudience", "brandPersonality", "uniqueSellingPoints"],
    },
    visualStyle: {
      type: "object",
      properties: {
        aesthetic: { type: "string" },
        colorPalette: {
          type: "object",
          properties: {
            primary: { type: "string" }, secondary: { type: "string" },
            accent: { type: "string" }, background: { type: "string" },
            surface: { type: "string" }, text: { type: "string" }, textMuted: { type: "string" },
          },
          required: ["primary", "secondary", "accent", "background", "surface", "text", "textMuted"],
        },
        typography: {
          type: "object",
          properties: {
            headingFont: { type: "string" }, bodyFont: { type: "string" }, style: { type: "string" },
          },
          required: ["headingFont", "bodyFont", "style"],
        },
        spacing: { type: "string", enum: ["compact", "comfortable", "spacious"] },
        borderRadius: { type: "string", enum: ["none", "subtle", "rounded", "pill"] },
        imageStyle: { type: "string" },
      },
      required: ["aesthetic", "colorPalette", "typography", "spacing", "borderRadius", "imageStyle"],
    },
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          slug: { type: "string" },
          isHomepage: { type: "boolean" },
          seo: {
            type: "object",
            properties: {
              title: { type: "string" }, metaDescription: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
            },
            required: ["title", "metaDescription"],
          },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                heading: { type: "string" },
                subheading: { type: "string" },
                content: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" }, description: { type: "string" },
                      icon: { type: "string" }, image: { type: "string" },
                      price: { type: "string" }, link: { type: "string" },
                    },
                    required: ["title", "description"],
                  },
                },
                ctaText: { type: "string" }, ctaLink: { type: "string" },
                layout: { type: "string" }, columns: { type: "integer" },
                backgroundStyle: { type: "string" },
              },
              required: ["type", "heading"],
            },
          },
        },
        required: ["id", "title", "slug", "seo", "sections"],
      },
    },
    navigation: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, slug: { type: "string" } },
        required: ["label", "slug"],
      },
    },
    ecommerce: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        productCategories: { type: "array", items: { type: "string" } },
        estimatedProductCount: { type: "integer" },
        hasVariants: { type: "boolean" },
        requiresInventoryTracking: { type: "boolean" },
        shippingRequired: { type: "boolean" },
        paymentProviders: { type: "array", items: { type: "string" } },
        currency: { type: "string" },
      },
      required: ["enabled", "currency"],
    },
    agent: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        name: { type: "string" },
        capabilities: { type: "array", items: { type: "string" } },
        tone: { type: "string" },
        greetingMessage: { type: "string" },
      },
      required: ["enabled"],
    },
    seo: {
      type: "object",
      properties: {
        generateSitemap: { type: "boolean" },
        generateRobotsTxt: { type: "boolean" },
        enableOpenGraph: { type: "boolean" },
        enableTwitterCards: { type: "boolean" },
        primaryKeywords: { type: "array", items: { type: "string" } },
      },
      required: ["generateSitemap", "generateRobotsTxt", "enableOpenGraph", "enableTwitterCards"],
    },
    contact: {
      type: "object",
      properties: {
        email: { type: "string" }, phone: { type: "string" },
        address: { type: "string" }, showContactForm: { type: "boolean" },
        showMap: { type: "boolean" },
        socialLinks: { type: "object" },
      },
      required: ["showContactForm", "showMap"],
    },
    domain: {
      type: "object",
      properties: {
        requested: { type: "string" },
        alternatives: { type: "array", items: { type: "string" } },
      },
    },
    generatedAt: { type: "string" },
  },
  required: ["version", "websiteType", "brand", "visualStyle", "pages", "navigation", "ecommerce", "agent", "seo", "contact", "domain", "generatedAt"],
};

export async function generateSpecFromPrompt(
  runtime: AIRuntime,
  input: PromptToSpecInput,
): Promise<PromptToSpecResult> {
  const userMessage = buildUserMessage(input);

  try {
    const result = await runtime.execute({
      tenantId: input.tenantId,
      taskClass: "WEBSITE_ENGINEERING",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      structuredOutputSchema: OUTPUT_SCHEMA,
      budgetEnvelope: input.budgetEnvelope,
      timeoutMs: 60_000,
      metadata: {
        operation: "prompt_to_spec",
        websiteType: input.websiteType ?? "auto",
      },
    });

    if (!result.ok) {
      return {
        ok: false,
        userError: result.userSafeError ?? "Website specification generation failed. Please try again.",
        aiMetadata: {
          provider: result.provider ?? "unknown",
          model: result.model ?? "unknown",
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostUsd: result.estimatedCostUsd,
          latencyMs: result.latencyMs,
        },
      };
    }

    // Parse structured output
    let rawSpec: unknown;
    if (result.structuredOutput) {
      rawSpec = result.structuredOutput;
    } else {
      // Fallback: try to parse from text
      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        rawSpec = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        rawSpec = null;
      }
    }

    if (!rawSpec) {
      return {
        ok: false,
        userError: "AI generated a response but it could not be parsed as a valid specification. Please try again.",
        aiMetadata: {
          provider: result.provider ?? "unknown",
          model: result.model ?? "unknown",
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostUsd: result.estimatedCostUsd,
          latencyMs: result.latencyMs,
        },
      };
    }

    // Validate and coerce
    const { spec, result: validation } = coerceAndValidate(rawSpec);

    const aiMetadata = {
      provider: result.provider ?? "unknown",
      model: result.model ?? "unknown",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd: result.estimatedCostUsd,
      latencyMs: result.latencyMs,
    };

    if (!spec) {
      return {
        ok: false,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        userError: "The generated specification did not pass validation. Please try again with more details.",
        aiMetadata,
      };
    }

    return {
      ok: true,
      specification: {
        specVersion: "1.0",
        specification: spec,
        generationMetadata: {
          originalPrompt: input.prompt,
          aiProvider: aiMetadata.provider,
          aiModel: aiMetadata.model,
          inputTokens: aiMetadata.inputTokens,
          outputTokens: aiMetadata.outputTokens,
          estimatedCostUsd: aiMetadata.estimatedCostUsd,
          generatedAt: new Date().toISOString(),
        },
      },
      validationWarnings: validation.warnings,
      aiMetadata,
    };
  } catch (err) {
    return {
      ok: false,
      userError: err instanceof Error ? err.message : "Website specification generation failed unexpectedly.",
    };
  }
}

function buildUserMessage(input: PromptToSpecInput): string {
  const parts: string[] = [
    `Customer request: "${input.prompt}"`,
  ];

  if (input.websiteType) {
    parts.push(`\nRequested website type: ${input.websiteType}`);
  }

  if (input.knownContext) {
    const ctx = input.knownContext;
    parts.push("\n--- Known business context (from onboarding) ---");
    if (ctx.businessName) parts.push(`Business name: ${ctx.businessName}`);
    if (ctx.industry) parts.push(`Industry: ${ctx.industry}`);
    if (ctx.description) parts.push(`Description: ${ctx.description}`);
    if (ctx.contactEmail) parts.push(`Email: ${ctx.contactEmail}`);
    if (ctx.contactPhone) parts.push(`Phone: ${ctx.contactPhone}`);
    if (ctx.contactAddress) parts.push(`Address: ${ctx.contactAddress}`);
    if (ctx.targetAudience) parts.push(`Target audience: ${ctx.targetAudience}`);
    if (ctx.toneOfVoice) parts.push(`Tone of voice: ${ctx.toneOfVoice}`);
    if (ctx.brandPillars?.length) parts.push(`Brand pillars: ${ctx.brandPillars.join(", ")}`);
    parts.push("--- end context ---");
  }

  parts.push("\nGenerate a complete WebsiteSpecification JSON object. Remember to use placeholder text [in brackets] for any content you cannot derive from the input.");

  return parts.join("\n");
}
