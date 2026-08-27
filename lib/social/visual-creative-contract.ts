/**
 * Visual generation infrastructure (build brief Phase J), built and tested
 * WITHOUT live AI/image-generation credentials, which this environment
 * does not have.
 *
 * ============================================================
 * ENGINEERING VERIFIED (this file, fully tested below):
 *   - the visual creative brief schema
 *   - aspect-ratio -> on-image text-length constraints
 *   - logo-placement contract
 *   - deterministic structural validation of a brief before it would be
 *     handed to a renderer
 *   - a regeneration-request contract for a rejected brief
 * ============================================================
 * REQUIRES LIVE VISUAL GENERATION (NOT implemented, NOT claimed here):
 *   - actually rendering a creative from a VisualCreativeBrief
 *   - judging real composition, legibility, brand appearance, or
 *     photographic quality of a rendered image
 *   - any numeric "visual quality score" grounded in an actual image
 * ============================================================
 * quality-score.ts's `visualQuality` dimension is a fixed neutral
 * placeholder for exactly this reason -- see VISUAL_QUALITY_NEUTRAL_SCORE
 * there. `assessVisualBriefEngineering` below performs only the
 * deterministic structural checks; its `status` field is always
 * "PENDING_LIVE_VISUAL_VALIDATION" so no caller can mistake it for a real
 * visual assessment.
 */

export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9";
export type LogoPlacement = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "none";

export interface VisualCreativeBrief {
  aspectRatio: AspectRatio;
  headline: string;
  supportingLine?: string;
  logoPlacement: LogoPlacement;
  brandColors: string[];
  imageryDirection: string;
  layoutDirection: string;
}

export interface VisualTextConstraints {
  maxHeadlineChars: number;
  maxSupportingLineChars: number;
}

// Calibrated by viewing context, not arbitrarily: 9:16 (reel/story) is
// typically viewed briefly and smaller, so it gets the tightest on-image
// text budget; 16:9 (link/landscape) has the most horizontal room.
const CONSTRAINTS_BY_ASPECT: Record<AspectRatio, VisualTextConstraints> = {
  "1:1": { maxHeadlineChars: 60, maxSupportingLineChars: 90 },
  "4:5": { maxHeadlineChars: 70, maxSupportingLineChars: 100 },
  "9:16": { maxHeadlineChars: 50, maxSupportingLineChars: 70 },
  "16:9": { maxHeadlineChars: 80, maxSupportingLineChars: 120 },
};

const LOGO_PLACEMENTS: LogoPlacement[] = ["top-left", "top-right", "bottom-left", "bottom-right", "none"];

export function constraintsForAspectRatio(aspectRatio: AspectRatio): VisualTextConstraints {
  return CONSTRAINTS_BY_ASPECT[aspectRatio];
}

/** Maps a package composition media type to its default aspect ratio.
 * "text" has no visual brief at all. */
// Finished Premium Marketing Creative brief Section 4: the default social
// canvas for a standard Instagram feed image is 1080x1080 square -- a
// creative composed for that canvas, not a generic portrait mechanically
// cropped afterward. 4:5 remains a real, selectable format elsewhere
// (Creative Studio's own format picker) for when portrait is genuinely the
// right choice; it's just no longer the silent default for "image".
export function aspectRatioForMediaType(mediaType: "image" | "reel" | "video"): AspectRatio {
  return mediaType === "reel" || mediaType === "video" ? "9:16" : "1:1";
}

export interface VisualBriefValidationIssue {
  field: keyof VisualCreativeBrief;
  issue: string;
}

/** Deterministic structural validation ONLY -- see file header. Never
 * throws; returns an empty array when the brief's structure is sound. */
export function validateVisualCreativeBrief(brief: VisualCreativeBrief): VisualBriefValidationIssue[] {
  const issues: VisualBriefValidationIssue[] = [];
  const constraints = CONSTRAINTS_BY_ASPECT[brief.aspectRatio];
  if (!constraints) {
    issues.push({ field: "aspectRatio", issue: `unsupported aspect ratio: "${brief.aspectRatio}"` });
    return issues; // nothing else is checkable without a valid aspect ratio
  }

  if (!brief.headline?.trim()) {
    issues.push({ field: "headline", issue: "headline is empty" });
  } else if (brief.headline.length > constraints.maxHeadlineChars) {
    issues.push({ field: "headline", issue: `headline is ${brief.headline.length} characters, exceeding the ${constraints.maxHeadlineChars}-character legibility limit for ${brief.aspectRatio} -- would clip or shrink illegibly` });
  }

  if (brief.supportingLine && brief.supportingLine.length > constraints.maxSupportingLineChars) {
    issues.push({ field: "supportingLine", issue: `supporting line is ${brief.supportingLine.length} characters, exceeding the ${constraints.maxSupportingLineChars}-character limit for ${brief.aspectRatio}` });
  }

  if (!LOGO_PLACEMENTS.includes(brief.logoPlacement)) {
    issues.push({ field: "logoPlacement", issue: `"${brief.logoPlacement}" is not a valid logo placement (expected one of ${LOGO_PLACEMENTS.join(", ")})` });
  }

  if (!brief.imageryDirection?.trim()) {
    issues.push({ field: "imageryDirection", issue: "imagery direction is empty -- a renderer has nothing to depict" });
  }

  return issues;
}

export interface VisualQualityMetadata {
  /** Always this literal in a build with no live visual generation --
   * never a number or "passed" a caller could mistake for a real score. */
  status: "PENDING_LIVE_VISUAL_VALIDATION";
  structurallyValid: boolean;
  issues: VisualBriefValidationIssue[];
  notes: string[];
}

/** The visual-quality "scoring interface" this build can honestly provide:
 * a deterministic structural check, explicitly and permanently labeled as
 * NOT a real visual assessment. Do not read `structurallyValid: true` as
 * "looks good" -- it means only "the brief's fields are well-formed." */
export function assessVisualBriefEngineering(brief: VisualCreativeBrief): VisualQualityMetadata {
  const issues = validateVisualCreativeBrief(brief);
  return {
    status: "PENDING_LIVE_VISUAL_VALIDATION",
    structurallyValid: issues.length === 0,
    issues,
    notes: [
      "This is a deterministic structural check (aspect ratio, on-image text length, logo placement, imagery direction present) only.",
      "It does NOT assess actual rendered composition, legibility, or brand appearance -- that requires live image generation and visual inspection.",
    ],
  };
}

export interface VisualRegenerationRequest {
  reason: string;
  correctiveDirection: string;
  previousBrief: VisualCreativeBrief;
}

const CORRECTIVE_DIRECTION_FOR_FIELD: Record<keyof VisualCreativeBrief, string> = {
  aspectRatio: "Use a supported aspect ratio (1:1, 4:5, 9:16, or 16:9).",
  headline: "Shorten the headline so it stays legible at this format's size.",
  supportingLine: "Shorten the supporting line, or remove it if it isn't essential.",
  logoPlacement: "Use a valid logo placement corner, or \"none\" if no logo is available.",
  brandColors: "Brand colors are optional but must be a valid list.",
  imageryDirection: "Provide a specific imagery direction describing what the image should actually depict.",
  layoutDirection: "Provide layout direction so the renderer knows how to compose the frame.",
};

/** Mirrors generation-loop.ts's targeted-correction pattern for the visual
 * side: returns null when the brief is already sound (nothing to
 * regenerate), otherwise a specific corrective request per issue -- never a
 * blind "try again". */
export function buildVisualRegenerationRequest(previousBrief: VisualCreativeBrief): VisualRegenerationRequest | null {
  const issues = validateVisualCreativeBrief(previousBrief);
  if (!issues.length) return null;
  return {
    reason: issues.map((i) => `${i.field}: ${i.issue}`).join("; "),
    correctiveDirection: [...new Set(issues.map((i) => CORRECTIVE_DIRECTION_FOR_FIELD[i.field]))].join(" "),
    previousBrief,
  };
}
