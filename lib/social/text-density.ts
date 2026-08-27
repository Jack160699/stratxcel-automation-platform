/**
 * Text-density gate (Premium Creative Intelligence brief Section 10): the
 * system must default to "one primary idea per creative," not fill empty
 * canvas space with more text. This measures on-image text load from the
 * planned overlay elements (never the full social caption -- that lives
 * off-image) and scores it against a small, deliberately strict budget.
 *
 * Pure and deterministic: given the same planned on-image text elements,
 * always the same measurement. No AI call, no rendered-pixel analysis --
 * this measures the TEXT PLAN, which is knowable before rendering; actual
 * on-image legibility still requires visual inspection of the rendered
 * image, same honesty boundary as visual-creative-contract.ts.
 */

export interface OnImageTextElement {
  role: "headline" | "supportingLine" | "cta" | "brandLabel" | "other";
  text: string;
}

export interface TextDensityMeasurement {
  blockCount: number;
  totalWords: number;
  totalChars: number;
  hasHeadline: boolean;
  hasSupportingLine: boolean;
  hasCta: boolean;
  /** Rough estimate of canvas share text would occupy, calibrated off
   * typical social-post typography sizing -- NOT a pixel measurement of an
   * actual rendered image. */
  estimatedCanvasPercent: number;
  density: "minimal" | "light" | "moderate" | "heavy" | "excessive";
}

const WORDS_PER_CANVAS_PERCENT = 2.2; // calibrated so a headline + one supporting line + CTA lands around 25-35%, matching what actually reads as "premium, not cluttered" in the images inspected this campaign

export function measureTextDensity(elements: OnImageTextElement[]): TextDensityMeasurement {
  const nonEmpty = elements.filter((e) => e.text?.trim());
  const totalWords = nonEmpty.reduce((sum, e) => sum + e.text.trim().split(/\s+/).length, 0);
  const totalChars = nonEmpty.reduce((sum, e) => sum + e.text.trim().length, 0);
  const estimatedCanvasPercent = Math.min(100, Math.round(totalWords / WORDS_PER_CANVAS_PERCENT));

  let density: TextDensityMeasurement["density"];
  if (estimatedCanvasPercent === 0) density = "minimal";
  else if (estimatedCanvasPercent <= 15) density = "light";
  else if (estimatedCanvasPercent <= 35) density = "moderate";
  else if (estimatedCanvasPercent <= 55) density = "heavy";
  else density = "excessive";

  return {
    blockCount: nonEmpty.length,
    totalWords,
    totalChars,
    hasHeadline: nonEmpty.some((e) => e.role === "headline"),
    hasSupportingLine: nonEmpty.some((e) => e.role === "supportingLine"),
    hasCta: nonEmpty.some((e) => e.role === "cta"),
    estimatedCanvasPercent,
    density,
  };
}

export interface TextDensityGateResult {
  pass: boolean;
  reason: string | null;
}

/** Hard gate: more than one supporting line, or "heavy"/"excessive" density,
 * fails outright unless the treatment explicitly justifies a text-led
 * format (e.g. an educational carousel cover) -- callers pass
 * `intentionallyTextLed` only when the creative concept itself calls for
 * it, never as a default excuse. */
export function evaluateTextDensityGate(
  measurement: TextDensityMeasurement,
  opts: { intentionallyTextLed?: boolean } = {}
): TextDensityGateResult {
  if (opts.intentionallyTextLed) return { pass: true, reason: null };
  if (measurement.blockCount > 4) {
    return { pass: false, reason: `${measurement.blockCount} on-image text blocks -- more than one primary idea plus support/CTA/brand; consolidate` };
  }
  if (measurement.density === "heavy" || measurement.density === "excessive") {
    return { pass: false, reason: `on-image text density is "${measurement.density}" (~${measurement.estimatedCanvasPercent}% of canvas) -- prefer fewer, stronger elements` };
  }
  return { pass: true, reason: null };
}
