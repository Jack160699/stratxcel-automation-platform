/**
 * Creative Treatment (Premium Creative Intelligence brief Sections 2, 7,
 * 8): the real creative-intelligence step this system was missing. Today's
 * CreativeBrief (creative-brief.ts) is deliberately deterministic --
 * industry classification, pillar/concept ROTATION from a fixed label
 * pool ("dish spotlight", "training tip"). That's real diversity
 * bookkeeping, but it is NOT a creative idea: "training tip" is a
 * category, not "turn the after-work energy crash into a recognizable
 * 20-minute mobility ritual."
 *
 * This module is the layer that turns a category label + real business
 * facts + brand visual DNA + industry visual vocabulary into an actual,
 * business-specific creative insight -- via a real structured-output AI
 * call, not another template pool. The image-prompt builder
 * (visual-director-prompt.ts) and the copy-generation prompt both consume
 * this treatment instead of working from a single free-text brief string.
 *
 * The AI call can fail or return a malformed/generic treatment -- this
 * module validates structurally and NEVER silently substitutes a
 * templated fallback for a failed real generation; callers see the
 * failure and can retry, exactly like generation-loop.ts's text retry
 * pattern.
 */

import type { AITextProviderAdapter, AIMessage } from "@stratxcel/ai-runtime";
import type { CreativeBrief } from "./creative-brief.ts";
import type { IndustryCategory } from "./industry-taxonomy.ts";
import type { BrandVisualDNA } from "./brand-visual-dna.ts";
import { summarizeBrandVisualDNA } from "./brand-visual-dna.ts";
import type { IndustryVisualVocabulary } from "./industry-visual-vocabulary.ts";
import { summarizeIndustryVisualVocabulary } from "./industry-visual-vocabulary.ts";
import type { OnImageTextElement } from "./text-density.ts";
import { findPlaceholderOrFiller } from "./placeholder-detection.ts";

export interface CreativeTreatmentInput {
  brief: CreativeBrief;
  businessName: string;
  industry: IndustryCategory;
  brandDNA: BrandVisualDNA;
  visualVocab: IndustryVisualVocabulary;
  mediaType: "image" | "carousel" | "reel" | "video";
  /** Distilled findings from the visual research library -- real, sourced
   * qualitative patterns, never fabricated performance numbers. Optional:
   * a treatment must still be generatable with zero research grounding. */
  researchInsights?: string[];
}

export interface CtaDecision {
  needed: boolean;
  text: string | null;
  rationale: string;
}

/**
 * Final Production Loop brief Section "STEP 1": the deterministic overlay
 * used to have exactly one layout (bottom scrim band + top-right brand
 * chip) regardless of the creative -- functional, but reads as "a stock
 * photo with a video subtitle," not a designed marketing banner. Each
 * archetype is a genuinely different composition strategy the renderer
 * (text-overlay-render.ts) implements distinctly, and the visual-director
 * prompt (visual-director-prompt.ts) reserves different negative space in
 * the base photo for each:
 *  - SPLIT_BANNER: ~70% photo / ~30% solid or textured brand-colored
 *    block carrying text + contact info. Best for promos/offers where the
 *    business genuinely wants a strong branded block.
 *  - FLOATING_CARD: a padded, offset card in one corner, leaving the
 *    photo's subject fully unobstructed elsewhere -- best when the
 *    photograph itself is the whole story (a face, a dish, a product).
 *  - EDITORIAL_FRAME: a thin outer frame/border with a top-center brand
 *    lockup and minimal, highly structured text -- the most restrained,
 *    magazine-like option.
 * The treatment model picks one per creative based on the concept, the
 * same way an art director would choose a layout for a specific shoot,
 * not a fixed default.
 */
export type LayoutArchetype = "SPLIT_BANNER" | "FLOATING_CARD" | "EDITORIAL_FRAME";

export interface CreativeTreatment {
  concept: string;
  hook: string;
  audienceTension: string;
  story: string;
  visualIdea: string;
  subject: string;
  composition: string;
  camera: string;
  lighting: string;
  environment: string;
  colorDirection: string;
  typographyDirection: string;
  brandApplication: string;
  textHierarchy: OnImageTextElement[];
  cta: CtaDecision;
  format: string;
  whyStopScroll: string;
  whyThisBusiness: string;
  negativeConstraints: string[];
  intentionallyTextLed: boolean;
  layoutArchetype: LayoutArchetype;
}

/** Exported so callers that make their own provider.complete() call
 * (rather than going through generateCreativeTreatment below -- e.g. a
 * harness script layering its own retry/pacing wrapper around the same
 * call) can still pass the real schema. A treatment call without this
 * schema is NOT a validation-safe fallback -- without it Gemini has no
 * enforced JSON shape and the response reliably fails
 * validateCreativeTreatment's structural checks. */
export const TREATMENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    concept: { type: "string" },
    hook: { type: "string" },
    audienceTension: { type: "string" },
    story: { type: "string" },
    visualIdea: { type: "string" },
    subject: { type: "string" },
    composition: { type: "string" },
    camera: { type: "string" },
    lighting: { type: "string" },
    environment: { type: "string" },
    colorDirection: { type: "string" },
    typographyDirection: { type: "string" },
    brandApplication: { type: "string" },
    textHierarchy: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string", enum: ["headline", "supportingLine", "cta", "brandLabel", "other"] },
          text: { type: "string" },
        },
        required: ["role", "text"],
      },
    },
    cta: {
      type: "object",
      properties: {
        needed: { type: "boolean" },
        text: { type: "string", nullable: true },
        rationale: { type: "string" },
      },
      required: ["needed", "rationale"],
    },
    whyStopScroll: { type: "string" },
    whyThisBusiness: { type: "string" },
    negativeConstraints: { type: "array", items: { type: "string" } },
    intentionallyTextLed: { type: "boolean" },
    layoutArchetype: { type: "string", enum: ["SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME"] },
  },
  required: [
    "concept", "hook", "audienceTension", "story", "visualIdea", "subject", "composition",
    "camera", "lighting", "environment", "colorDirection", "typographyDirection",
    "brandApplication", "textHierarchy", "cta", "whyStopScroll", "whyThisBusiness",
    "negativeConstraints", "intentionallyTextLed", "layoutArchetype",
  ],
} as const;

export function buildCreativeTreatmentPrompt(input: CreativeTreatmentInput): AIMessage[] {
  const system = [
    `You are the creative director and visual art director for a premium social-media agency.`,
    `A senior team already decided the strategy for this post -- do not re-derive it. Your job is to turn it into ONE real, specific creative idea and a full visual treatment, the way an agency would brief a photographer before a shoot.`,
    `The final creative must feel business-specific, visually rich, simple, premium, intentional, modern, and clearly NOT generic AI output. Default philosophy: IMAGE/VISUAL IDEA FIRST, message second, supporting text third, brand/CTA last -- never a paragraph of text decorated with a picture.`,
    `Prefer real visual storytelling (photography of the actual business/product/service in use) over text-based graphics. A creative with no on-image text at all is a valid, often stronger, choice -- do not force a headline or CTA onto every creative. Default to ONE primary idea; at most one short supporting line; a CTA only when it genuinely helps.`,
    `You must also choose a LAYOUT ARCHETYPE -- the actual graphic-design composition, not just what the text says: SPLIT_BANNER (roughly 70% photo / 30% solid or textured brand-colored block carrying the text and any contact info -- pick this for offers/promos or when the business genuinely wants a strong, unmissable branded block), FLOATING_CARD (a padded card offset into one corner, leaving the photograph's subject completely unobstructed everywhere else -- pick this when the photo itself IS the story, e.g. a face, a dish, a product), or EDITORIAL_FRAME (a thin outer frame with a top-center brand lockup and minimal, highly structured text -- pick this for the most restrained, magazine-like result). Choose deliberately based on THIS concept, the way an art director picks a layout for a specific shoot -- do not default to the same archetype every time.`,
    `Never invent a business fact not present in the verified facts given to you. Creative persuasion must never become fabricated business information.`,
    `Never write generic AI marketing filler ("Elevate your experience", "Discover the magic", "Unleash your potential", and phrases like them) -- every word must be specific to this concept and this business. Premium design also comes from knowing what NOT to include: if a supporting line or CTA doesn't earn its place, omit it.`,
    `Respond with ONLY the JSON object matching the given schema -- no prose, no markdown fences.`,
  ].join(" ");

  const user = [
    `BUSINESS: ${input.businessName} (${input.industry.replace(/_/g, " ")})`,
    `MEDIA TYPE: ${input.mediaType}`,
    ``,
    `STRATEGY ALREADY DECIDED (do not re-derive):`,
    `- Objective: ${input.brief.objective}`,
    `- Audience: ${input.brief.audience}`,
    `- Content pillar: ${input.brief.contentPillar}`,
    `- Concept angle to develop into a real idea: ${input.brief.concept}`,
    `- CTA style if a CTA is used: ${input.brief.cta}`,
    ``,
    `VERIFIED FACTS (use only what's naturally relevant, never fabricate beyond this list):`,
    input.brief.verifiedFacts.length ? input.brief.verifiedFacts.map((f) => `- ${f}`).join("\n") : "- none available",
    ``,
    `BRAND VISUAL DNA: ${summarizeBrandVisualDNA(input.brandDNA)}`,
    ``,
    `INDUSTRY VISUAL VOCABULARY (starting points, not a rigid template): ${summarizeIndustryVisualVocabulary(input.visualVocab)}`,
    ``,
    input.researchInsights?.length
      ? `CURRENT SOCIAL/CREATIVE RESEARCH INSIGHTS (qualitative patterns, not performance guarantees -- use only what's actually relevant, never claim unproven engagement numbers):\n${input.researchInsights.map((r) => `- ${r}`).join("\n")}`
      : `CURRENT SOCIAL/CREATIVE RESEARCH INSIGHTS: none supplied for this creative.`,
    ``,
    `Develop ONE specific creative concept (a real insight/tension/story, not a restatement of the category label above) and its full visual treatment.`,
    ``,
    // Embedded explicitly, not left to API-level schema enforcement alone:
    // this prompt is also used by callers whose provider interface has no
    // structured-output parameter at all (package-autopilot.ts's live
    // AiRuntimeSocialProvider) -- without this literal shape in the text
    // itself, that path has nothing enforcing the JSON structure and
    // reliably produces unusable output (confirmed empirically: the exact
    // same prompt without this block failed validateCreativeTreatment on
    // every field, every fixture, in this campaign's own pilot run).
    `Respond with ONLY a single JSON object, exactly this shape (every field required, all strings real and specific, never a placeholder):`,
    `{`,
    `  "concept": string (a real specific creative idea, NOT the category label above),`,
    `  "hook": string, "audienceTension": string, "story": string, "visualIdea": string,`,
    `  "subject": string, "composition": string, "camera": string, "lighting": string, "environment": string,`,
    `  "colorDirection": string, "typographyDirection": string, "brandApplication": string,`,
    `  "textHierarchy": [{ "role": "headline"|"supportingLine"|"cta"|"brandLabel"|"other", "text": string }] (0-4 items -- can be empty if the photo alone carries the idea),`,
    `  "cta": { "needed": boolean, "text": string|null, "rationale": string },`,
    `  "whyStopScroll": string, "whyThisBusiness": string,`,
    `  "negativeConstraints": string[],`,
    `  "intentionallyTextLed": boolean,`,
    `  "layoutArchetype": "SPLIT_BANNER"|"FLOATING_CARD"|"EDITORIAL_FRAME"`,
    `}`,
    `No prose before or after the JSON. No markdown code fences.`,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export interface CreativeTreatmentValidationIssue {
  field: string;
  issue: string;
}

/** Deterministic structural + genericness validation. Catches both
 * malformed JSON shape AND the specific failure mode this module exists
 * to prevent: a "treatment" that's really just the category label restated
 * (e.g. concept === brief.concept verbatim, or a field that's suspiciously
 * short/empty) sneaking through as if it were real creative work. */
export function validateCreativeTreatment(
  treatment: unknown,
  context: { concept: string }
): CreativeTreatmentValidationIssue[] {
  const issues: CreativeTreatmentValidationIssue[] = [];
  const t = treatment as Partial<CreativeTreatment> | null | undefined;
  if (!t || typeof t !== "object") {
    return [{ field: "root", issue: "treatment is not an object (structured output failed to parse)" }];
  }

  const requiredStringFields: Array<keyof CreativeTreatment> = [
    "concept", "hook", "audienceTension", "story", "visualIdea", "subject", "composition",
    "camera", "lighting", "environment", "colorDirection", "typographyDirection",
    "brandApplication", "whyStopScroll", "whyThisBusiness",
  ];
  for (const field of requiredStringFields) {
    const value = t[field];
    if (typeof value !== "string" || value.trim().length < 8) {
      issues.push({ field, issue: `missing or too short (needs a real, specific sentence, not a placeholder)` });
      continue;
    }
    const leak = findPlaceholderOrFiller(value);
    if (leak) issues.push({ field, issue: `contains implementation-instruction/placeholder leakage: "${leak}"` });
  }

  if (t.concept && t.concept.trim().toLowerCase() === context.concept.trim().toLowerCase()) {
    issues.push({ field: "concept", issue: `concept is just the category label restated ("${context.concept}") -- needs a real specific idea` });
  }

  if (!Array.isArray(t.textHierarchy)) {
    issues.push({ field: "textHierarchy", issue: "missing or not an array" });
  } else if (t.textHierarchy.length > 4) {
    issues.push({ field: "textHierarchy", issue: `${t.textHierarchy.length} on-image text elements -- too many for one primary idea` });
  } else {
    // Finished Premium Marketing Creative brief Section 2 (hard failure):
    // every textHierarchy entry gets rendered as literal pixels by the
    // deterministic overlay -- an implementation-instruction leak here
    // ("Add text here", "Logo here") would ship straight onto the actual
    // published creative, not just live in a caption a human might edit.
    for (const el of t.textHierarchy) {
      const leak = el?.text ? findPlaceholderOrFiller(el.text) : null;
      if (leak) issues.push({ field: "textHierarchy", issue: `"${el.role}" text contains implementation-instruction/placeholder leakage: "${leak}"` });
    }
  }

  if (!t.cta || typeof t.cta !== "object" || typeof t.cta.needed !== "boolean" || typeof t.cta.rationale !== "string") {
    issues.push({ field: "cta", issue: "missing or malformed CTA decision object" });
  } else if (t.cta.needed && (!t.cta.text || !t.cta.text.trim())) {
    issues.push({ field: "cta", issue: "cta.needed is true but cta.text is empty" });
  } else if (t.cta.text) {
    const leak = findPlaceholderOrFiller(t.cta.text);
    if (leak) issues.push({ field: "cta", issue: `cta.text contains implementation-instruction/placeholder leakage: "${leak}"` });
  }

  if (!Array.isArray(t.negativeConstraints)) {
    issues.push({ field: "negativeConstraints", issue: "missing or not an array" });
  }

  if (typeof t.intentionallyTextLed !== "boolean") {
    issues.push({ field: "intentionallyTextLed", issue: "missing or not a boolean" });
  }

  const validArchetypes: LayoutArchetype[] = ["SPLIT_BANNER", "FLOATING_CARD", "EDITORIAL_FRAME"];
  if (typeof t.layoutArchetype !== "string" || !validArchetypes.includes(t.layoutArchetype as LayoutArchetype)) {
    issues.push({ field: "layoutArchetype", issue: `missing or not one of ${validArchetypes.join(", ")}` });
  }

  return issues;
}

/**
 * The single canonical source of "what on-image text actually needs to
 * render", folding `treatment.cta` into `treatment.textHierarchy` when
 * needed. This exists because of a real, serious bug found during visual
 * inspection: the structured-output model frequently set
 * `cta.needed=true` with a real, specific `cta.text`, WITHOUT also
 * duplicating a `{role:"cta"}` entry into textHierarchy -- and every
 * caller that read `textHierarchy` directly (the image-prompt's text-safe-
 * area reservation, the text-density measurement, and the deterministic
 * overlay compositor itself) silently treated "not in textHierarchy" as
 * "no CTA planned". The result: on 8 of 14 real passing creatives in one
 * benchmark run, a genuinely intended CTA the model clearly wanted never
 * appeared on the actual rendered image at all -- exactly the "beautiful
 * but not fully completed" failure this exists to close. Every consumer
 * of a treatment's on-image text (visual-director-prompt.ts,
 * text-overlay-render.ts callers, text-density.ts measurement) must use
 * this function, never `treatment.textHierarchy` directly.
 */
export function resolveOverlayElements(treatment: CreativeTreatment): CreativeTreatment["textHierarchy"] {
  const hasCta = treatment.textHierarchy.some((e) => e.role === "cta" && e.text.trim());
  if (treatment.cta.needed && treatment.cta.text?.trim() && !hasCta) {
    return [...treatment.textHierarchy, { role: "cta", text: treatment.cta.text.trim() }];
  }
  return treatment.textHierarchy;
}

export interface VerifiedContactInfo {
  location: string | null;
  phone: string | null;
  website: string | null;
}

/**
 * Extraction only, never fabrication (Final Production Loop brief
 * constraint #1: "Never invent phone numbers, addresses, or prices --
 * only use data verified in the business context"). Parses the exact
 * "Label: value" shape buildVerifiedBusinessInformation
 * (package-business-facts.ts) produces -- e.g. "Verified business address
 * (Google Business Profile): 14 Princess Street..." or "Business location
 * (as provided by the owner): Fort Kochi, Kerala". That function
 * deliberately never includes a phone number for the standard package-
 * post path (documented there: a stale/wrong phone is exactly the kind of
 * claim that's a hard-fail risk) -- so `phone` will legitimately stay
 * null for most real tenants today, and the contact-footer renderer must
 * render NO phone icon at all in that case, never a placeholder or a
 * guessed number.
 */
export function extractVerifiedContactInfo(verifiedFacts: string[]): VerifiedContactInfo {
  let location: string | null = null;
  let phone: string | null = null;
  let website: string | null = null;
  for (const fact of verifiedFacts) {
    const colonIndex = fact.indexOf(":");
    if (colonIndex < 0) continue;
    const label = fact.slice(0, colonIndex).toLowerCase();
    const value = fact.slice(colonIndex + 1).trim();
    if (!value) continue;
    if (!location && /location|address/.test(label)) location = value;
    else if (!phone && /phone|whatsapp/.test(label)) phone = value;
    else if (!website && /website/.test(label)) website = value;
  }
  return { location, phone, website };
}

export class CreativeTreatmentError extends Error {
  issues: CreativeTreatmentValidationIssue[];
  raw: unknown;

  constructor(issues: CreativeTreatmentValidationIssue[], raw: unknown) {
    super(`invalid creative treatment: ${issues.map((i) => `${i.field}: ${i.issue}`).join("; ")}`);
    this.name = "CreativeTreatmentError";
    this.issues = issues;
    this.raw = raw;
  }
}

/** Makes the real structured-output AI call and validates the result.
 * Throws CreativeTreatmentError on a malformed/generic response -- never
 * returns a silently-templated fallback. Callers retry with the standard
 * generation-loop pattern on failure, same as text generation. */
export async function generateCreativeTreatment(
  provider: AITextProviderAdapter,
  model: string,
  input: CreativeTreatmentInput
): Promise<CreativeTreatment> {
  const messages = buildCreativeTreatmentPrompt(input);
  const result = await provider.complete({
    model,
    messages,
    reasoningLevel: "medium",
    structuredOutputSchema: TREATMENT_JSON_SCHEMA as unknown as Record<string, unknown>,
    timeoutMs: 60_000,
  });

  const parsed = result.structuredOutput ?? safeParseJson(result.text);
  const issues = validateCreativeTreatment(parsed, { concept: input.brief.concept });
  if (issues.length) throw new CreativeTreatmentError(issues, parsed ?? result.text);
  return parsed as CreativeTreatment;
}

/** Exported so callers using a different provider-call convention than
 * generateCreativeTreatment's own (e.g. package-autopilot.ts's
 * AiRuntimeSocialProvider, which returns plain text with no structured-
 * output field) can still parse + validate a treatment response with the
 * exact same never-throws extraction logic. Mirrors
 * generated-copy-parser.ts's parseGeneratedCopy pattern. */
export function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}
