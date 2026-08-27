/**
 * Premium visual vocabulary per industry (Premium Creative Intelligence
 * brief Section 12): each industry gets its own visual grammar so a
 * restaurant, a gym, and a real-estate developer never converge on the
 * same generic "AI startup template" look. These are STARTING POINTS fed
 * into the Creative Treatment generation prompt, not rigid per-post
 * templates -- the treatment step still has to pick which subject/
 * technique actually fits this business's specific concept.
 *
 * Pure data, no AI call. Extends (does not replace) industry-taxonomy.ts's
 * one-line `visualStyle` -- that stays the compact summary used by the
 * existing image-prompt path; this is the deeper vocabulary the new
 * Creative Treatment step draws from.
 */

import type { IndustryCategory } from "./industry-taxonomy.ts";

export interface IndustryVisualVocabulary {
  subjects: string[];
  techniques: string[];
  moods: string[];
  compositionIdeas: string[];
  avoid: string[];
}

const VOCABULARY: Record<IndustryCategory, IndustryVisualVocabulary> = {
  restaurant: {
    subjects: ["plated dish close-up", "ingredients mid-prep", "chef finishing a plate", "steam/heat off a fresh dish", "dining room ambience", "hands sharing a table"],
    techniques: ["shallow depth of field on the hero dish", "natural window light", "top-down flat lay for texture", "45-degree plating angle"],
    moods: ["appetite", "warmth", "conviviality", "craft"],
    compositionIdeas: ["single dish as the entire frame", "hands reaching into frame", "chef in soft-focus background behind a sharp plate"],
    avoid: ["studio-white seamless background", "stock-photo smiling waitstaff", "menu-as-graphic-design instead of real food"],
  },
  salon: {
    subjects: ["hair texture/movement close-up", "hands mid-styling", "mirror reflection portrait", "before/after profile", "product on a styling station"],
    techniques: ["soft directional beauty lighting", "shallow depth of field on hair detail", "mirror framing", "editorial portraiture"],
    moods: ["transformation", "confidence", "elegance", "self-care calm"],
    compositionIdeas: ["profile shot showing hair silhouette", "split-frame before/after", "extreme close-up on styling detail"],
    avoid: ["generic salon-chair stock photo", "over-lit flat beauty-blog look", "faces obscured when the concept is a transformation reveal"],
  },
  gym: {
    subjects: ["mid-rep movement", "coach correcting form", "hands chalked on a bar", "sweat/exertion close-up", "group class energy", "quiet early-morning training moment"],
    techniques: ["frozen-motion action framing", "low angle for power", "kinetic blur on background elements", "high-contrast gym lighting"],
    moods: ["intensity", "discipline", "camaraderie", "raw effort"],
    compositionIdeas: ["subject mid-motion with implied direction of movement", "coach + client two-shot showing correction", "tight crop on hands/grip/form detail"],
    avoid: ["posed after-workout smile at camera", "stock gym with nobody actually training", "generic dumbbell-rack-as-hero-subject"],
  },
  clinic: {
    subjects: ["practitioner with patient (age-appropriate, real interaction)", "clean instrument/equipment detail", "calm waiting/consultation moment", "hands demonstrating care"],
    techniques: ["soft even clinical lighting", "neutral calming color grading", "gentle shallow depth of field"],
    moods: ["trust", "calm", "reassurance", "competence"],
    compositionIdeas: ["practitioner and patient at eye level, not looming", "hands-focused detail shot of care being given", "clean environment as supporting context, not the subject"],
    avoid: ["stethoscope-around-neck cliche stock photo", "exaggerated pain/distress imagery", "sterile-to-the-point-of-cold framing"],
  },
  retail: {
    subjects: ["product hero shot", "product-in-use/worn/styled", "texture/material close-up", "shelf or rack in context", "hands selecting/holding product"],
    techniques: ["controlled studio-quality product lighting", "styled context (not seamless white unless intentional)", "macro texture detail"],
    moods: ["desirability", "quality", "seasonal freshness"],
    compositionIdeas: ["single hero product with generous negative space", "product-in-context lifestyle framing", "flat-lay grouping for a collection"],
    avoid: ["cluttered multi-product grid with no hierarchy", "harsh on-camera flash look", "watermark-style price-tag graphics"],
  },
  real_estate: {
    subjects: ["exterior architecture at golden hour", "interior with natural light", "spatial/scale-establishing wide shot", "amenity detail", "neighborhood context"],
    techniques: ["wide architectural framing", "leading lines toward the structure", "natural or warm interior light", "true-to-scale perspective (no fisheye exaggeration)"],
    moods: ["aspiration", "space", "light", "premium calm"],
    compositionIdeas: ["low-angle hero shot of the facade", "interior shot with a clear sightline through the space", "amenity as a human-scale detail, not an isolated render"],
    avoid: ["generic stock skyline with no relation to the actual property", "over-saturated HDR render look", "empty renders with no sense of scale or light"],
  },
  local_service: {
    subjects: ["hands mid-repair/task", "tools in use", "before/after of the actual work", "technician in real working context"],
    techniques: ["documentary/on-the-job framing", "practical work lighting (not staged studio)", "tight detail crop on the fix"],
    moods: ["competence", "reliability", "craftsmanship", "resolved urgency"],
    compositionIdeas: ["hands + tool + work surface as the frame", "before/after split showing the actual problem and resolution", "technician mid-task, not posed"],
    avoid: ["staged handshake-in-front-of-van stock photo", "generic tool-flat-lay with no work context", "overly dramatic emergency lighting when the concept is routine maintenance"],
  },
  generic: {
    subjects: ["the actual product/service/team in real use", "a genuine moment of the business operating"],
    techniques: ["natural, unstaged-feeling framing", "lighting appropriate to the real environment"],
    moods: ["authenticity"],
    compositionIdeas: ["single clear subject with a defined focal point"],
    avoid: ["generic stock imagery unrelated to this specific business"],
  },
};

export function getIndustryVisualVocabulary(category: IndustryCategory): IndustryVisualVocabulary {
  return VOCABULARY[category];
}

/** Compact prompt-ready summary -- full arrays would bloat the treatment
 * prompt, so this samples a few of each to steer without overwhelming. */
export function summarizeIndustryVisualVocabulary(vocab: IndustryVisualVocabulary): string {
  return [
    `Subjects to consider: ${vocab.subjects.join("; ")}.`,
    `Techniques: ${vocab.techniques.join("; ")}.`,
    `Mood: ${vocab.moods.join(", ")}.`,
    `Composition ideas: ${vocab.compositionIdeas.join("; ")}.`,
    `Avoid: ${vocab.avoid.join("; ")}.`,
  ].join(" ");
}
