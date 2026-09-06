/**
 * Creative Format Engine (Creative Generation Architecture Repair, 2026-09-07).
 *
 * REAL ROOT CAUSE THIS FILE FIXES (traced live, not assumed):
 *
 * The 28-Day Campaign Planner (campaign-strategy-planner.ts) already
 * computes a `VisualCategory` per day (12 values, including
 * "infographic_graphic", "before_after", "process") and rotates it
 * deliberately so the calendar doesn't repeat one visual approach. But that
 * value is used in exactly ONE place in the whole codebase --
 * visual-quality-score.ts's post-hoc "did the same category repeat 3x in a
 * row" penalty -- and `evaluateVisualQuality` itself is never called from
 * the live pipeline (package-autopilot.ts only imports it). VisualCategory
 * never reaches creative-brief.ts's prompt output or
 * creative-treatment.ts's `buildCreativeTreatmentPrompt`, so "today is an
 * infographic day" has ZERO causal effect on what actually gets generated.
 *
 * Compounding that, `buildCreativeTreatmentPrompt`'s system prompt carries
 * one unconditional line for every single post, every format, every
 * objective: "Prefer real visual storytelling (photography...) over
 * text-based graphics. A creative with no on-image text at all is a valid,
 * often stronger, choice." That is a reasonable default for a mood/brand
 * photo -- and actively wrong guidance for a SALES/OFFER_PROMOTION or an
 * AUTHORITY/EDUCATIONAL_CAROUSEL post, which genuinely needs a structured,
 * information-dense adComposition (composition-render.ts already supports
 * exactly this: stat/offer/badges/benefits/steps/comparison/quote blocks --
 * the "marketing infographic" engine the business wants already exists and
 * renders deterministically; it is simply never asked for on purpose).
 *
 * This module is the missing causal link: a real `CreativeFormat`
 * classification, chosen from the objective/opportunity the strategy layer
 * already decided (never randomly), fed forward into the treatment prompt
 * as a concrete, format-specific instruction that actually steers
 * `adComposition` block selection and the on-image-text policy -- replacing
 * "always prefer photography" with "prefer photography for THIS kind of
 * post, require real structure for THAT kind."
 *
 * Additive only: every existing caller that does not pass a CreativeFormat
 * keeps exactly today's behavior (buildCreativeTreatmentPrompt's original
 * unconditional sentence is still the fallback -- see creative-treatment.ts).
 */

import type { ContentObjective } from "./content-options.ts";
import type { ContentOpportunityType } from "./opportunity-map.ts";
import { selectLeastRecentlyUsed } from "./content-diversity.ts";

export const CREATIVE_FORMATS = [
  "PHOTOGRAPHIC_AD",
  "MARKETING_INFOGRAPHIC",
  "PRODUCT_UI_AD",
  "FEATURE_BENEFIT_AD",
  "OFFER_PROMOTION",
  "BEFORE_AFTER",
  "EDUCATIONAL_CAROUSEL",
  "PROBLEM_SOLUTION",
  "TESTIMONIAL_SOCIAL_PROOF",
  "LOCAL_BUSINESS_AD",
  "BRAND_STORY",
  "ANNOUNCEMENT",
  "SERVICE_EXPLAINER",
  "COMPARISON",
  "SEASONAL_CAMPAIGN",
] as const;

export type CreativeFormat = (typeof CREATIVE_FORMATS)[number];

export function isValidCreativeFormat(value: unknown): value is CreativeFormat {
  return typeof value === "string" && (CREATIVE_FORMATS as readonly string[]).includes(value);
}

/** Whether this format expects real on-image structure (a genuine
 * adComposition with substantive blocks) or is legitimately allowed to stay
 * photo-led with little or no on-image text. Read by
 * creative-treatment.ts's validator to catch the exact failure mode this
 * mission exists to close: a structure-required day quietly defaulting to
 * "photo + one headline + CTA". */
export type CreativeFormatTextPolicy = "photo_led" | "structure_required";

export interface CreativeFormatDefinition {
  id: CreativeFormat;
  label: string;
  textPolicy: CreativeFormatTextPolicy;
  /** Composition-render.ts block kinds this format should reach for first
   * (a hint, not an exclusive list -- the treatment may still add eyebrow/
   * headline/cta around them). */
  preferredBlocks: string[];
  /** The real, concrete instruction handed to the treatment model --
   * written in the same block vocabulary buildCreativeTreatmentPrompt
   * already teaches (eyebrow/headline/subhead/body/stat/offer/badges/
   * benefits/steps/comparison/quote/cta), so a format's directive never
   * asks for something the renderer can't draw. */
  directive: string;
}

export const CREATIVE_FORMAT_REGISTRY: Record<CreativeFormat, CreativeFormatDefinition> = {
  PHOTOGRAPHIC_AD: {
    id: "PHOTOGRAPHIC_AD",
    label: "Photographic Ad",
    textPolicy: "photo_led",
    preferredBlocks: ["headline", "cta"],
    directive:
      "The photograph itself is the advertisement -- real photography of the actual business/product/service in use, composed with intent. On-image text should stay minimal (a short headline and/or CTA at most, or none at all if the image genuinely carries the idea alone). Do not force a block-heavy structured composition onto this format.",
  },
  MARKETING_INFOGRAPHIC: {
    id: "MARKETING_INFOGRAPHIC",
    label: "Marketing Infographic",
    textPolicy: "structure_required",
    preferredBlocks: ["eyebrow", "headline", "benefits", "steps", "stat", "cta"],
    directive:
      "This is a structured, information-dense advertisement -- like a real agency infographic ad, not a photo with a caption. Build a genuine adComposition with multiple blocks (e.g. eyebrow + headline + benefits/steps/stat + cta) that organizes the message into distinct, readable rows. A single headline plus a CTA is NOT sufficient for this format -- it must visibly communicate more than one structured point.",
  },
  PRODUCT_UI_AD: {
    id: "PRODUCT_UI_AD",
    label: "Product / UI Ad",
    textPolicy: "structure_required",
    preferredBlocks: ["headline", "benefits", "steps", "cta"],
    directive:
      "Depict the actual product, software, or service being used -- a real phone/laptop screen, a real hands-on interaction, or the physical product itself -- as the photographic subject. Pair it with a feature-led adComposition (headline plus benefits or steps) that explains exactly what the viewer is looking at and why it matters. Never invent a UI, screen, or feature that isn't real.",
  },
  FEATURE_BENEFIT_AD: {
    id: "FEATURE_BENEFIT_AD",
    label: "Feature / Benefit Ad",
    textPolicy: "structure_required",
    preferredBlocks: ["headline", "benefits", "badges", "cta"],
    directive:
      "Lead with the 'benefits' block -- real, specific advantages of this business's actual offering, never generic filler -- or 'badges' for concrete trust signals, alongside a headline that names the core value proposition in concrete terms.",
  },
  OFFER_PROMOTION: {
    id: "OFFER_PROMOTION",
    label: "Offer / Promotion",
    textPolicy: "structure_required",
    preferredBlocks: ["eyebrow", "offer", "cta"],
    directive:
      "Lead with the 'offer' block carrying a real, specific promotion, price, or discount drawn only from verified facts, followed by a clear 'cta'. Never invent a discount, price, or deadline that isn't in the verified facts -- if no real offer exists, fall back to a strong value/benefit message instead of fabricating one.",
  },
  BEFORE_AFTER: {
    id: "BEFORE_AFTER",
    label: "Before / After",
    textPolicy: "structure_required",
    preferredBlocks: ["comparison", "headline", "cta"],
    directive:
      "Use the 'comparison' block framed as a before/after or old-way/new-way contrast (leftLabel the old state, rightLabel -- the highlighted side -- the result this business delivers). The photograph should depict the 'after'/result state as vividly and specifically as possible; never claim a numeric result not present in verified facts.",
  },
  EDUCATIONAL_CAROUSEL: {
    id: "EDUCATIONAL_CAROUSEL",
    label: "Educational Carousel",
    textPolicy: "structure_required",
    preferredBlocks: ["eyebrow", "headline", "steps", "cta"],
    directive:
      "Use the 'steps' block to break the idea into 2-4 concrete, numbered stages a viewer can actually follow -- this is a teaching moment, not a mood photo. Each step must be a real, specific piece of guidance, not a vague restatement of the headline.",
  },
  PROBLEM_SOLUTION: {
    id: "PROBLEM_SOLUTION",
    label: "Problem / Solution",
    textPolicy: "structure_required",
    preferredBlocks: ["headline", "subhead", "benefits", "cta"],
    directive:
      "Structure the message as a clear tension-then-resolution: a 'headline' or 'subhead' naming the real customer problem, followed by 'body' or 'benefits' naming the concrete resolution this business provides. The reader should feel the problem named before the fix is offered.",
  },
  TESTIMONIAL_SOCIAL_PROOF: {
    id: "TESTIMONIAL_SOCIAL_PROOF",
    label: "Testimonial / Social Proof",
    textPolicy: "structure_required",
    preferredBlocks: ["quote", "badges", "stat"],
    directive:
      "If a real customer quote or testimonial exists in the verified facts, use the 'quote' block with its real attribution. If no real testimonial exists, NEVER invent one -- fall back to a 'badges' or 'stat' block grounded only in real, verifiable proof (a real count, a real credential, a real outcome from verified facts).",
  },
  LOCAL_BUSINESS_AD: {
    id: "LOCAL_BUSINESS_AD",
    label: "Local Business Ad",
    textPolicy: "photo_led",
    preferredBlocks: ["headline", "badges", "cta"],
    directive:
      "Ground the photograph and message in this business's real local context (neighborhood, city, or community named in verified facts). A short headline plus, optionally, a 'badges' row for local trust signals is usually enough -- do not over-structure a message whose strength is local warmth, not information density.",
  },
  BRAND_STORY: {
    id: "BRAND_STORY",
    label: "Brand Story",
    textPolicy: "photo_led",
    preferredBlocks: ["headline", "supportingLine"],
    directive:
      "A narrative, editorial moment about this business's own real people, craft, or history. Minimal on-image text -- let the photograph and, at most, a short headline or one supporting line carry the story. Never fabricate a specific anecdote, name, or moment not present in verified facts.",
  },
  ANNOUNCEMENT: {
    id: "ANNOUNCEMENT",
    label: "Announcement",
    textPolicy: "structure_required",
    preferredBlocks: ["eyebrow", "headline", "cta"],
    directive:
      "State the news plainly: a strong 'headline' (optionally preceded by an 'eyebrow' naming the occasion) stating exactly what's new or changing, plus a 'cta' if the reader needs to act. Keep it short and direct -- this format exists to inform quickly, not to persuade at length.",
  },
  SERVICE_EXPLAINER: {
    id: "SERVICE_EXPLAINER",
    label: "Service Explainer",
    textPolicy: "structure_required",
    preferredBlocks: ["headline", "steps", "benefits", "cta"],
    directive:
      "Use 'steps' or 'benefits' to visualize how the service actually works and what the customer gets from it -- this format exists to explain a real process or offering, not just to evoke a mood.",
  },
  COMPARISON: {
    id: "COMPARISON",
    label: "Comparison",
    textPolicy: "structure_required",
    preferredBlocks: ["comparison", "cta"],
    directive:
      "Use the 'comparison' block: the old/generic way versus this business's real way, with this business's side on the right (the highlighted column). Every item in both columns must be a real, specific, defensible claim -- never a strawman invented to make the comparison look better than it honestly is.",
  },
  SEASONAL_CAMPAIGN: {
    id: "SEASONAL_CAMPAIGN",
    label: "Seasonal Campaign",
    textPolicy: "structure_required",
    preferredBlocks: ["eyebrow", "offer", "headline", "cta"],
    directive:
      "Tie the message to the specific real seasonal or festival context supplied for this post -- an 'eyebrow' or 'offer' block naming the occasion, plus a headline and cta. Never force a seasonal tie-in when no genuine seasonal context was supplied for this post.",
  },
};

export function getCreativeFormatDefinition(id: CreativeFormat): CreativeFormatDefinition {
  return CREATIVE_FORMAT_REGISTRY[id];
}

/**
 * Objective -> format mapping (fallback signal, used whenever a more
 * specific ContentOpportunityType isn't available -- e.g. a manual Creative
 * Studio brief, or a recovery-retry that deliberately drops the day's
 * original planned strategy). Ordered by fit; `resolveCreativeFormat` picks
 * whichever candidate is least-recently-used for real rotation, matching
 * the exact pattern selectObjective/selectLeastRecentlyUsed already
 * establish elsewhere in this codebase.
 */
export const OBJECTIVE_TO_CREATIVE_FORMATS: Record<ContentObjective, CreativeFormat[]> = {
  REACH: ["PHOTOGRAPHIC_AD", "BRAND_STORY", "LOCAL_BUSINESS_AD", "MARKETING_INFOGRAPHIC"],
  ENGAGEMENT: ["MARKETING_INFOGRAPHIC", "PROBLEM_SOLUTION", "PHOTOGRAPHIC_AD"],
  FOLLOWERS: ["BRAND_STORY", "EDUCATIONAL_CAROUSEL", "PHOTOGRAPHIC_AD"],
  TRAFFIC: ["FEATURE_BENEFIT_AD", "SERVICE_EXPLAINER", "PRODUCT_UI_AD"],
  LEADS: ["PROBLEM_SOLUTION", "OFFER_PROMOTION", "LOCAL_BUSINESS_AD", "FEATURE_BENEFIT_AD"],
  SALES: ["OFFER_PROMOTION", "FEATURE_BENEFIT_AD"],
  AUTHORITY: ["SERVICE_EXPLAINER", "EDUCATIONAL_CAROUSEL", "MARKETING_INFOGRAPHIC"],
  COMMUNITY: ["TESTIMONIAL_SOCIAL_PROOF", "BRAND_STORY", "LOCAL_BUSINESS_AD"],
  RETENTION: ["ANNOUNCEMENT", "TESTIMONIAL_SOCIAL_PROOF", "BRAND_STORY"],
};

/**
 * Opportunity type -> format mapping (primary signal whenever the 28-Day
 * Planner has already chosen one -- ContentOpportunityType is far more
 * specific than ContentObjective, e.g. COMPARISON_GUIDE and BEFORE_AFTER
 * both map to strategicObjective "AUTHORITY"/"PROOF" in
 * opportunity-map.ts's own table, but they call for genuinely different
 * creative formats).
 */
export const OPPORTUNITY_TYPE_TO_CREATIVE_FORMATS: Record<ContentOpportunityType, CreativeFormat[]> = {
  CUSTOMER_PAIN_POINT: ["PROBLEM_SOLUTION", "FEATURE_BENEFIT_AD"],
  CUSTOMER_QUESTION: ["SERVICE_EXPLAINER", "MARKETING_INFOGRAPHIC"],
  COMMON_MISCONCEPTION: ["PROBLEM_SOLUTION", "MARKETING_INFOGRAPHIC"],
  PURCHASE_OBJECTION: ["PROBLEM_SOLUTION", "TESTIMONIAL_SOCIAL_PROOF"],
  SERVICE_EDUCATION: ["SERVICE_EXPLAINER", "MARKETING_INFOGRAPHIC"],
  PRODUCT_SPOTLIGHT: ["PHOTOGRAPHIC_AD", "PRODUCT_UI_AD", "FEATURE_BENEFIT_AD"],
  LOCAL_RELEVANCE: ["LOCAL_BUSINESS_AD", "PHOTOGRAPHIC_AD"],
  PROOF_OUTCOME: ["TESTIMONIAL_SOCIAL_PROOF", "BEFORE_AFTER"],
  DEMONSTRATION: ["SERVICE_EXPLAINER", "PRODUCT_UI_AD"],
  BEHIND_THE_SCENES: ["BRAND_STORY", "PHOTOGRAPHIC_AD"],
  EXPERT_TIP: ["EDUCATIONAL_CAROUSEL", "MARKETING_INFOGRAPHIC"],
  COMPARISON_GUIDE: ["COMPARISON", "PROBLEM_SOLUTION"],
  USE_CASE: ["PRODUCT_UI_AD", "FEATURE_BENEFIT_AD"],
  BEFORE_AFTER: ["BEFORE_AFTER", "TESTIMONIAL_SOCIAL_PROOF"],
  STORY_NARRATIVE: ["BRAND_STORY", "PHOTOGRAPHIC_AD"],
  COMMUNITY_SPOTLIGHT: ["LOCAL_BUSINESS_AD", "BRAND_STORY"],
  SEASONAL_FESTIVAL: ["SEASONAL_CAMPAIGN", "ANNOUNCEMENT"],
  INTERACTIVE_POLL: ["MARKETING_INFOGRAPHIC", "PHOTOGRAPHIC_AD"],
  CHECKLIST_GUIDE: ["EDUCATIONAL_CAROUSEL", "MARKETING_INFOGRAPHIC"],
  MISTAKE_LESSON: ["PROBLEM_SOLUTION", "EDUCATIONAL_CAROUSEL"],
  FAQ_ANSWERED: ["SERVICE_EXPLAINER", "MARKETING_INFOGRAPHIC"],
  PROCESS_TRANSPARENCY: ["SERVICE_EXPLAINER", "EDUCATIONAL_CAROUSEL"],
};

/**
 * Real, diversity-aware selection -- reuses the exact
 * selectLeastRecentlyUsed mechanism campaign-strategy-planner.ts /
 * creative-brief.ts already use for pillar/concept/objective rotation, so a
 * format doesn't dominate a 28-day calendar just because its opportunity
 * type recurs (candidates are scoped to THIS day's opportunity/objective;
 * `recentFormats` is the tenant's rolling recent-format history, so the
 * choice still varies day to day even when the same opportunity type comes
 * back around).
 */
export function resolveCreativeFormat(input: {
  opportunityType?: ContentOpportunityType | null;
  objective: ContentObjective;
  recentFormats?: CreativeFormat[];
}): CreativeFormat {
  const candidates = input.opportunityType
    ? OPPORTUNITY_TYPE_TO_CREATIVE_FORMATS[input.opportunityType]
    : OBJECTIVE_TO_CREATIVE_FORMATS[input.objective];
  return selectLeastRecentlyUsed(candidates, input.recentFormats ?? []);
}

/** The actual prompt paragraph handed to the treatment model -- concrete
 * and format-specific, replacing (for any caller that supplies a format) the
 * one-size-fits-all "prefer photography, minimal text" framing that used to
 * reach every post regardless of what the day's strategy called for. */
export function buildCreativeFormatDirective(format: CreativeFormat): string {
  const def = CREATIVE_FORMAT_REGISTRY[format];
  return `CREATIVE FORMAT FOR THIS POST: ${def.label} (${format}). ${def.directive}`;
}
