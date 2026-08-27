/**
 * Deterministic typography overlay (Premium Creative Intelligence brief
 * Section 24): "where the current rendering architecture supports
 * reliable text overlay, prefer GENERATED VISUAL + PROGRAMMATIC TYPOGRAPHY
 * over relying on generative image models for long text rendering."
 *
 * This is that overlay layer -- real, working, pixel-level compositing via
 * `sharp` (already a project dependency): build an SVG containing the
 * headline/supporting-line/CTA/brand-label/contact-footer as actual <text>
 * (and vector icon) elements, laid out according to the creative's chosen
 * `layoutArchetype`, then rasterize + composite it onto the AI-generated
 * base photograph. The image model is used ONLY for photography/scene/
 * atmosphere, never for long text rendering.
 *
 * Final Production Loop brief Step 2: this used to have exactly ONE layout
 * (a bottom scrim band + a top-right brand chip) regardless of the
 * creative -- functional, but it reads as "a stock photo with a video
 * subtitle," not a designed marketing banner. It's now a real, small
 * graphic-design engine with three genuinely distinct compositions
 * (see LayoutArchetype in creative-treatment.ts for what each one is and
 * when the treatment model should pick it), a structured contact-footer
 * block with real vector icons (never Unicode emoji -- confirmed on real
 * generated output that sharp's SVG rasterizer in this environment
 * renders emoji glyphs as broken/blank), and real Brand DNA primary/
 * secondary color usage in place of the old generic translucent black/
 * grey everywhere a scrim, chip, or pill needs a fill.
 *
 * HONEST LIMITATION (v1): sharp's SVG rasterizer resolves font-family
 * names against whatever fonts are actually installed on the host running
 * the composite. Locally that's whatever fonts are on this machine; on
 * Vercel's serverless runtime it will fall back to that runtime's base
 * fonts unless real brand font files are embedded as base64 @font-face
 * data in the SVG (not done here -- no brand font files exist for these
 * fixtures). Layout, hierarchy, wrapping, legibility, and exact text
 * content are real and verified; exact typeface fidelity across
 * environments is the natural next step, not claimed as solved here.
 */

import sharp from "sharp";
import type { OnImageTextElement } from "./text-density.ts";
import type { TypographyPersonality } from "./brand-visual-dna.ts";
import type { LayoutArchetype, VerifiedContactInfo } from "./creative-treatment.ts";

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

/** Same estimate as wrapText, single line: truncates with an ellipsis
 * instead of wrapping -- used for the contact footer, where a full
 * address or URL wrapping to a second line would push the footer (and
 * potentially the whole card/band) taller than intended. */
function truncateToWidth(text: string, maxWidthPx: number, fontSizePx: number): string {
  const avgCharWidth = fontSizePx * 0.56;
  const maxChars = Math.max(3, Math.floor(maxWidthPx / avgCharWidth));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

interface TextLineOptions {
  fontFamily: string;
  fontSize: number;
  weight: number;
  fill: string;
  anchor: "start" | "middle" | "end";
  letterSpacing?: number;
  uppercase?: boolean;
  underline?: boolean;
}

/** Shared multi-line <text> emitter used by every archetype's headline/
 * supporting/brand-label/CTA-as-text blocks -- keeps the paint-order
 * stroke outline (real legibility fix: thin dark stroke behind every
 * on-photo text glyph so it survives an unpredictable photo region
 * behind it) in exactly one place. */
function renderTextLines(lines: string[], x: number, yStart: number, lineHeight: number, opts: TextLineOptions): string {
  let svg = "";
  let y = yStart;
  for (const line of lines) {
    const content = opts.uppercase ? line.toUpperCase() : line;
    const attrs = [
      `x="${round2(x)}"`,
      `y="${round2(y)}"`,
      `font-family="${opts.fontFamily}"`,
      `font-size="${opts.fontSize}"`,
      `font-weight="${opts.weight}"`,
      `fill="${escapeXml(opts.fill)}"`,
      `text-anchor="${opts.anchor}"`,
      opts.letterSpacing ? `letter-spacing="${round2(opts.letterSpacing)}"` : "",
      opts.underline ? `text-decoration="underline"` : "",
      `style="paint-order: stroke; stroke: rgba(0,0,0,0.15); stroke-width: 0.5px;"`,
    ].filter(Boolean);
    svg += `<text ${attrs.join(" ")}>${escapeXml(content)}</text>`;
    y += lineHeight;
  }
  return svg;
}

interface CtaPillOptions {
  centerX: number;
  /** Top edge of the pill (not a text baseline). */
  top: number;
  maxWidth: number;
  fontSize: number;
  fontFamily: string;
  fill: string;
  textColor: string;
}
interface CtaPillResult {
  svg: string;
  height: number;
}

/** Real bug found on real generated output: a genuinely good, specific CTA
 * ("...book a consultation at our Indiranagar clinic") was never wrapped --
 * a single long <text> line overflowed past both canvas edges and got
 * clipped, and the pill was sized from a single-line estimate so it (and
 * the text inside it) silently ran off-canvas. Sized here from the actual
 * wrapped line count and hard-capped to maxWidth so neither the pill nor
 * its text can ever extend past the safe area, regardless of archetype. */
function buildCtaPillSvg(ctaText: string, opts: CtaPillOptions): CtaPillResult {
  const lines = wrapText(ctaText, Math.max(40, opts.maxWidth - opts.fontSize * 2.2), opts.fontSize);
  const lineHeight = opts.fontSize * 1.2;
  const padX = opts.fontSize * 1.1;
  const padY = opts.fontSize * 0.55;
  const longestLine = lines.reduce((a, b) => (b.length > a.length ? b : a), "");
  const textWidthEstimate = longestLine.length * opts.fontSize * 0.56;
  const pillWidth = Math.min(textWidthEstimate + padX * 2, opts.maxWidth);
  const pillHeight = lines.length * lineHeight + padY * 2 - (lineHeight - opts.fontSize);
  const pillX = opts.centerX - pillWidth / 2;
  const pillY = opts.top;
  const textStartY = pillY + padY + opts.fontSize * 0.85;

  const text = renderTextLines(lines, opts.centerX, textStartY, lineHeight, {
    fontFamily: opts.fontFamily, fontSize: opts.fontSize, weight: 700, fill: opts.textColor, anchor: "middle",
  });
  const pill = `<rect x="${round2(pillX)}" y="${round2(pillY)}" width="${round2(pillWidth)}" height="${round2(pillHeight)}" rx="${round2(Math.min(pillHeight, opts.fontSize * 1.6) / 2)}" fill="${escapeXml(opts.fill)}" />`;
  return { svg: pill + text, height: pillHeight };
}

// --- Contact footer: real vector icons, never Unicode emoji --------------
//
// Confirmed on real generated output this session: sharp's SVG rasterizer
// in this environment renders emoji glyphs (e.g. the location-pin emoji)
// as broken/blank boxes -- there's no emoji font available to it. Every
// icon below is built from plain SVG primitives (circle/path/line/
// ellipse), which every SVG rasterizer supports natively, no font lookup
// involved.

/** Simplified map-pin: a circle "head" with a small triangular point
 * beneath it, drawn from primitives (not a traced/copied icon-library
 * path) so the geometry is simple and guaranteed valid at any size. */
function iconLocationPin(x: number, y: number, size: number, color: string): string {
  const cx = x + size / 2;
  const headR = size * 0.32;
  const headCy = y + headR + size * 0.04;
  const tipY = y + size * 0.96;
  return (
    `<circle cx="${round2(cx)}" cy="${round2(headCy)}" r="${round2(headR)}" fill="${escapeXml(color)}" />` +
    `<path d="M ${round2(cx - headR * 0.72)} ${round2(headCy + headR * 0.5)} L ${round2(cx)} ${round2(tipY)} L ${round2(cx + headR * 0.72)} ${round2(headCy + headR * 0.5)} Z" fill="${escapeXml(color)}" />`
  );
}

/** Minimalist handset: a thick round-capped diagonal line with a circle at
 * each end -- the essential "two earpieces connected by a body" silhouette
 * every phone pictogram reduces to, built from three primitives. */
function iconPhone(x: number, y: number, size: number, color: string): string {
  const x1 = x + size * 0.24;
  const y1 = y + size * 0.24;
  const x2 = x + size * 0.76;
  const y2 = y + size * 0.76;
  const r = size * 0.16;
  return (
    `<line x1="${round2(x1)}" y1="${round2(y1)}" x2="${round2(x2)}" y2="${round2(y2)}" stroke="${escapeXml(color)}" stroke-width="${round2(size * 0.2)}" stroke-linecap="round" />` +
    `<circle cx="${round2(x1)}" cy="${round2(y1)}" r="${round2(r)}" fill="${escapeXml(color)}" />` +
    `<circle cx="${round2(x2)}" cy="${round2(y2)}" r="${round2(r)}" fill="${escapeXml(color)}" />`
  );
}

/** Globe: an outer circle, a tall inner ellipse (meridian), and a
 * horizontal equator line -- the standard "web/website" pictogram built
 * entirely from stroke primitives. */
function iconWeb(x: number, y: number, size: number, color: string): string {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.42;
  const sw = Math.max(1, size * 0.07);
  return (
    `<circle cx="${round2(cx)}" cy="${round2(cy)}" r="${round2(r)}" fill="none" stroke="${escapeXml(color)}" stroke-width="${round2(sw)}" />` +
    `<ellipse cx="${round2(cx)}" cy="${round2(cy)}" rx="${round2(r * 0.42)}" ry="${round2(r)}" fill="none" stroke="${escapeXml(color)}" stroke-width="${round2(sw)}" />` +
    `<line x1="${round2(cx - r)}" y1="${round2(cy)}" x2="${round2(cx + r)}" y2="${round2(cy)}" stroke="${escapeXml(color)}" stroke-width="${round2(sw)}" />`
  );
}

const CONTACT_ICONS: Record<"location" | "phone" | "website", (x: number, y: number, size: number, color: string) => string> = {
  location: iconLocationPin,
  phone: iconPhone,
  website: iconWeb,
};

interface ContactFooterOptions {
  /** Extraction-only, never fabricated -- see extractVerifiedContactInfo
   * in creative-treatment.ts. A field left null here renders NO icon/row
   * at all for it; there is no placeholder or guessed value. */
  contact: VerifiedContactInfo | null | undefined;
  /** Left edge for "start" alignment, or the horizontal center for
   * "middle" alignment. */
  x: number;
  yTop: number;
  maxWidth: number;
  fontSize: number;
  color: string;
  fontFamily: string;
  align: "start" | "middle";
}
interface ContactFooterResult {
  svg: string;
  height: number;
}

/**
 * The Final Production Loop brief's "Crucial Addition": a structured
 * contact footer instead of raw contact text dumped into a dark box. Each
 * present field (location/phone/website) gets its own row: a real vector
 * icon, then its verified text truncated (never wrapped -- keeps the
 * footer's height predictable for the caller's own layout math) to fit.
 * Only fields that are actually present render a row -- most real tenants
 * today have no verified phone (package-business-facts.ts deliberately
 * excludes it), and this renders zero phone rows for them, never a
 * placeholder.
 */
function buildContactFooterSvg(opts: ContactFooterOptions): ContactFooterResult {
  const rows: Array<{ kind: "location" | "phone" | "website"; text: string }> = [];
  if (opts.contact?.location) rows.push({ kind: "location", text: opts.contact.location });
  if (opts.contact?.phone) rows.push({ kind: "phone", text: opts.contact.phone });
  if (opts.contact?.website) rows.push({ kind: "website", text: opts.contact.website });
  if (!rows.length) return { svg: "", height: 0 };

  const iconSize = Math.round(opts.fontSize * 1.15);
  const gap = Math.round(opts.fontSize * 0.4);
  const rowGap = Math.round(opts.fontSize * 0.5);
  const textMaxWidth = Math.max(20, opts.maxWidth - iconSize - gap);

  let svg = "";
  let y = opts.yTop;
  for (const row of rows) {
    const text = truncateToWidth(row.text, textMaxWidth, opts.fontSize);
    const estimatedTextWidth = Math.min(text.length * opts.fontSize * 0.56, textMaxWidth);
    const rowWidth = iconSize + gap + estimatedTextWidth;
    const iconX = opts.align === "middle" ? opts.x - rowWidth / 2 : opts.x;
    const textX = iconX + iconSize + gap;
    const textY = y + iconSize * 0.75;
    svg += CONTACT_ICONS[row.kind](iconX, y, iconSize, opts.color);
    svg += `<text x="${round2(textX)}" y="${round2(textY)}" font-family="${opts.fontFamily}" font-size="${opts.fontSize}" font-weight="500" fill="${escapeXml(opts.color)}" text-anchor="start">${escapeXml(text)}</text>`;
    y += iconSize + rowGap;
  }
  return { svg, height: y - opts.yTop - rowGap };
}

export interface TextOverlayLayoutInput {
  width: number;
  height: number;
  elements: OnImageTextElement[];
  typographyPersonality: TypographyPersonality;
  /** Text color chosen for contrast against a dark scrim/photo, not the
   * raw brand color, which may not be legible on a photograph -- callers
   * pass a near-white or near-black based on the brand's own light/dark
   * preference. Used directly for EDITORIAL_FRAME (which renders straight
   * onto the photo); the other two archetypes derive their own container-
   * specific text colors from their actual fills instead. */
  textColor: string;
  scrimColor: string;
  accentColor: string | null;
  businessName: string;
  /** Final Production Loop brief Step 1/2: the actual graphic-design
   * composition this creative committed to -- dictates which of the three
   * layout functions below renders it. */
  layoutArchetype: LayoutArchetype;
  /** Brand DNA primary/secondary -- used for header bars, accent lines,
   * and pill/button fills so branded surfaces read as this business's own
   * colors, never a generic translucent grey/black. Each archetype falls
   * back sensibly (to accentColor, then a neutral) when a tenant has no
   * saved brand color yet. */
  primaryColor: string | null;
  secondaryColor: string | null;
  /** Extraction-only verified contact info (extractVerifiedContactInfo) --
   * optional because not every caller has it wired yet. A missing/null
   * field renders no row for it; nothing here is ever fabricated. */
  contactInfo?: VerifiedContactInfo | null;
}

interface PickedElements {
  headline: OnImageTextElement | undefined;
  supporting: OnImageTextElement | undefined;
  cta: OnImageTextElement | undefined;
  brandLabel: OnImageTextElement;
}

function pickElements(elements: OnImageTextElement[], businessName: string): PickedElements {
  return {
    headline: elements.find((e) => e.role === "headline" && e.text.trim()),
    supporting: elements.find((e) => e.role === "supportingLine" && e.text.trim()),
    cta: elements.find((e) => e.role === "cta" && e.text.trim()),
    brandLabel: elements.find((e) => e.role === "brandLabel" && e.text.trim()) ?? { role: "brandLabel", text: businessName },
  };
}

/**
 * SPLIT_BANNER: ~70% photo / ~30% solid brand-colored block spanning the
 * full width, anchored to the bottom, carrying the headline/supporting
 * line/CTA and the contact footer. The band height targets 30% of the
 * canvas but grows (capped) if the real content needs more room, rather
 * than ever truncating or overlapping. Fill is the brand's own primary
 * color (falling back to accentColor, then a neutral charcoal) -- never a
 * generic translucent black scrim.
 */
function buildSplitBannerSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height, typographyPersonality } = input;
  const fontFamily = FONT_STACK[typographyPersonality];
  const primary = input.primaryColor ?? input.accentColor ?? "#14181F";
  const secondary = input.secondaryColor ?? input.accentColor ?? "#FFFFFF";
  const bandTextColor = legibleTextColorFor(primary);
  const pillTextColor = legibleTextColorFor(secondary);
  const { headline, supporting, cta, brandLabel } = picked;

  const margin = Math.round(width * 0.07);
  const safeWidth = width - margin * 2;
  const paddingTop = Math.round(width * 0.05);
  const paddingBottom = Math.round(width * 0.05);

  const parts: string[] = [];
  let y = paddingTop;

  const brandFS = Math.round(width * 0.026);
  if (brandLabel.text.trim()) {
    parts.push(renderTextLines([brandLabel.text.trim()], margin, y + brandFS, brandFS * 1.2, {
      fontFamily, fontSize: brandFS, weight: 700, fill: bandTextColor, anchor: "start", letterSpacing: Math.round(brandFS * 0.12),
    }));
    y += brandFS * 1.4;
    // Brand-color accent line under the lockup -- real color usage in
    // place of the old generic chip/scrim treatment.
    const accentLineWidth = Math.round(safeWidth * 0.16);
    const accentLineHeight = Math.max(2, Math.round(width * 0.006));
    parts.push(`<rect x="${margin}" y="${round2(y)}" width="${accentLineWidth}" height="${accentLineHeight}" fill="${escapeXml(secondary)}" />`);
    y += accentLineHeight + Math.round(width * 0.025);
  }

  if (headline?.text.trim()) {
    const fontSize = Math.round(width * 0.05);
    const lines = wrapText(headline.text.trim(), safeWidth, fontSize);
    const lineHeight = fontSize * 1.15;
    parts.push(renderTextLines(lines, margin, y + fontSize, lineHeight, { fontFamily, fontSize, weight: 800, fill: bandTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.015);
  }

  if (supporting?.text.trim()) {
    const fontSize = Math.round(width * 0.028);
    const lines = wrapText(supporting.text.trim(), safeWidth, fontSize);
    const lineHeight = fontSize * 1.35;
    parts.push(renderTextLines(lines, margin, y + fontSize, lineHeight, { fontFamily, fontSize, weight: 400, fill: bandTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.02);
  }

  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.032);
    const pill = buildCtaPillSvg(cta.text.trim(), {
      centerX: margin + safeWidth / 2, top: y, maxWidth: safeWidth, fontSize, fontFamily, fill: secondary, textColor: pillTextColor,
    });
    parts.push(pill.svg);
    y += pill.height + Math.round(width * 0.025);
  }

  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: margin, yTop: y, maxWidth: safeWidth,
    fontSize: Math.round(width * 0.024), color: bandTextColor, fontFamily, align: "start",
  });
  if (footer.svg) {
    parts.push(footer.svg);
    y += footer.height;
  }

  const contentHeight = y + paddingBottom;
  const targetBandHeight = Math.round(height * 0.3);
  const maxBandHeight = Math.round(height * 0.5);
  const bandHeight = Math.min(Math.max(contentHeight, targetBandHeight), maxBandHeight);
  const bandTop = height - bandHeight;
  const accentStripHeight = Math.max(3, Math.round(height * 0.006));

  const band =
    `<rect x="0" y="${round2(bandTop)}" width="${width}" height="${round2(bandHeight)}" fill="${escapeXml(primary)}" />` +
    `<rect x="0" y="${round2(bandTop)}" width="${width}" height="${accentStripHeight}" fill="${escapeXml(secondary)}" />`;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${band}<g transform="translate(0, ${round2(bandTop)})">${parts.join("")}</g></svg>`;
}

/**
 * FLOATING_CARD: a padded, content-sized card anchored to the bottom-left
 * corner, leaving the rest of the photograph -- especially the right two-
 * thirds and the top -- fully unobstructed for a subject that IS the
 * story. The card body stays a neutral frosted surface (for legibility
 * against any photo) while brand color still shows up deliberately: a
 * short accent tick above the headline, and the CTA pill's own fill. The
 * business's brand lockup gets its own small top-right chip on the photo
 * itself, tinted with the brand's primary color, in the one corner the
 * card never touches.
 */
function buildFloatingCardSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height, typographyPersonality } = input;
  const fontFamily = FONT_STACK[typographyPersonality];
  const primary = input.primaryColor ?? input.accentColor ?? "#14181F";
  const secondary = input.secondaryColor ?? input.accentColor ?? primary;
  const { headline, supporting, cta, brandLabel } = picked;

  const parts: string[] = [];
  const brandFS = Math.round(width * 0.026);
  const chipMargin = Math.round(width * 0.07);
  if (brandLabel.text.trim()) {
    const text = brandLabel.text.trim();
    const widthEstimate = text.length * brandFS * 0.58;
    const padX = brandFS * 0.7;
    const padY = brandFS * 0.45;
    const chipX = width - chipMargin - widthEstimate - padX * 2;
    const chipY = chipMargin * 0.9 - brandFS - padY;
    const chipTextColor = legibleTextColorFor(primary);
    parts.push(`<rect x="${round2(chipX)}" y="${round2(chipY)}" width="${round2(widthEstimate + padX * 2)}" height="${round2(brandFS + padY * 2)}" rx="${round2(brandFS * 0.4)}" fill="${escapeXml(primary)}" fill-opacity="0.82" />`);
    parts.push(renderTextLines([text], width - chipMargin, chipMargin * 0.9, brandFS * 1.2, {
      fontFamily, fontSize: brandFS, weight: 700, fill: chipTextColor, anchor: "end",
    }));
  }

  // The brand's own lightDarkPreference (surfaced here via textColor,
  // which callers set to near-black for a "light" brand and near-white
  // for a "dark" one) decides whether the card itself reads as a light
  // frosted surface or a solid dark one -- a deliberate brand-driven
  // choice, not a random pick.
  const cardIsLight = input.textColor.toUpperCase() !== "#FFFFFF";
  const cardFillColor = cardIsLight ? "#FFFFFF" : "#14181F";
  const cardTextColor = cardIsLight ? "#14181F" : "#FFFFFF";

  const cardMargin = Math.round(width * 0.06);
  const cardPadding = Math.round(width * 0.05);
  const cardWidth = Math.round(width * 0.56);
  const cardInnerWidth = cardWidth - cardPadding * 2;

  let y = cardPadding;
  const inner: string[] = [];

  const accentTickWidth = Math.round(cardInnerWidth * 0.18);
  const accentTickHeight = Math.max(3, Math.round(width * 0.008));
  inner.push(`<rect x="0" y="${round2(y)}" width="${accentTickWidth}" height="${accentTickHeight}" rx="${round2(accentTickHeight / 2)}" fill="${escapeXml(primary)}" />`);
  y += accentTickHeight + Math.round(width * 0.025);

  if (headline?.text.trim()) {
    const fontSize = Math.round(width * 0.044);
    const lines = wrapText(headline.text.trim(), cardInnerWidth, fontSize);
    const lineHeight = fontSize * 1.15;
    inner.push(renderTextLines(lines, 0, y + fontSize, lineHeight, { fontFamily, fontSize, weight: 800, fill: cardTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.015);
  }

  if (supporting?.text.trim()) {
    const fontSize = Math.round(width * 0.024);
    const lines = wrapText(supporting.text.trim(), cardInnerWidth, fontSize);
    const lineHeight = fontSize * 1.35;
    inner.push(renderTextLines(lines, 0, y + fontSize, lineHeight, { fontFamily, fontSize, weight: 400, fill: cardTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.02);
  }

  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.028);
    const pillTextColor = legibleTextColorFor(secondary);
    const pill = buildCtaPillSvg(cta.text.trim(), {
      centerX: cardInnerWidth / 2, top: y, maxWidth: cardInnerWidth, fontSize, fontFamily, fill: secondary, textColor: pillTextColor,
    });
    inner.push(pill.svg);
    y += pill.height + Math.round(width * 0.02);
  }

  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: 0, yTop: y, maxWidth: cardInnerWidth,
    fontSize: Math.round(width * 0.021), color: cardTextColor, fontFamily, align: "start",
  });
  if (footer.svg) {
    inner.push(footer.svg);
    y += footer.height;
  }

  const contentHeight = y + cardPadding;
  const maxCardHeight = height - cardMargin * 2;
  const cardHeight = Math.min(contentHeight, maxCardHeight);
  const cardX = cardMargin;
  const cardY = height - cardMargin - cardHeight;
  const cardRadius = Math.round(width * 0.02);

  const cardBg = `<rect x="${cardX}" y="${round2(cardY)}" width="${cardWidth}" height="${round2(cardHeight)}" rx="${cardRadius}" fill="${escapeXml(cardFillColor)}" fill-opacity="0.95" />`;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}${cardBg}<g transform="translate(${cardX + cardPadding}, ${round2(cardY)})">${inner.join("")}</g></svg>`;
}

/**
 * EDITORIAL_FRAME: the most restrained option -- a thin outer frame (brand
 * primary color), a top-center brand lockup, and a compact, centered,
 * rule-bracketed text stack in the lower-middle third. No scrim rectangle
 * and no CTA pill here (a graphic button would fight the "magazine page"
 * restraint this archetype exists for); the CTA renders as understated
 * underlined text in the brand secondary/accent color instead. The
 * contact footer is bottom-anchored inside the frame; the text stack's
 * own height is computed first so it's positioned to never collide with
 * it, the same "shift, never overlap" principle as the old safe-zone
 * clamp.
 */
function buildEditorialFrameSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height, typographyPersonality, textColor } = input;
  const fontFamily = FONT_STACK[typographyPersonality];
  const primary = input.primaryColor ?? textColor;
  const secondary = input.secondaryColor ?? input.accentColor ?? primary;
  const { headline, supporting, cta, brandLabel } = picked;

  const frameMargin = Math.round(width * 0.035);
  const frameStroke = Math.max(2, Math.round(width * 0.006));
  const parts: string[] = [
    `<rect x="${frameMargin}" y="${frameMargin}" width="${width - frameMargin * 2}" height="${height - frameMargin * 2}" fill="none" stroke="${escapeXml(primary)}" stroke-width="${frameStroke}" />`,
  ];

  const contentPad = frameMargin + Math.round(width * 0.03);
  const safeWidth = width - contentPad * 2;

  if (brandLabel.text.trim()) {
    const brandFS = Math.round(width * 0.026);
    parts.push(renderTextLines([brandLabel.text.trim()], width / 2, contentPad + brandFS, brandFS * 1.2, {
      fontFamily, fontSize: brandFS, weight: 700, fill: textColor, anchor: "middle",
      letterSpacing: Math.round(brandFS * 0.3), uppercase: true,
    }));
  }

  // Contact footer height is computed once up front (yTop=0 is a throwaway
  // probe) so the footer can be bottom-anchored AND the headline stack
  // above it can be sized to clear it -- both without a second pass.
  const footerFontSize = Math.round(width * 0.02);
  const footerProbe = buildContactFooterSvg({
    contact: input.contactInfo, x: width / 2, yTop: 0, maxWidth: safeWidth, fontSize: footerFontSize, color: textColor, fontFamily, align: "middle",
  });
  const footerTop = height - contentPad - footerProbe.height;

  // Phase 1: compute the centered text stack's total height WITHOUT
  // emitting SVG yet, so its start position can be chosen to clear the
  // footer (shift up, never overlap or truncate).
  const ruleHeight = Math.max(2, Math.round(width * 0.005));
  const ruleGap = Math.round(width * 0.025);
  let stackHeight = ruleHeight + ruleGap;

  const headlineFontSize = Math.round(width * 0.044);
  const headlineLines = headline?.text.trim() ? wrapText(headline.text.trim(), Math.round(safeWidth * 0.82), headlineFontSize) : [];
  const headlineLineHeight = headlineFontSize * 1.15;
  if (headlineLines.length) stackHeight += headlineLines.length * headlineLineHeight + Math.round(width * 0.018);

  const supportingFontSize = Math.round(width * 0.024);
  const supportingLines = supporting?.text.trim() ? wrapText(supporting.text.trim(), Math.round(safeWidth * 0.82), supportingFontSize) : [];
  const supportingLineHeight = supportingFontSize * 1.35;
  if (supportingLines.length) stackHeight += supportingLines.length * supportingLineHeight + Math.round(width * 0.018);

  const ctaFontSize = Math.round(width * 0.026);
  const ctaLines = cta?.text.trim() ? wrapText(cta.text.trim(), Math.round(safeWidth * 0.7), ctaFontSize) : [];
  const ctaLineHeight = ctaFontSize * 1.3;
  if (ctaLines.length) stackHeight += ctaLines.length * ctaLineHeight;

  stackHeight += ruleHeight;

  const topFloor = contentPad + Math.round(width * 0.026) * 2.2;
  const minGapAboveFooter = Math.round(width * 0.03);
  const defaultStart = Math.round(height * 0.56);
  const latestStart = footerProbe.height ? footerTop - minGapAboveFooter - stackHeight : height - contentPad - stackHeight;
  const startY = Math.max(topFloor, Math.min(defaultStart, latestStart));

  const centerX = width / 2;
  const ruleWidth = Math.round(safeWidth * 0.12);
  const midParts: string[] = [];
  let y = startY;

  midParts.push(`<rect x="${round2(centerX - ruleWidth / 2)}" y="${round2(y)}" width="${ruleWidth}" height="${ruleHeight}" fill="${escapeXml(secondary)}" />`);
  y += ruleHeight + ruleGap;

  if (headlineLines.length) {
    midParts.push(renderTextLines(headlineLines, centerX, y + headlineFontSize, headlineLineHeight, {
      fontFamily, fontSize: headlineFontSize, weight: 700, fill: textColor, anchor: "middle",
    }));
    y += headlineLines.length * headlineLineHeight + Math.round(width * 0.018);
  }

  if (supportingLines.length) {
    midParts.push(renderTextLines(supportingLines, centerX, y + supportingFontSize, supportingLineHeight, {
      fontFamily, fontSize: supportingFontSize, weight: 400, fill: textColor, anchor: "middle",
    }));
    y += supportingLines.length * supportingLineHeight + Math.round(width * 0.018);
  }

  if (ctaLines.length) {
    // No pill -- understated underlined text in the brand accent color
    // instead of a graphic button, per this archetype's own restraint.
    midParts.push(renderTextLines(ctaLines, centerX, y + ctaFontSize, ctaLineHeight, {
      fontFamily, fontSize: ctaFontSize, weight: 700, fill: secondary, anchor: "middle", underline: true,
    }));
    y += ctaLines.length * ctaLineHeight;
  }

  midParts.push(`<rect x="${round2(centerX - ruleWidth / 2)}" y="${round2(y)}" width="${ruleWidth}" height="${ruleHeight}" fill="${escapeXml(secondary)}" />`);

  parts.push(...midParts);

  if (footerProbe.height) {
    const footer = buildContactFooterSvg({
      contact: input.contactInfo, x: centerX, yTop: footerTop, maxWidth: safeWidth, fontSize: footerFontSize, color: textColor, fontFamily, align: "middle",
    });
    parts.push(footer.svg);
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

/** Dispatches to the layout-specific renderer for input.layoutArchetype.
 * A creative with genuinely no on-image text (no headline/supporting/CTA
 * and an empty business name) short-circuits to a bare, empty SVG for
 * every archetype -- there's nothing to design a container around. */
export function buildTextOverlaySvg(input: TextOverlayLayoutInput): string {
  const { width, height, elements, businessName } = input;
  const picked = pickElements(elements, businessName);
  const hasContent = Boolean(
    picked.headline?.text.trim() || picked.supporting?.text.trim() || picked.cta?.text.trim() || picked.brandLabel.text.trim()
  );
  if (!hasContent) {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  }
  switch (input.layoutArchetype) {
    case "SPLIT_BANNER":
      return buildSplitBannerSvg(input, picked);
    case "FLOATING_CARD":
      return buildFloatingCardSvg(input, picked);
    case "EDITORIAL_FRAME":
      return buildEditorialFrameSvg(input, picked);
    default:
      // Unreachable given validateCreativeTreatment's own enum check --
      // kept as a real, working default rather than a throw so a
      // never-quite-impossible bad value still renders something usable.
      return buildFloatingCardSvg(input, picked);
  }
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
