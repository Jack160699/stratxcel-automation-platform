/**
 * Premium creative score (Premium Creative Intelligence brief Section 27):
 * a new 100-point rubric that judges the CREATIVE, not just the caption.
 * Additive to, not a replacement for, quality-score.ts (which stays the
 * production text-quality gate and whose calibration this module must
 * never be used to second-guess -- see build brief Section 28: "do not
 * game the scorer").
 *
 * ============================================================
 * GATING POLICY DECISION ("FINAL PRODUCTION QUALITY COMPLETION LOOP"
 * brief Section 16 -- ADVISORY, not enforced, and here is why):
 *
 * quality-score.ts's QUALITY_PASS_THRESHOLD (90, text-only, fully
 * automated) remains the SOLE ENFORCED production gate -- unchanged. A
 * creative that fails it is never generated as an image at all, exactly
 * as before this campaign.
 *
 * PREMIUM_PASS_THRESHOLD is advisory only and is NOT wired into
 * package-autopilot.ts's or lib/image-generation/service.ts's pass/fail
 * decision anywhere. This is a considered decision, not an oversight:
 * 40 of this rubric's 100 points (Visual Art Direction, Composition,
 * Typography, Image Quality) are architecturally incapable of being
 * computed without a human (or a real vision-model judge, which does not
 * exist in this codebase) actually looking at the rendered image --
 * exactly the boundary visual-creative-contract.ts already draws for the
 * same reason. Enforcing PREMIUM_PASS_THRESHOLD as a hard production gate
 * today would force one of two dishonest choices: block every single
 * image (since visual dimensions start `null`/PENDING_VISUAL_INSPECTION),
 * or fabricate visual scores to let generation through -- both violate
 * the "never fabricate a visual assessment" principle this codebase has
 * held since quality-score.ts's own VISUAL_QUALITY_NEUTRAL_SCORE was
 * introduced. The premium score remains genuinely useful as: a benchmark/
 * QA instrument (this is how the real campaigns were evaluated), and,
 * once a human reviewer calls recordVisualInspection with real numbers,
 * a legitimate advisory signal for that reviewer -- but never an
 * automated gate on its own.
 *
 * Revisit this decision if/when a trustworthy automated visual-quality
 * judge exists for the remaining 40 points; until then, this split
 * (automated text gate enforced, full creative score advisory) is the
 * evidence-based policy.
 * ============================================================
 *
 * Weights: Strategy 10, Business Specificity 10, Creative Concept 10,
 * Copy 10, Brand Fit 10, Visual Art Direction 15, Composition 10,
 * Typography 5, Image Quality 10, Originality 5, Commercial Usefulness 5.
 *
 * Six of eleven dimensions (Strategy, Business Specificity, Creative
 * Concept, Copy, Brand Fit, Originality, Commercial Usefulness -- 60 pts)
 * are computable from the treatment/copy text alone and scored here
 * automatically. The remaining four (Visual Art Direction, Composition,
 * Typography, Image Quality -- 40 pts) can only be honestly judged by
 * looking at the actual rendered image -- exactly the boundary
 * visual-creative-contract.ts already draws. Those fields stay `null` with
 * status PENDING_VISUAL_INSPECTION until `recordVisualInspection` is
 * called with real scores from actually viewing the rendered creative.
 * No caller may treat a null visual dimension as a zero or as passing.
 */

import type { CreativeTreatment } from "./creative-treatment.ts";
import type { CreativeBrief } from "./creative-brief.ts";
import type { TextDensityMeasurement } from "./text-density.ts";
import { textSimilarity } from "./content-diversity.ts";

export interface PremiumScoreBreakdown {
  strategy: number;
  businessSpecificity: number;
  creativeConcept: number;
  copy: number;
  brandFit: number;
  visualArtDirection: number | null;
  composition: number | null;
  typography: number | null;
  imageQuality: number | null;
  originality: number;
  commercialUsefulness: number;
}

export const PREMIUM_DIMENSION_WEIGHTS: Record<keyof PremiumScoreBreakdown, number> = {
  strategy: 10,
  businessSpecificity: 10,
  creativeConcept: 10,
  copy: 10,
  brandFit: 10,
  visualArtDirection: 15,
  composition: 10,
  typography: 5,
  imageQuality: 10,
  originality: 5,
  commercialUsefulness: 5,
};

export const PREMIUM_PASS_THRESHOLD = 90;
export const PREMIUM_PREFERRED_THRESHOLD = 93;
export const PREMIUM_EXCEPTIONAL_THRESHOLD = 95;

export interface PremiumScoreResult {
  breakdown: PremiumScoreBreakdown;
  /** Sum of the six auto-scorable dimensions -- meaningful before an image
   * even exists, for early triage. */
  textDerivableScore: number;
  textDerivableMax: number;
  /** Full 100-point total -- only meaningful once visual dimensions are
   * filled in; null while any visual dimension is still pending. */
  totalScore: number | null;
  status: "PENDING_VISUAL_INSPECTION" | "COMPLETE";
  diagnostics: string[];
}

const GENERIC_FILLER = [
  "experience excellence", "quality you can trust", "contact us today", "don't miss out",
  "best in class", "unmatched service", "state of the art", "world class",
];

function containsGenericFiller(text: string): boolean {
  const lower = text.toLowerCase();
  return GENERIC_FILLER.some((phrase) => lower.includes(phrase));
}

function scoreStrategy(treatment: CreativeTreatment, brief: CreativeBrief): number {
  let score = PREMIUM_DIMENSION_WEIGHTS.strategy;
  if (!treatment.audienceTension || treatment.audienceTension.trim().length < 15) score -= 4;
  if (!treatment.cta.rationale || treatment.cta.rationale.trim().length < 10) score -= 3;
  if (treatment.cta.needed && brief.objective && !treatment.cta.rationale.toLowerCase().includes(brief.objective.toLowerCase().slice(0, 4))) {
    // soft signal only, not a hard requirement -- CTA rationale doesn't have to
    // literally name the objective, so this is a small deduction not a wipeout
  }
  return Math.max(0, score);
}

function scoreBusinessSpecificity(treatment: CreativeTreatment, brief: CreativeBrief): number {
  const haystack = `${treatment.concept} ${treatment.story} ${treatment.whyThisBusiness} ${treatment.subject}`.toLowerCase();
  const factsUsed = brief.verifiedFacts.filter((fact) => {
    const significantWords = fact.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    return significantWords.some((w) => haystack.includes(w));
  }).length;
  const max = PREMIUM_DIMENSION_WEIGHTS.businessSpecificity;
  if (!brief.verifiedFacts.length) return Math.round(max * 0.6); // no facts available isn't the treatment's fault
  const ratio = Math.min(1, factsUsed / Math.min(3, brief.verifiedFacts.length));
  return Math.round(max * (0.4 + 0.6 * ratio));
}

function scoreCreativeConcept(treatment: CreativeTreatment, brief: CreativeBrief): number {
  let score = PREMIUM_DIMENSION_WEIGHTS.creativeConcept;
  if (treatment.concept.trim().toLowerCase() === brief.concept.trim().toLowerCase()) score -= 6; // should already be blocked upstream, but defense in depth
  if (containsGenericFiller(treatment.concept) || containsGenericFiller(treatment.story)) score -= 4;
  if (treatment.concept.trim().split(/\s+/).length < 5) score -= 3;
  if (!treatment.whyStopScroll || treatment.whyStopScroll.trim().length < 15) score -= 3;
  return Math.max(0, score);
}

function scoreCopy(treatment: CreativeTreatment, generatedCaption: string | null): number {
  let score = PREMIUM_DIMENSION_WEIGHTS.copy;
  if (generatedCaption) {
    if (containsGenericFiller(generatedCaption)) score -= 5;
    if (generatedCaption.trim().length < 20) score -= 4;
  }
  const headline = treatment.textHierarchy.find((e) => e.role === "headline")?.text ?? "";
  if (headline && containsGenericFiller(headline)) score -= 3;
  return Math.max(0, score);
}

function scoreBrandFit(treatment: CreativeTreatment): number {
  let score = PREMIUM_DIMENSION_WEIGHTS.brandFit;
  if (!treatment.brandApplication || treatment.brandApplication.trim().length < 10) score -= 5;
  if (!treatment.colorDirection || treatment.colorDirection.trim().length < 8) score -= 3;
  return Math.max(0, score);
}

function scoreOriginality(treatment: CreativeTreatment, recentConceptTexts: string[]): number {
  const max = PREMIUM_DIMENSION_WEIGHTS.originality;
  if (!recentConceptTexts.length) return max;
  const best = Math.max(0, ...recentConceptTexts.map((c) => textSimilarity(treatment.concept, c)));
  if (best >= 0.6) return 0;
  if (best >= 0.4) return Math.round(max * 0.4);
  if (best >= 0.25) return Math.round(max * 0.7);
  return max;
}

function scoreCommercialUsefulness(treatment: CreativeTreatment): number {
  let score = PREMIUM_DIMENSION_WEIGHTS.commercialUsefulness;
  if (treatment.cta.needed && (!treatment.cta.text || treatment.cta.text.trim().length < 3)) score -= 3;
  if (!treatment.whyThisBusiness || treatment.whyThisBusiness.trim().length < 10) score -= 2;
  return Math.max(0, score);
}

export function scorePremiumCreative(input: {
  treatment: CreativeTreatment;
  brief: CreativeBrief;
  generatedCaption?: string | null;
  textDensity?: TextDensityMeasurement;
  recentConceptTexts?: string[];
}): PremiumScoreResult {
  const breakdown: PremiumScoreBreakdown = {
    strategy: scoreStrategy(input.treatment, input.brief),
    businessSpecificity: scoreBusinessSpecificity(input.treatment, input.brief),
    creativeConcept: scoreCreativeConcept(input.treatment, input.brief),
    copy: scoreCopy(input.treatment, input.generatedCaption ?? null),
    brandFit: scoreBrandFit(input.treatment),
    visualArtDirection: null,
    composition: null,
    typography: null,
    imageQuality: null,
    originality: scoreOriginality(input.treatment, input.recentConceptTexts ?? []),
    commercialUsefulness: scoreCommercialUsefulness(input.treatment),
  };

  const textDerivableKeys: Array<keyof PremiumScoreBreakdown> = [
    "strategy", "businessSpecificity", "creativeConcept", "copy", "brandFit", "originality", "commercialUsefulness",
  ];
  const textDerivableScore = textDerivableKeys.reduce((sum, k) => sum + (breakdown[k] ?? 0), 0);
  const textDerivableMax = textDerivableKeys.reduce((sum, k) => sum + PREMIUM_DIMENSION_WEIGHTS[k], 0);

  const diagnostics: string[] = [];
  if (input.textDensity && (input.textDensity.density === "heavy" || input.textDensity.density === "excessive")) {
    diagnostics.push(`text density is "${input.textDensity.density}" (~${input.textDensity.estimatedCanvasPercent}% of canvas) -- this alone will cap Composition/Visual Art Direction once visually inspected`);
  }

  return {
    breakdown,
    textDerivableScore,
    textDerivableMax,
    totalScore: null,
    status: "PENDING_VISUAL_INSPECTION",
    diagnostics,
  };
}

export interface VisualInspectionScores {
  visualArtDirection: number;
  composition: number;
  typography: number;
  imageQuality: number;
  notes: string[];
}

/** Merges real, human-eyes visual-inspection scores (0..weight for each
 * dimension) into a prior PremiumScoreResult, completing the total. Never
 * call this with guessed/estimated numbers -- these four dimensions exist
 * specifically because they require actually looking at the rendered
 * image; a fabricated number here defeats the entire point of the
 * PENDING_VISUAL_INSPECTION boundary. */
export function recordVisualInspection(prior: PremiumScoreResult, visual: VisualInspectionScores): PremiumScoreResult {
  const clamped = {
    visualArtDirection: Math.max(0, Math.min(PREMIUM_DIMENSION_WEIGHTS.visualArtDirection, visual.visualArtDirection)),
    composition: Math.max(0, Math.min(PREMIUM_DIMENSION_WEIGHTS.composition, visual.composition)),
    typography: Math.max(0, Math.min(PREMIUM_DIMENSION_WEIGHTS.typography, visual.typography)),
    imageQuality: Math.max(0, Math.min(PREMIUM_DIMENSION_WEIGHTS.imageQuality, visual.imageQuality)),
  };
  const breakdown: PremiumScoreBreakdown = { ...prior.breakdown, ...clamped };
  const totalScore = Object.entries(breakdown).reduce((sum, [, v]) => sum + (v ?? 0), 0);
  return {
    ...prior,
    breakdown,
    totalScore,
    status: "COMPLETE",
    diagnostics: [...prior.diagnostics, ...visual.notes],
  };
}
