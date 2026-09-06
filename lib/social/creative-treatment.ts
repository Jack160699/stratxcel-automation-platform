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
import { checkTargetIndustryContamination, type IndustryCategory } from "./industry-taxonomy.ts";
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
  /** FINAL HERMES ROOT-CAUSE mission, round 2 (2026-09-06): real bug found
   * live -- concept, content pillar, and archetype all have real recency-
   * based diversity tracking (recentConcepts/recentPillars/
   * recentArchetypeHistory), but the actual on-image MESSAGE SHAPE
   * (which textHierarchy roles get used, e.g. "question+answer" every
   * time) had no tracking at all, so two back-to-back real generations --
   * even for two completely different businesses -- both independently
   * converged on the model's own default "question+answer" shape with
   * nothing telling it that shape had just been used. Each entry is a
   * real shape fingerprint from a recent real treatment for this same
   * tenant (see describeTextStructureShape) -- optional, and only ever
   * used to ask the model to prefer a different shape, never to forbid
   * one outright (a business can legitimately need the same shape twice
   * in a row if it's genuinely the strongest choice both times). */
  recentTextStructures?: string[];
  /**
   * FINAL HERMES -- RESTORE TRUE MARKETING CREATIVE GENERATION
   * (2026-09-06): real failure found live on the first run of the new
   * composition layer. Given two genuinely different objectives for the
   * same Solar business ("service/trust" then "savings/benefit/offer"),
   * the model returned the same canvas, the same block sequence, and a
   * near-identical headline both times -- it anchored on the business's
   * own brand description and ignored the second objective entirely.
   * Concept, pillar, archetype and on-image text shape all had recency
   * tracking; the DESIGN ITSELF had none. Each entry is a real block-kind
   * signature from a recent real composition for this same tenant (see
   * describeCompositionShape) -- used only to ask for a different design,
   * never to forbid one.
   */
  recentCompositions?: string[];
}

/** Real shape fingerprint for a treatment's on-image message -- the
 * ordered list of textHierarchy roles that actually carry content
 * (brandLabel and cta are structural chrome every archetype places the
 * same way, not part of the MESSAGE shape a business chooses). Exported
 * so every real caller that tracks recent treatments (package-autopilot.ts
 * from persisted creative_spec.treatment rows, studio-creative-
 * treatment.ts from recent image_generation_jobs rows) computes the exact
 * same fingerprint, never a bespoke ad hoc comparison. */
/**
 * Real design fingerprint of an ad composition: its canvas mode plus the
 * ordered list of block kinds, e.g. "photo_full:headline+body+cta". Two
 * creatives sharing this string are the same design carrying different
 * words -- exactly the repetition this signal exists to surface. Reads
 * defensively from `unknown` so it can be applied to whatever was
 * persisted on a past job without trusting its shape.
 */
export function describeCompositionShape(adComposition: unknown): string | null {
  if (!adComposition || typeof adComposition !== "object") return null;
  const raw = adComposition as { canvas?: unknown; blocks?: unknown };
  const canvas = typeof raw.canvas === "string" ? raw.canvas : null;
  if (!canvas || !Array.isArray(raw.blocks)) return null;
  const kinds = raw.blocks
    .map((b) => (b && typeof b === "object" ? (b as { kind?: unknown }).kind : null))
    .filter((k): k is string => typeof k === "string" && k.length > 0);
  if (!kinds.length) return null;
  return `${canvas}:${kinds.join("+")}`;
}

export function describeTextStructureShape(textHierarchy: OnImageTextElement[]): string {
  return textHierarchy
    .filter((e) => e.role !== "brandLabel" && e.role !== "cta" && e.text?.trim())
    .map((e) => e.role)
    .join("+") || "photo_only";
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
  /**
   * FINAL HERMES -- RESTORE TRUE MARKETING CREATIVE GENERATION
   * (2026-09-06): the actual ADVERTISEMENT DESIGN, as a declarative
   * composition (canvas mode + an ordered list of advertising blocks:
   * stat, offer, badges, benefits, steps, comparison, quote, headline,
   * body, CTA). This is what lets a strategy that decided "lead with the
   * number", "contrast old way vs our way" or "walk the four stages"
   * actually be DRAWN that way, instead of being flattened into the
   * headline+supportingLine+CTA slots that `textHierarchy` and the 13
   * fixed archetype builders are limited to -- see the root-cause note at
   * the top of composition-render.ts.
   *
   * Optional and additive: a treatment without one renders through the
   * existing archetype path exactly as before, so nothing that worked
   * before can regress. Typed as `unknown` here (rather than importing
   * CreativeComposition) purely to keep this module free of a dependency
   * on the renderer -- `parseCreativeComposition` is the single validator.
   */
  adComposition?: unknown;
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
          // FINAL HERMES MISSION (2026-09-06): widened so a treatment can
          // express a genuinely different message structure (see
          // buildArchetypeInstruction's FEATURE_POSTER-specific guidance
          // below) instead of always defaulting to headline+supportingLine
          // +cta. Schema-level only -- the prompt text still only invites a
          // given call to actually use the extra roles when the archetype
          // in play (FEATURE_POSTER today) has a compositor that renders
          // them distinctly; every other archetype's renderer safely
          // ignores roles it doesn't look for, same as "other" always was.
          role: {
            type: "string",
            enum: [
              "headline", "supportingLine", "cta", "brandLabel", "other",
              "insight", "proof", "painPoint", "solution", "value",
              "question", "answer", "benefit", "statement", "offer", "differentiators",
            ],
          },
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
/**
 * FINAL HERMES MISSION (2026-09-06): FEATURE_POSTER is now the real
 * automated default for most tenants (archetype-routing.ts), and its
 * compositor was found flattening every business into the exact same
 * shape -- a bold headline, the SAME static 3-item on-file differentiator
 * list every single time regardless of what the post is actually about,
 * then the same CTA bar. The differentiator list itself wasn't the
 * problem (it's real, on-file data); forcing it onto every creative
 * unconditionally, with nothing else the content strategy could express,
 * was. text-overlay-render.ts's buildFeaturePosterSvg now renders whatever
 * roles the treatment actually puts in textHierarchy, in order, each
 * styled by role -- this is the prompt-side half: telling the model it
 * has that real freedom, with concrete example shapes so it doesn't just
 * default back to habit. Scoped to FEATURE_POSTER specifically (checked
 * via def.id below) rather than changed globally, since every OTHER
 * archetype's compositor still only reads headline/supportingLine/cta/
 * brandLabel and would silently drop anything else -- exactly the
 * "redesign the whole platform" this mission explicitly ruled out.
 */
function buildFeaturePosterContentGuidance(recentTextStructures: string[]): string {
  return [
    `This archetype does NOT require a fixed "headline + bullet list + CTA" shape -- that is a visual DEFAULT, not a rule, and defaulting to it every time is the exact flattening bug this system must avoid. The CONTENT STRATEGY decides the message structure; FEATURE_POSTER only decides how that structure is laid out on the page.`,
    `First decide the single strongest real marketing angle for THIS business from the verified facts and strategy below (a pain point, a trust/credibility angle, a decision-anxiety angle, a proof point, a myth to correct, a timeline/urgency angle -- whatever is actually strongest here, not a generic category message). Then choose the textHierarchy SHAPE that best carries that specific angle. Do not pick the same shape you would use for a different business.`,
    `Available textHierarchy roles beyond the usual headline/supportingLine/cta/brandLabel: "statement"/"question" (an alternative large display line to "headline" -- use whichever reads more naturally for this angle), "insight"/"painPoint"/"solution"/"answer" (a medium supporting line carrying one real, specific idea), "proof"/"value"/"benefit"/"offer" (one real, specific point rendered as its own highlighted row), and "differentiators" (renders the business's OWN real on-file standout points as a short icon list -- include this role ONLY when the chosen structure genuinely benefits from that trust-building list; the compositor supplies the real text itself, so never write real content into this role's own "text" field, a short placeholder is fine).`,
    `Example shapes (pick one of these or design a better-fitting one -- do not treat this as an exhaustive menu): HOOK(as headline) + INSIGHT + PROOF + CTA. PAINPOINT + SOLUTION + VALUE + CTA. QUESTION + ANSWER + BENEFIT + CTA. STATEMENT + OFFER + CTA (the photo itself carries the visual proof). HEADLINE + DIFFERENTIATORS + CTA (only when the real on-file list IS the strongest angle for this business).`,
    `Two creatives for two different businesses (or two different angles for the same business) should usually end up with two DIFFERENT shapes -- if you notice yourself defaulting to the same structure as last time, reconsider whether it's really the strongest choice for this specific business and angle.`,
    // FINAL HERMES ROOT-CAUSE mission, round 2 (2026-09-06): real bug found
    // live -- "question"+"answer" is this model's own default safe choice,
    // and with nothing telling it that shape was JUST used, two
    // back-to-back real generations for two DIFFERENT businesses both
    // independently converged on the exact same question+answer+cta
    // shape, reading as the same template again even though the actual
    // words differed. Concept/pillar/archetype already have real recency
    // tracking (recentConcepts/recentPillars/recentArchetypeHistory) --
    // this is that same real mechanism, applied to message SHAPE, not
    // just topic.
    recentTextStructures.length
      ? `This business's own recent real creatives used these exact textHierarchy shapes: ${recentTextStructures.join(", ")}. Prefer a genuinely different shape now unless the strongest angle for THIS specific post truly calls for repeating one -- do not default back to "question+answer" just because it's the easy choice.`
      : "",
    `Keep every individual textHierarchy block SHORT -- a display-tier line (headline/statement/question) under about 8 words, any other block under about 16 words. This is a compact poster column sharing width with a real photo, not a paragraph; a real, specific idea said in fewer words reads stronger anyway than the same idea said as a full sentence.`,
  ].filter(Boolean).join(" ");
}

function buildArchetypeInstruction(routingContext: ArchetypeRoutingContext | undefined, recentTextStructures: string[]): string {
  if (routingContext?.forcedArchetype) {
    const def = ARCHETYPE_REGISTRY[routingContext.forcedArchetype];
    const featurePosterGuidance = def.id === "FEATURE_POSTER" ? ` ${buildFeaturePosterContentGuidance(recentTextStructures)}` : "";
    return `The LAYOUT ARCHETYPE for this creative is ALREADY DECIDED by the server: ${def.id} (${def.description}). Design your visual idea, composition, and text hierarchy around this archetype's real constraints (${def.constraints.join("; ")}) -- you must set "layoutArchetype" to exactly "${def.id}" in your response. Reason this was forced: ${routingContext.reason}${featurePosterGuidance}`;
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
    buildArchetypeInstruction(input.routingContext, input.recentTextStructures ?? []),
    `Never invent a business fact not present in the verified facts given to you. Creative persuasion must never become fabricated business information.`,
    `Never write generic AI marketing filler ("Elevate your experience", "Discover the magic", "Unleash your potential", and phrases like them) -- every word must be specific to this concept and this business. Premium design also comes from knowing what NOT to include: if a supporting line or CTA doesn't earn its place, omit it.`,
    `Respond with ONLY the JSON object matching the given schema -- no prose, no markdown fences.`,
  ].join(" ");

  const user = [
    `BUSINESS: ${input.businessName} (${input.industry.replace(/_/g, " ")})`,
    // STRATXCEL ONE-SHOT REBUILD mission Section 2/16/45: found live in
    // production -- a real published creative for a "generic"-classified
    // B2B SaaS business depicted a medical clinic reception desk
    // (stethoscope, anatomy poster) as if it were the business's OWN
    // premises. "(generic)" alone tells the model nothing about what the
    // business actually does or looks like, leaving room to invent a
    // customer-industry scene and present it as the business's own. Only
    // fires for "generic" -- a business already classified into a real
    // vertical (clinic, salon, restaurant, ...) has no such ambiguity.
    input.industry === "generic"
      ? `IDENTITY CLARITY: ${input.businessName} is NOT a local storefront business -- it has no premises resembling a clinic, salon, restaurant, gym, spa, or retail shop. Depict ${input.businessName}'s own real context only (its software/product, its team, its real workspace). If a customer's business is shown as an example, the scene must be unmistakably framed as someone else's business, in a way a viewer could never mistake for ${input.businessName}'s own operations.`
      : "",
    `MEDIA TYPE: ${input.mediaType}`,
    ``,
    `STRATEGY ALREADY DECIDED (do not re-derive):`,
    `- Objective: ${input.brief.objective}`,
    `- Audience: ${input.brief.audience}`,
    `- Content pillar: ${input.brief.contentPillar}`,
    `- Concept angle to develop into a real idea: ${input.brief.concept}`,
    `- CTA style if a CTA is used: ${input.brief.cta}`,
    // FINAL HERMES ROOT-CAUSE + STRATEGY RESTORATION mission (2026-09-06):
    // real bug found live -- this block only ever read 5 shallow fields
    // off the brief. buildCreativeBrief already computes a real hook
    // direction, headline direction, and supporting-copy direction for
    // EVERY brief (not just planned-strategy ones), and the 28-Day
    // Campaign Strategy Planner's own per-day reasoning (opportunity
    // type, unique angle, customer problem, audience intent, research
    // insight) was being computed, attached to the brief, and then simply
    // never read here -- the exact "strategy modules called but results
    // discarded" failure this mission set out to find. All of this is
    // optional/graceful: a manual or one-off brief with no plannedStrategy
    // still gets the always-present hook/headline/supporting directions;
    // a brief with genuinely nothing here just gets fewer lines, never a
    // fabricated placeholder.
    `- Hook direction: ${input.brief.hook}`,
    `- Headline direction: ${input.brief.headlineDirection}`,
    `- Supporting message direction: ${input.brief.supportingCopyDirection}`,
    input.brief.plannedStrategy
      ? [
          `- Content opportunity type: ${input.brief.plannedStrategy.opportunityType}`,
          `- WHY this angle (the actual strategic reasoning -- the creative concept above must clearly express this, not just the topic label): ${input.brief.plannedStrategy.uniqueAngle}`,
          `- The specific customer problem this post addresses: ${input.brief.plannedStrategy.customerProblem}`,
          `- What the audience wants when they see this: ${input.brief.plannedStrategy.audienceIntent}`,
          `- Strategic research insight behind this angle: ${input.brief.plannedStrategy.researchInsight}`,
        ].join("\n")
      : "",
    (input.brief.customerPsychology ?? []).some((p) => p.painPoints.length > 0)
      ? `- REAL CUSTOMER PSYCHOLOGY ON FILE (this tenant's own audience data -- ground the angle/message in this, don't invent a different psychological hook):\n${(input.brief.customerPsychology ?? [])
          .filter((p) => p.painPoints.length > 0)
          .map((p) => `  - ${p.audienceLabel}: worried about ${p.painPoints.join("; ")}`)
          .join("\n")}`
      : "",
    input.brief.avoid.length ? `- Avoid: ${input.brief.avoid.join("; ")}` : "",
    input.brief.seasonalContext
      ? `- ${input.brief.seasonalContext} Reference this ONLY if it genuinely fits this business and concept -- never force a festival/season tie-in onto unrelated content.`
      : `- No upcoming festival/season occasion falls within this post's near-term window.`,
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
    // FINAL HERMES -- RESTORE TRUE MARKETING CREATIVE GENERATION
    // (2026-09-06). Everything above decides WHAT to say; this block is
    // where the model designs the actual ADVERTISEMENT. It is deliberately
    // written as a vocabulary of advertising primitives with a rule for
    // WHEN each one is the right choice -- not as a menu of templates --
    // because the failure this fixes was precisely that "choosing a
    // format" had been reduced to picking one of 13 pre-written posters,
    // so every strategy arrived at the same logo+headline+photo+CTA shape.
    ``,
    `DESIGN THE ADVERTISEMENT ("adComposition"). This is a real social-media ADVERTISEMENT, like a professional agency or a strong Canva ad -- not a photo with a caption typed over it. Build it from the blocks below, choosing ONLY the ones this specific strategy actually needs, in the order they should be read.`,
    `The blocks (each is optional -- pick what the message needs):`,
    `  { "kind": "eyebrow", "text": string }  -- a short uppercase kicker (category, city, offer flag).`,
    `  { "kind": "headline", "text": string }  -- the dominant message. Under ~9 words.`,
    `  { "kind": "subhead", "text": string }  -- one secondary line.`,
    `  { "kind": "body", "text": string }  -- one short explanatory sentence.`,
    `  { "kind": "stat", "value": string, "caption": string }  -- an OVERSIZED figure ("40%", "Rs.0", "4 stages", "12 years"). Use when a real number is the most persuasive thing you have. "value" must be SHORT (under ~8 characters) -- it is rendered very large.`,
    `  { "kind": "offer", "value": string, "detail": string }  -- a promotional message on its own colored field. Use for offers/promotions.`,
    `  { "kind": "badges", "items": string[] }  -- up to 3 SHORT trust chips ("25-year warranty", "Subsidy handled"). Each under ~4 words.`,
    `  { "kind": "benefits", "items": string[] }  -- up to 4 benefit lines, each rendered with a check icon.`,
    `  { "kind": "steps", "items": string[] }  -- 2-4 numbered stages. Use for a process/journey message.`,
    `  { "kind": "comparison", "leftLabel": string, "leftItems": string[], "rightLabel": string, "rightItems": string[] }  -- two columns. Use for old-way-vs-our-way / problem-vs-solution. The RIGHT column is the highlighted one, so put YOUR side on the right.`,
    `  { "kind": "quote", "text": string, "attribution": string }  -- a testimonial. ONLY if a real customer quote exists in the verified facts; never invent one.`,
    `  { "kind": "cta", "text": string }  -- the action.`,
    `"canvas" decides where the photograph lives: "photo_full" (photo fills the frame, content on a colored panel over it -- panel: "bottom"|"top"|"left"|"right"), "photo_top" (photo band on top, content below), "photo_side" (photo one half, content the other -- panel says which side the CONTENT is on), "photo_inset" (photo as a bounded card with content beneath), "solid" (no photograph at all -- only when the words/number ARE the whole idea).`,
    `CHOOSE THE FORMAT FROM THE STRATEGY, not from habit:`,
    `  - A saving/result/scale message with a real number -> lead with "stat".`,
    `  - A promotion or price message -> lead with "offer".`,
    `  - A multi-stage service or journey -> use "steps".`,
    `  - A "most people get this wrong" or old-way/new-way message -> use "comparison".`,
    `  - A trust/credibility message -> "benefits" and/or "badges" carry it better than a paragraph.`,
    `  - A single emotional or decision-anxiety message -> a strong "headline" plus one "body" may genuinely be right.`,
    `Rules: use 2-5 blocks total (a real ad is not a leaflet). Do NOT include a "brandLabel" block -- the business logo/name is placed automatically. Every string must be real, specific, and drawn from the verified facts -- never invent a statistic, price, discount, award or testimonial. If you have no real number, do not use "stat"; if there is no real offer, do not use "offer".`,
    // Real failure this rule exists to stop, found live on the first run:
    // given "service/trust" and then "savings/benefit/offer" for the same
    // Solar business, the model returned the same canvas, the same block
    // sequence and a near-identical headline both times -- it anchored on
    // the brand description and silently discarded the second objective.
    `THE OBJECTIVE AND CONCEPT ANGLE ABOVE DECIDE THIS DESIGN. Before choosing blocks, state to yourself what this specific post is selling and why a reader should care RIGHT NOW -- then pick the blocks that make that obvious at a glance. A savings/offer objective must NOT come back as a trust/craftsmanship ad, and a trust objective must NOT come back as a discount ad. If the objective names money, the money must be the visually dominant element; if it names a process or journey, the stages must be visible; if it names a decision or worry, the tension and its resolution must both be visible.`,
    `"headline" + "body" + "cta" is the DEFAULT SHAPE AND THE WEAKEST ANSWER. Use it only when you have genuinely concluded no stronger structure fits this objective -- not as a starting point.`,
    (input.recentCompositions ?? []).length
      ? `This business's own recent real ads already used these exact designs: ${(input.recentCompositions ?? []).join(", ")} (format is "canvas:block+block+block"). Produce a genuinely different design now -- a different canvas, a different block sequence, or both. Repeating one of these is a failure unless it is unarguably the only structure that fits this specific objective.`
      : "",
    ``,
    `Respond with ONLY a single JSON object, exactly this shape (every field required, all strings real and specific, never a placeholder):`,
    `{`,
    `  "concept": string (a real specific creative idea, NOT the category label above),`,
    `  "hook": string, "audienceTension": string, "story": string, "visualIdea": string,`,
    `  "subject": string, "composition": string, "camera": string, "lighting": string, "environment": string,`,
    `  "colorDirection": string, "typographyDirection": string, "brandApplication": string,`,
    // The expanded role vocabulary is only ever shown for a FEATURE_POSTER-
    // forced call -- every other archetype's compositor still only reads
    // headline/supportingLine/cta/brandLabel (see pickElements in
    // text-overlay-render.ts), so offering the extra roles there would just
    // mean silently-dropped content, not a real capability.
    input.routingContext?.forcedArchetype === "FEATURE_POSTER"
      ? `  "textHierarchy": [{ "role": "headline"|"supportingLine"|"cta"|"brandLabel"|"other"|"insight"|"proof"|"painPoint"|"solution"|"value"|"question"|"answer"|"benefit"|"statement"|"offer"|"differentiators", "text": string }] (0-6 items -- can be empty if the photo alone carries the idea; "brandLabel" text must be ONLY the plain business name, e.g. "Metro Wheels Car Rentals" -- never append a location, tagline, or slogan to it, or a compact layout has to truncate it mid-word),`
      : `  "textHierarchy": [{ "role": "headline"|"supportingLine"|"cta"|"brandLabel"|"other", "text": string }] (0-6 items -- can be empty if the photo alone carries the idea; "brandLabel" text must be ONLY the plain business name, e.g. "Metro Wheels Car Rentals" -- never append a location, tagline, or slogan to it, or a compact layout has to truncate it mid-word),`,
    `  "cta": { "needed": boolean, "text": string|null, "rationale": string },`,
    `  "whyStopScroll": string, "whyThisBusiness": string,`,
    `  "negativeConstraints": string[],`,
    `  "intentionallyTextLed": boolean,`,
    `  "layoutArchetype": ${allowedForShape.map((id) => `"${id}"`).join("|")},`,
    `  "adComposition": { "canvas": "photo_full"|"photo_top"|"photo_side"|"photo_inset"|"solid", "panel": "bottom"|"top"|"left"|"right", "blocks": [ ... ] }`,
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
  context: { concept: string; routingContext?: ArchetypeRoutingContext; industry?: IndustryCategory }
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
  } else if (t.textHierarchy.length > 6) {
    // Raised from 4 (FINAL HERMES MISSION, 2026-09-06): a real
    // content-strategy-driven structure can legitimately need brandLabel +
    // a display line + two supporting/proof-style blocks + cta = 5-6 real
    // elements, not just headline+supportingLine+cta+brandLabel. Still a
    // hard, real cap -- this is not an invitation to pad every creative
    // out to six elements.
    issues.push({ field: "textHierarchy", issue: `${t.textHierarchy.length} on-image text elements -- too many for one coherent structure` });
  } else {
    // Finished Premium Marketing Creative brief Section 2 (hard failure):
    // every textHierarchy entry gets rendered as literal pixels by the
    // deterministic overlay -- an implementation-instruction leak here
    // ("Add text here", "Logo here") would ship straight onto the actual
    // published creative, not just live in a caption a human might edit.
    for (const el of t.textHierarchy) {
      const leak = el?.text ? findPlaceholderOrFiller(el.text) : null;
      if (leak) issues.push({ field: "textHierarchy", issue: `"${el.role}" text contains implementation-instruction/placeholder leakage: "${leak}"` });
      // Real defect found live on StratXcel's own published output (this
      // exact real headline: "Local SEO that runs while you run your
      // clinic."): checkTargetIndustryContamination was already applied to
      // the CAPTION, but on-image textHierarchy is a SEPARATE generation
      // path that gets rendered as literal pixels on the final published
      // creative -- it was never checked at all, so the same contamination
      // pattern the caption-side fix (commit 3780ef2) already guards
      // against could still ship straight onto the image. Only meaningful
      // when a real industry is known.
      if (context.industry && el?.text) {
        const contamination = checkTargetIndustryContamination(el.text, context.industry);
        if (contamination.isContaminated) {
          issues.push({ field: "textHierarchy", issue: `"${el.role}" on-image text: ${contamination.reason}` });
        }
      }
    }
  }

  if (!t.cta || typeof t.cta !== "object" || typeof t.cta.needed !== "boolean" || typeof t.cta.rationale !== "string") {
    issues.push({ field: "cta", issue: "missing or malformed CTA decision object" });
  } else if (t.cta.needed && (!t.cta.text || !t.cta.text.trim())) {
    issues.push({ field: "cta", issue: "cta.needed is true but cta.text is empty" });
  } else if (t.cta.text) {
    const leak = findPlaceholderOrFiller(t.cta.text);
    if (leak) issues.push({ field: "cta", issue: `cta.text contains implementation-instruction/placeholder leakage: "${leak}"` });
    if (context.industry) {
      const contamination = checkTargetIndustryContamination(t.cta.text, context.industry);
      if (contamination.isContaminated) issues.push({ field: "cta", issue: `cta.text: ${contamination.reason}` });
    }
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
