/**
 * Deterministic typography overlay (Premium Creative Intelligence brief
 * Section 24): "where the current rendering architecture supports
 * reliable text overlay, prefer GENERATED VISUAL + PROGRAMMATIC TYPOGRAPHY
 * over relying on generative image models for long text rendering."
 *
 * This is that overlay layer -- real, working, pixel-level compositing via
 * `sharp` (already a project dependency): build an SVG containing the
 * headline/supporting-line/CTA/brand-label as actual <text> elements with
 * a legibility scrim behind them, positioned by role and aspect ratio,
 * then rasterize + composite it onto the AI-generated base photograph.
 * This removes the single biggest source of image-model text errors (the
 * "Electctic" typo found and confirmed self-correcting-but-still-real
 * during visual inspection of the real-generation campaign) for the
 * business name, headline, and CTA -- the image model is used ONLY for
 * photography/scene/atmosphere, never for long text rendering.
 *
 * HONEST LIMITATION (v1): sharp's SVG rasterizer resolves font-family
 * names against whatever fonts are actually installed on the host running
 * the composite. Locally that's whatever fonts are on this machine; on
 * Vercel's serverless runtime it will fall back to that runtime's base
 * fonts unless real brand font files are embedded as base64 @font-face
 * data in the SVG (not done here -- no brand font files exist for these
 * fixtures). Layout, hierarchy, wrapping, legibility scrim, and exact text
 * content are real and verified; exact typeface fidelity across
 * environments is the natural next step, not claimed as solved here.
 */

import sharp from "sharp";
import type { OnImageTextElement } from "./text-density.ts";
import type { TypographyPersonality } from "./brand-visual-dna.ts";

const FONT_STACK: Record<TypographyPersonality, string> = {
  "editorial-serif": "Georgia, 'Times New Roman', serif",
  "confident-display": "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
  "clean-geometric": "'Segoe UI', Helvetica, Arial, sans-serif",
  "warm-humanist": "'Trebuchet MS', Verdana, sans-serif",
  "bold-condensed": "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
};

/** Relative luminance (0=black..1=white) for a #RRGGBB hex color -- used
 * only to pick a legible text color against a solid fill, not a full
 * WCAG contrast-ratio implementation. Real bug this exists to prevent:
 * a light accentColor (e.g. a brand's secondary white/near-white) used as
 * the CTA pill fill, paired with the same white textColor used for the
 * rest of the on-photo text, rendered a genuinely invisible white-on-white
 * button -- found during visual inspection of this campaign's own real
 * output (clinic#3's "Book a consultation" pill). */
function hexLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1]!, 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Legible text color for a solid fill: near-black on a light fill,
 * near-white on a dark one. Falls back to white (safe on most photos/
 * dark scrims) when the fill isn't a parseable hex. */
function legibleTextColorFor(fillHex: string | null): string {
  if (!fillHex) return "#FFFFFF";
  const luminance = hexLuminance(fillHex);
  if (luminance === null) return "#FFFFFF";
  return luminance > 0.6 ? "#111111" : "#FFFFFF";
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Rough word-wrap: no real font-metrics access at SVG-build time, so this
 * estimates average glyph width as a fraction of font size -- calibrated
 * conservatively (wide) so wrapped lines under-fill rather than overflow
 * the safe width. */
function wrapText(text: string, maxWidthPx: number, fontSizePx: number): string[] {
  const avgCharWidth = fontSizePx * 0.56;
  const maxChars = Math.max(4, Math.floor(maxWidthPx / avgCharWidth));
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface TextOverlayLayoutInput {
  width: number;
  height: number;
  elements: OnImageTextElement[];
  typographyPersonality: TypographyPersonality;
  /** Text color chosen for contrast against the scrim, not the raw brand
   * color, which may not be legible on a photograph -- callers pass a
   * near-white or near-black based on the scrim's own tone. */
  textColor: string;
  scrimColor: string;
  accentColor: string | null;
  businessName: string;
}

interface PlacedBlock {
  role: OnImageTextElement["role"];
  lines: string[];
  fontSize: number;
  x: number;
  yStart: number;
  lineHeight: number;
  align: "start" | "middle";
  weight: number;
  /** Per-block fill, defaulting to the general on-photo textColor -- the
   * CTA block overrides this to stay legible against its own pill fill. */
  fill: string;
}

/** Deterministic layout: headline + supporting line anchored in the lower
 * third with a scrim band (the composition style consistently readable in
 * this campaign's real inspected images), CTA as a small pill above the
 * bottom edge, brand label as a small top-right corner lockup -- never
 * competing with the photograph's own focal point in the upper 2/3. */
export function buildTextOverlaySvg(input: TextOverlayLayoutInput): string {
  const { width, height, elements, typographyPersonality, textColor, scrimColor, accentColor, businessName } = input;
  const fontFamily = FONT_STACK[typographyPersonality];
  const margin = Math.round(width * 0.07);
  const safeWidth = width - margin * 2;

  const headline = elements.find((e) => e.role === "headline" && e.text.trim());
  const supporting = elements.find((e) => e.role === "supportingLine" && e.text.trim());
  const cta = elements.find((e) => e.role === "cta" && e.text.trim());
  const brandLabel = elements.find((e) => e.role === "brandLabel" && e.text.trim()) ?? { role: "brandLabel" as const, text: businessName };

  const blocks: PlacedBlock[] = [];
  let scrimTop = height;
  let cursorY = height - margin;

  // A CTA pill is only actually drawn when accentColor is set (see
  // ctaPill below) -- the CTA block's text must stay legible against THAT
  // fill specifically, not the general on-photo textColor, since a light
  // brand accent (e.g. a white secondary color) paired with white
  // on-photo text is invisible.
  const ctaTextFill = accentColor ? legibleTextColorFor(accentColor) : textColor;

  // CTA safe width is narrower than the general safeWidth: it renders as a
  // centered pill, not an edge-to-edge line, so it needs its own margin on
  // both sides. Bug found on real generated output: a genuinely good, real,
  // specific CTA ("...book a consultation at our Indiranagar clinic") was
  // never wrapped -- a single long <text> line simply overflowed past both
  // canvas edges and got clipped. wrapText below fixes that the same way
  // headline/supportingLine already wrap.
  const ctaSafeWidth = width - margin * 2 - Math.round(width * 0.1);
  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.032);
    const lines = wrapText(cta.text.trim(), ctaSafeWidth, fontSize);
    const lineHeight = fontSize * 1.2;
    cursorY -= Math.round(height * 0.02);
    cursorY -= lines.length * lineHeight;
    blocks.push({ role: "cta", lines, fontSize, x: width / 2, yStart: cursorY + lineHeight, lineHeight, align: "middle", weight: 700, fill: ctaTextFill });
    cursorY -= Math.round(height * 0.025);
  }

  if (supporting?.text.trim()) {
    const fontSize = Math.round(width * 0.028);
    const lines = wrapText(supporting.text.trim(), safeWidth, fontSize);
    cursorY -= lines.length * fontSize * 1.35;
    blocks.push({ role: "supportingLine", lines, fontSize, x: margin, yStart: cursorY, lineHeight: fontSize * 1.35, align: "start", weight: 400, fill: textColor });
    cursorY -= Math.round(height * 0.015);
  }

  if (headline?.text.trim()) {
    const fontSize = Math.round(width * 0.052);
    const lines = wrapText(headline.text.trim(), safeWidth, fontSize);
    cursorY -= lines.length * fontSize * 1.15;
    blocks.push({ role: "headline", lines, fontSize, x: margin, yStart: cursorY, lineHeight: fontSize * 1.15, align: "start", weight: 800, fill: textColor });
  }

  // Explicit safe-zone enforcement (Section 19): the bottom text stack
  // must never rise into the brand label's zone at the top, regardless of
  // how many lines a long headline+supportingLine+CTA combination wraps
  // into. Clamp cursorY to a floor that leaves the top ~32% of the canvas
  // (where the brand label sits) genuinely clear, shifting the whole
  // block down (never truncating or overlapping) if it would otherwise
  // reach that high. In real generated output this rarely triggers --
  // this is a defensive floor, not the normal layout path.
  const topSafeZoneFloor = Math.round(height * 0.32);
  if (blocks.length && cursorY < topSafeZoneFloor) {
    const shift = topSafeZoneFloor - cursorY;
    for (const block of blocks) block.yStart += shift;
    cursorY += shift;
  }

  if (blocks.length) {
    scrimTop = Math.max(0, cursorY - Math.round(height * 0.04));
  }

  const textSvgParts: string[] = [];
  for (const block of blocks) {
    let y = block.yStart;
    for (const line of block.lines) {
      textSvgParts.push(
        `<text x="${block.align === "middle" ? block.x : block.x}" y="${Math.round(y)}" font-family="${fontFamily}" font-size="${block.fontSize}" font-weight="${block.weight}" fill="${escapeXml(block.fill)}" text-anchor="${block.align}" style="paint-order: stroke; stroke: rgba(0,0,0,0.15); stroke-width: 0.5px;">${escapeXml(line)}</text>`
      );
      y += block.lineHeight;
    }
  }

  const ctaBlock = blocks.find((b) => b.role === "cta");
  const ctaPill = ctaBlock && accentColor
    ? (() => {
        const padX = ctaBlock.fontSize * 1.1;
        const padY = ctaBlock.fontSize * 0.55;
        // Sized from the LONGEST wrapped line and the actual line count --
        // a single-line estimate here is what let the pill (and the text
        // inside it) silently clip past the canvas edge on a genuinely
        // long, real CTA. Width is also hard-capped at the canvas's own
        // safe area so the pill itself can never extend off-canvas even if
        // the estimate runs a little wide.
        const longestLine = ctaBlock.lines.reduce((a, b) => (b.length > a.length ? b : a), "");
        const textWidthEstimate = longestLine.length * ctaBlock.fontSize * 0.56;
        const pillWidth = Math.min(textWidthEstimate + padX * 2, width - margin * 2);
        const pillHeight = ctaBlock.lines.length * ctaBlock.lineHeight + padY * 2 - (ctaBlock.lineHeight - ctaBlock.fontSize);
        const pillX = width / 2 - pillWidth / 2;
        const pillY = ctaBlock.yStart - ctaBlock.fontSize * 0.85 - padY;
        return `<rect x="${Math.round(pillX)}" y="${Math.round(pillY)}" width="${Math.round(pillWidth)}" height="${Math.round(pillHeight)}" rx="${Math.round(Math.min(pillHeight, ctaBlock.fontSize * 1.6) / 2)}" fill="${escapeXml(accentColor)}" />`;
      })()
    : "";

  // Brand label always gets its own small backing chip -- found on real
  // generated output: without one, "Sunrise Dental Care" rendered directly
  // over a light window in the background photo and was nearly invisible;
  // the thin stroke outline other elements rely on isn't enough contrast
  // on its own against an arbitrary, unpredictable photo region.
  const brandLabelFontSize = Math.round(width * 0.026);
  const brandLabelWidthEstimate = brandLabel.text.trim().length * brandLabelFontSize * 0.58;
  const brandLabelPadX = brandLabelFontSize * 0.7;
  const brandLabelPadY = brandLabelFontSize * 0.45;
  const brandLabelChip = brandLabel.text.trim()
    ? `<rect x="${Math.round(width - margin - brandLabelWidthEstimate - brandLabelPadX * 2)}" y="${Math.round(margin * 0.9 - brandLabelFontSize - brandLabelPadY)}" width="${Math.round(brandLabelWidthEstimate + brandLabelPadX * 2)}" height="${Math.round(brandLabelFontSize + brandLabelPadY * 2)}" rx="${Math.round(brandLabelFontSize * 0.4)}" fill="${escapeXml(scrimColor)}" fill-opacity="0.45" />`
    : "";
  const brandLabelSvg = brandLabel.text.trim()
    ? `<text x="${width - margin}" y="${Math.round(margin * 0.9)}" font-family="${fontFamily}" font-size="${brandLabelFontSize}" font-weight="700" fill="${escapeXml(textColor)}" text-anchor="end" style="paint-order: stroke; stroke: rgba(0,0,0,0.25); stroke-width: 0.5px;">${escapeXml(brandLabel.text.trim())}</text>`
    : "";

  const scrimSvg = blocks.length
    ? `<rect x="0" y="${Math.round(scrimTop)}" width="${width}" height="${Math.round(height - scrimTop)}" fill="${escapeXml(scrimColor)}" fill-opacity="0.55" />`
    : "";

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${scrimSvg}${ctaPill}${textSvgParts.join("")}${brandLabelChip}${brandLabelSvg}</svg>`;
}

export async function renderTextOverlay(baseImage: Buffer, input: TextOverlayLayoutInput): Promise<Buffer> {
  const svg = buildTextOverlaySvg(input);
  const svgBuffer = Buffer.from(svg, "utf8");
  return sharp(baseImage)
    .resize(input.width, input.height, { fit: "cover" })
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
