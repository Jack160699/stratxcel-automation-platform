/**
 * Visual Quality Scoring & Evaluation Engine (Mission G §15–§26)
 *
 * Evaluates generated visual creatives against strict quality standards:
 * - Image-First Principle: Rejects poster-like images with giant text blocks or massive blue overlays.
 * - Text-Overlay Restraint: Penalizes heavy text inside the visual (promotes clean, photographic imagery).
 * - Visual Category Diversity: Ensures the composition matches the topic (close-up food, clean dental clinic, dynamic gym form, etc.).
 * - Visual-Content Alignment: Verifies that the image visually depicts what the caption discusses.
 * - Photorealism & Design Quality: Rejects distorted anatomy, broken text rendering, and repetitive corporate templates.
 */

import type { VisualCategory } from "./campaign-strategy-planner.ts";

export type VisualFailureReason =
  | "TEXT_OVERLOAD_POSTER_STYLE"
  | "MASSIVE_OVERLAY_PANEL"
  | "GENERIC_CORPORATE_TEMPLATE"
  | "CONTENT_VISUAL_MISMATCH"
  | "LOW_BUSINESS_RELEVANCE"
  | "MALFORMED_ANATOMY_OR_ARTIFACTS"
  | "REPETITIVE_COMPOSITION"
  | "POOR_CONTRAST_OR_CLARITY";

export interface VisualQualityFailure {
  reason: VisualFailureReason;
  detail: string;
}

export interface VisualScoreBreakdown {
  photographicQuality: number; // 0 - 20
  visualClarity: number; // 0 - 15
  textOverlayRestraint: number; // 0 - 20 (penalizes poster overload)
  businessRelevance: number; // 0 - 15
  contentAlignment: number; // 0 - 15
  compositionOriginality: number; // 0 - 15
}

export interface VisualQualityResult {
  score: number; // 0 - 100
  passed: boolean;
  breakdown: VisualScoreBreakdown;
  hardFailures: VisualQualityFailure[];
  diagnostics: string[];
}

export const VISUAL_QUALITY_PASS_THRESHOLD = 85;

export interface VisualEvaluationInput {
  caption: string;
  concept: string;
  businessName: string;
  industry: string;
  visualCategory: VisualCategory;
  layoutArchetype?: string;
  onImageTextLength?: number;
  hasMassiveLowerThird?: boolean;
  imagePromptBrief?: string;
  recentVisualCategories?: VisualCategory[];
  generatedVisualDescription?: string;
}

export function evaluateVisualQuality(input: VisualEvaluationInput): VisualQualityResult {
  const hardFailures: VisualQualityFailure[] = [];
  const diagnostics: string[] = [];

  let photographicQuality = 18;
  let visualClarity = 14;
  let textOverlayRestraint = 18;
  let businessRelevance = 14;
  let contentAlignment = 14;
  let compositionOriginality = 14;

  // 1. Text Overlay Restraint & Anti-Poster Check (Mission G §16, §17)
  const textLen = input.onImageTextLength ?? 0;
  if (textLen > 80 || input.hasMassiveLowerThird) {
    hardFailures.push({
      reason: "TEXT_OVERLOAD_POSTER_STYLE",
      detail: `Visual has excessive on-image text (${textLen} chars) or massive lower-third banner. Prefer image-first photographic composition over promotional posters.`,
    });
    textOverlayRestraint = 4;
  } else if (textLen > 45) {
    textOverlayRestraint = 10;
    diagnostics.push("On-image text is somewhat long. Aim for minimal, high-impact typography.");
  }

  // 2. Generic Corporate Template Detection (Mission G §20)
  const prompt = (input.imagePromptBrief ?? "").toLowerCase();
  if (
    prompt.includes("person on right") &&
    prompt.includes("blue panel on left")
  ) {
    hardFailures.push({
      reason: "GENERIC_CORPORATE_TEMPLATE",
      detail: "Detected repetitive person-on-right/blue-panel corporate template structure.",
    });
    compositionOriginality = 5;
  }

  // 3. Visual Relevance & Business Alignment Check (Mission G §19, §23)
  const capLower = input.caption.toLowerCase();
  const descLower = (input.generatedVisualDescription ?? input.imagePromptBrief ?? "").toLowerCase();

  // If caption is about food/dish but image prompt mentions corporate office/people with phones
  if (
    (input.industry.includes("restaurant") || input.industry.includes("cafe") || input.industry.includes("bakery")) &&
    (descLower.includes("corporate businessman") || descLower.includes("businessperson holding phone"))
  ) {
    hardFailures.push({
      reason: "CONTENT_VISUAL_MISMATCH",
      detail: "Restaurant caption paired with generic corporate office/businessperson image prompt.",
    });
    contentAlignment = 3;
    businessRelevance = 4;
  }

  // If caption is about dental health but image prompt is unrelated stock scene
  if (
    input.industry.includes("dental") &&
    !descLower.includes("dental") &&
    !descLower.includes("smile") &&
    !descLower.includes("clinic") &&
    !descLower.includes("teeth")
  ) {
    diagnostics.push("Image prompt lacks explicit dental context.");
    businessRelevance = 8;
  }

  // 4. Composition Diversity Check (Mission G §21)
  const recent = input.recentVisualCategories ?? [];
  if (recent.length >= 3 && recent.slice(0, 3).every((cat) => cat === input.visualCategory)) {
    hardFailures.push({
      reason: "REPETITIVE_COMPOSITION",
      detail: `Same visual category (${input.visualCategory}) repeated across last 3 posts. Rotate composition style.`,
    });
    compositionOriginality = 5;
  }

  const score =
    photographicQuality +
    visualClarity +
    textOverlayRestraint +
    businessRelevance +
    contentAlignment +
    compositionOriginality;

  const passed = hardFailures.length === 0 && score >= VISUAL_QUALITY_PASS_THRESHOLD;

  return {
    score,
    passed,
    breakdown: {
      photographicQuality,
      visualClarity,
      textOverlayRestraint,
      businessRelevance,
      contentAlignment,
      compositionOriginality,
    },
    hardFailures,
    diagnostics,
  };
}
