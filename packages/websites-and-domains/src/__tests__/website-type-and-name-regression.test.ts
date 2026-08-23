/**
 * Regression suite for a P1 chain of bugs found live during E2E testing on
 * 2026-08-23: building a website for a real (non-ecommerce) StratXcel tenant
 * through the Smart Website Builder produced a clothing e-commerce store
 * ("local businesses | Premium Online Store", fabricated "Loved by Over
 * 50,000 Customers" testimonial, ₹24,999 blazers) for a business that sells
 * no physical products at all.
 *
 * Root causes, each fixed and covered here:
 *
 * 1. normalizer.ts's inferred-business-name regex used [A-Z] to require a
 *    capitalized proper noun, but paired it with the /i flag -- which also
 *    makes [A-Z] match lowercase letters, defeating the check. A brief like
 *    "...platform for local businesses in India" matched "for " + capture,
 *    yielding the literal phrase "local businesses" as the business name.
 *
 * 2. brief-builder.ts hardcoded features.aiShoppingAssistant to always be
 *    true, so master-prompt.ts always emitted the line "AI Business &
 *    Shopping Concierge grounded on public product data" into every compiled
 *    prompt, regardless of business type.
 *
 * 3. generation/engine.ts's website-type classifier did a raw
 *    prompt.includes("shop") scan over the *entire* compiled prompt -- which
 *    (because of #2) always contained the word "Shopping" -- so every single
 *    request matched ECOMMERCE, even when a websiteType had already been
 *    resolved upstream from the customer's own confirmed answers.
 *
 * 4. creator-flow.ts's generateWebsite() never forwarded the brief's already-
 *    resolved websiteType to the engine, so #3's classifier always ran.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomerInput } from "../brief/normalizer.ts";
import { buildStructuredWebsiteBrief } from "../brief/brief-builder.ts";
import { compileMasterWebsitePrompt } from "../brief/master-prompt.ts";
import { websiteGenerationEngine } from "../generation/engine.ts";

describe("Website-type & business-name misdetection regression", () => {
  it("does not infer an ordinary lowercase phrase as the business name", () => {
    const signals = normalizeCustomerInput(
      "StratXcel is an AI growth platform for local businesses in India. We want a premium landing page."
    );
    assert.notEqual(
      signals.inferredBusinessName,
      "local businesses",
      "must not treat the lowercase descriptive phrase as a brand name"
    );
  });

  it("still infers a genuine capitalized business name from the same sentence shape", () => {
    const signals = normalizeCustomerInput("A premium website for Stratxcel in India, please.");
    assert.equal(signals.inferredBusinessName, "Stratxcel");
  });

  it("only claims an AI shopping assistant for businesses that actually sell products", () => {
    const nonEcommerceBrief = buildStructuredWebsiteBrief({
      tenantId: "t1",
      signals: normalizeCustomerInput("StratXcel is an AI growth platform for local businesses in India."),
      answers: [{ questionId: "q_category", selectedOptionId: "Professional Services" }],
    });
    assert.equal(nonEcommerceBrief.websiteType.value, "BUSINESS_WEBSITE");
    assert.equal(
      nonEcommerceBrief.features.aiShoppingAssistant,
      false,
      "a services business must not be promised a product-catalog shopping concierge it doesn't have"
    );

    const prompt = compileMasterWebsitePrompt(nonEcommerceBrief);
    assert.doesNotMatch(
      prompt,
      /shopping concierge/i,
      "compiled prompt must not claim a shopping concierge for a non-ecommerce business"
    );
  });

  it("engine trusts an explicitly-resolved websiteType over its own prompt keyword scan", async () => {
    // Even a prompt containing "shopping" (as it always used to, from the
    // always-on feature line) must not force ECOMMERCE when the caller has
    // already resolved -- and is explicitly passing -- the real type.
    const result = await websiteGenerationEngine.generate({
      tenantId: "t1",
      prompt: "[BUSINESS CONTEXT]\nWebsite Type: BUSINESS_WEBSITE\n\nAI Business & Shopping Concierge grounded on public product data",
      websiteType: "BUSINESS_WEBSITE",
      brandContext: { businessName: "Stratxcel" },
    });

    assert.ok(result.success, result.error ?? "generation failed");
    assert.equal(result.specification.specification.websiteType, "BUSINESS_WEBSITE");
    assert.equal(result.siteModel.pages.length, 3, "BUSINESS_WEBSITE template has 3 pages, not ECOMMERCE's 5");
  });

  it("engine's fallback scan uses word boundaries so 'shopping' doesn't collide with 'shop'", async () => {
    const result = await websiteGenerationEngine.generate({
      tenantId: "t1",
      // No websiteType passed -- forces the fallback keyword scan.
      prompt: "AI Business & Shopping Concierge grounded on public product data for a consulting agency",
      brandContext: { businessName: "Stratxcel" },
    });

    assert.ok(result.success, result.error ?? "generation failed");
    assert.notEqual(
      result.specification.specification.websiteType,
      "ECOMMERCE",
      "'Shopping' must not be misread as the word 'shop' by the fallback classifier"
    );
  });

  it("end-to-end: a SaaS business brief resolves to a non-ecommerce site, not a clothing store", async () => {
    const signals = normalizeCustomerInput(
      "StratXcel is an AI growth platform for local businesses in India. We want a premium landing page that explains audits, AI content creation, and automated publishing, and drives visitors to book a free audit via WhatsApp."
    );
    const brief = buildStructuredWebsiteBrief({
      tenantId: "t1",
      signals,
      answers: [
        { questionId: "q_category", selectedOptionId: "Professional Services" },
        { questionId: "q_audience", selectedOptionId: "B2B_BUSINESSES" },
      ],
      connectorContext: { brandBrain: { businessName: "Stratxcel", industry: "SaaS & Technology" } },
    });

    assert.equal(brief.businessName.value, "Stratxcel", "must use the real connected business name, not a regex guess");

    const masterPrompt = compileMasterWebsitePrompt(brief);
    const generated = await websiteGenerationEngine.generate({
      tenantId: "t1",
      prompt: masterPrompt,
      websiteType: brief.websiteType.value,
      brandContext: { businessName: brief.businessName.value, businessCategory: brief.businessCategory.value },
    });

    assert.ok(generated.success, generated.error ?? "generation failed");
    assert.notEqual(generated.siteModel.websiteType, "ECOMMERCE");
    assert.equal(generated.siteModel.name, "Stratxcel");
    assert.doesNotMatch(
      JSON.stringify(generated.siteModel.pages),
      /Signature Tailored Blazer|Premium Online Store/i,
      "must not receive the unrelated clothing-store template"
    );
  });
});
