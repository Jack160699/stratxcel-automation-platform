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
import { ARCHETYPE_IDS, ARCHETYPE_REGISTRY, isValidArchetype, type LayoutArchetype } from "./archetype-registry.ts";

/**
 * Subscription-Gated Visual Archetypes brief Section 6: an explicit routing
 * context the SERVER constructs (archetype-routing.ts) and hands to
 * treatment generation -- never something the AI or a client can set. Two
 * shapes:
 *  - `forcedArchetype` set: the server has ALREADY decided the exact
 *    archetype (Starter's automated path is always forced to
 *    BASIC_ESSENTIAL; Growth/Business manual generation is forced to the
 *    validated requested archetype once routing accepts it). The AI is
 *    told the decision and asked to design around it, but
 *    generateCreativeTreatment force-overwrites the returned
 *    layoutArchetype to this exact value regardless of what the AI
 *    returns -- defense in depth, never trusting AI compliance alone.
 *  - `forcedArchetype` null with a real `allowedArchetypes` list: the AI
 *    may choose freely, but ONLY from this set (Growth/Business automated,
 *    restricted to the tenant's saved preferences).
 * archetype-routing.ts is the only real caller expected to construct one
 * of these; harness/test code may omit routingContext entirely, in which
 * case every archetype is available (today's fixture-friendly default,
 * NOT how any real subscription-gated path should call this).
 */
export interface ArchetypeRoutingContext {
  forcedArchetype: LayoutArchetype | null;
  allowedArchetypes: LayoutArchetype[];
  /** Surfaced in the prompt purely for the AI's own context/quality (e.g.
   * "you're on the Starter automated safe-default path") -- never itself
   * an enforcement mechanism. */
  reason: string;
}

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
  /** Server-authoritative archetype constraint -- see ArchetypeRoutingContext. */
  routingContext?: ArchetypeRoutingContext;
}

export interface CtaDecision {
  needed: boolean;
  text: string | null;
  rationale: string;
}

/**
 * Final Production Loop brief Section "STEP 1", extended by the
 * Subscription-Gated Visual Archetypes brief Section 5: the deterministic
 * overlay used to have exactly one layout (bottom scrim band + top-right
 * brand chip) regardless of the creative -- functional, but reads as "a
 * stock photo with a video subtitle," not a designed marketing banner.
 * There are now 12 genuinely different composition strategies -- see
 * archetype-registry.ts (THE canonical source of truth for what each one
 * is, its design intent, and which subscription tiers may use it; this
 * file re-exports its id type rather than redefining the list, per that
 * registry's own "never duplicate the archetype list" rule) -- each
 * implemented distinctly by the renderer (text-overlay-render.ts), with
 * the visual-director prompt (visual-director-prompt.ts) reserving
 * different negative space in the base photo for each.
 *
 * The treatment model picks one per creative based on the concept, the
 * same way an art director would choose a layout for a specific shoot --
 * UNLESS a routing context (archetype-routing.ts) forces a specific
 * archetype server-side (Starter's automated path is always forced to
 * BASIC_ESSENTIAL; Growth/Business automated is forced to one drawn from
 * the tenant's saved preferences; Growth/Business manual generation is
 * forced to the validated requested archetype). A server-forced archetype
 * is authoritative -- the AI is informed of the constraint but never gets
 * the final say once one is forced; see generateCreativeTreatment's
 * routingContext handling below.
 */
export { ARCHETYPE_IDS as LAYOUT_ARCHETYPE_IDS } from "./archetype-registry.ts";
export type { LayoutArchetype } from "./archetype-registry.ts";

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
    layoutArchetype: { type: "string", enum: [...ARCHETYPE_IDS] },
  },
  required: [
    "concept", "hook", "audienceTension", "story", "visualIdea", "subject", "composition",
    "camera", "lighting", "environment", "colorDirection", "typographyDirection",
    "brandApplication", "textHierarchy", "cta", "whyStopScroll", "whyThisBusiness",
    "negativeConstraints", "intentionallyTextLed", "layoutArchetype",
  ],
} as const;

/** Builds the LAYOUT ARCHETYPE instruction paragraph -- generated from
 * archetype-registry.ts (never a hand-duplicated description list) and
 * shaped by the routing context: forced, restricted to a preference set,
 * or (harness/test default) free choice across everything. */
function buildArchetypeInstruction(routingContext: ArchetypeRoutingContext | undefined): string {
  if (routingContext?.forcedArchetype) {
    const def = ARCHETYPE_REGISTRY[routingContext.forcedArchetype];
    return `The LAYOUT ARCHETYPE for this creative is ALREADY DECIDED by the server: ${def.id} (${def.description}). Design your visual idea, composition, and text hierarchy around this archetype's real constraints (${def.constraints.join("; ")}) -- you must set "layoutArchetype" to exactly "${def.id}" in your response. Reason this was forced: ${routingContext.reason}`;
  }
  const allowed = routingContext?.allowedArchetypes?.length ? routingContext.allowedArchetypes : ARCHETYPE_IDS;
  const descriptions = allowed.map((id) => {
    const def = ARCHETYPE_REGISTRY[id];
    return `${def.id} (${def.description})`;
  }).join(", ");
  const restrictionNote = routingContext?.allowedArchetypes?.length
    ? ` You may choose ONLY from this list -- any other archetype id is invalid for this tenant. ${routingContext.reason}`
    : "";
  return `You must also choose a LAYOUT ARCHETYPE -- the actual graphic-design composition, not just what the text says: ${descriptions}.${restrictionNote} Choose deliberately based on THIS concept, the way an art director picks a layout for a specific shoot -- do not default to the same archetype every time.`;
}

export function buildCreativeTreatmentPrompt(input: CreativeTreatmentInput): AIMessage[] {
  const allowedForShape = input.routingContext?.forcedArchetype
    ? [input.routingContext.forcedArchetype]
    : input.routingContext?.allowedArchetypes?.length
      ? input.routingContext.allowedArchetypes
      : ARCHETYPE_IDS;

  const system = [
    `You are the creative director and visual art director for a premium social-media agency.`,
    `A senior team already decided the strategy for this post -- do not re-derive it. Your job is to turn it into ONE real, specific creative idea and a full visual treatment, the way an agency would brief a photographer before a shoot.`,
    `The final creative must feel business-specific, visually rich, simple, premium, intentional, modern, and clearly NOT generic AI output. Default philosophy: IMAGE/VISUAL IDEA FIRST, message second, supporting text third, brand/CTA last -- never a paragraph of text decorated with a picture.`,
    `Prefer real visual storytelling (photography of the actual business/product/service in use) over text-based graphics. A creative with no on-image text at all is a valid, often stronger, choice -- do not force a headline or CTA onto every creative. Default to ONE primary idea; at most one short supporting line; a CTA only when it genuinely helps.`,
    buildArchetypeInstruction(input.routingContext),
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
    `  "layoutArchetype": ${allowedForShape.map((id) => `"${id}"`).join("|")}`,
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
  context: { concept: string; routingContext?: ArchetypeRoutingContext }
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

  // Two independent checks: (1) is this a real, registered archetype id at
  // all -- catches a malformed/hallucinated value -- and (2) if a routing
  // context was supplied, is it actually the one allowed for this tenant.
  // (2) is the real tier-bypass defense: an AI that ignores its own
  // instructions and picks an unauthorized premium archetype must be
  // caught here, not just relied on to have listened.
  if (!isValidArchetype(t.layoutArchetype)) {
    issues.push({ field: "layoutArchetype", issue: `missing or not one of ${ARCHETYPE_IDS.join(", ")}` });
  } else if (context.routingContext) {
    const { forcedArchetype, allowedArchetypes } = context.routingContext;
    if (forcedArchetype && t.layoutArchetype !== forcedArchetype) {
      issues.push({ field: "layoutArchetype", issue: `server forced "${forcedArchetype}" but the treatment returned "${t.layoutArchetype}" -- AI must never override a server-forced archetype` });
    } else if (!forcedArchetype && allowedArchetypes.length && !allowedArchetypes.includes(t.layoutArchetype)) {
      issues.push({ field: "layoutArchetype", issue: `"${t.layoutArchetype}" is not in this tenant's allowed set (${allowedArchetypes.join(", ")}) -- tier/preference bypass attempt or model error` });
    }
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
  const issues = validateCreativeTreatment(parsed, { concept: input.brief.concept, routingContext: input.routingContext })
    // A forced-archetype mismatch is real, useful diagnostic signal (the
    // AI didn't follow instructions) but must never actually block
    // generation -- forceArchetypeOntoTreatment below corrects it
    // unconditionally, so this specific issue is filtered out rather than
    // thrown, while every other validation issue still fails closed.
    .filter((issue) => !(issue.field === "layoutArchetype" && input.routingContext?.forcedArchetype));
  if (issues.length) throw new CreativeTreatmentError(issues, parsed ?? result.text);
  return forceArchetypeOntoTreatment(parsed as CreativeTreatment, input.routingContext);
}

/** "The AI must NEVER override a server-forced archetype" (Subscription-
 * Gated Visual Archetypes brief Section 6) as an actual guarantee, not
 * just a prompt instruction: when routingContext.forcedArchetype is set,
 * the returned treatment's layoutArchetype is unconditionally set to it,
 * regardless of what the AI returned. Exported so callers using a
 * different provider-call convention (package-autopilot.ts's own
 * validate-then-use path) apply the exact same guarantee. */
export function forceArchetypeOntoTreatment(treatment: CreativeTreatment, routingContext: ArchetypeRoutingContext | undefined): CreativeTreatment {
  if (!routingContext?.forcedArchetype || treatment.layoutArchetype === routingContext.forcedArchetype) return treatment;
  return { ...treatment, layoutArchetype: routingContext.forcedArchetype };
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
