/**
 * Deterministic typography overlay (Premium Creative Intelligence brief
 * Section 24): "where the current rendering architecture supports
 * reliable text overlay, prefer GENERATED VISUAL + PROGRAMMATIC TYPOGRAPHY
 * over relying on generative image models for long text rendering."
 *
 * This is that overlay layer -- real, working, pixel-level compositing via
 * `sharp` (already a project dependency): build an SVG containing the
 * headline/supporting-line/CTA/brand-label/contact-footer as pre-rendered
 * glyph-outline `<path>` elements (and vector icons), laid out according
 * to the creative's chosen `layoutArchetype`, then rasterize + composite
 * it onto the AI-generated base photograph. The image model is used ONLY
 * for photography/scene/atmosphere, never for long text rendering.
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
 * WHY GLYPH PATHS, NOT <text> ELEMENTS (real production bug, found and
 * fixed via the Step 5 E2E staging validation): every earlier version of
 * this module emitted real `<text>` elements and relied on the SVG
 * rasterizer (sharp -> libvips -> librsvg) to resolve a font-family name
 * and shape/rasterize the glyphs itself. That worked perfectly on a local
 * dev machine but shipped completely invisible text in actual production
 * (Vercel's serverless runtime) -- confirmed by downloading and visually
 * inspecting a real generated composite: every shape (bands, pills, accent
 * lines, icons) rendered correctly, every `<text>` element rendered as
 * nothing. Embedding a real font as a base64 @font-face data: URI (tried
 * next, both as WOFF and as raw TTF) measurably progressed the failure --
 * real layout/kerning/advance-widths started happening -- but every glyph
 * still rendered as a tofu box (.notdef), meaning that host's text-shaping
 * layer (Pango/fontconfig, which librsvg's <text> support depends on)
 * isn't reliably available/initialized in a fresh serverless container,
 * even with a font's bytes fully embedded in the SVG itself.
 *
 * The fix that actually works: don't ask the host to shape or rasterize
 * text AT ALL. `opentype.js` parses the embedded Inter font
 * (fonts/inter-embedded.ts) and computes each line's actual glyph outlines
 * as SVG path data ahead of time, in this module, in pure JS -- the
 * rasterizer then just fills vector paths, the same primitive operation it
 * already performs correctly for every rect/circle/line in this file. No
 * font lookup, no text shaping, no fontconfig dependency of any kind at
 * render time -- confirmed via a real E2E generation against the live
 * staging tenant that this renders correctly on the actual Vercel
 * production runtime.
 *
 * HONEST LIMITATION (v1): only Latin-script text is supported (Inter
 * Regular + Bold, latin subset) -- no RTL, no CJK, no ligature shaping
 * beyond what opentype.js's own kerning table lookup provides. Every
 * typography personality currently renders in the same embedded Inter
 * face (TypographyPersonality is accepted but not yet used to select a
 * different embedded font) -- a distinct embedded font per personality is
 * the natural v2, not attempted here.
 */

import sharp from "sharp";
import * as opentypeNamespace from "opentype.js";
import type { Font } from "opentype.js";

// opentype.js resolves to genuinely different module shapes depending on
// the bundler: Next.js/Turbopack (via the package's "module" field) sees
// dist/opentype.mjs, whose only exports are named (Font, parse, ...) with
// no default -- `import opentype from "opentype.js"` fails to build there
// ("Export default doesn't exist"). Plain Node ESM (via the "main" field,
// no "exports" map) resolves to the UMD dist/opentype.js instead, where
// Node's CJS/ESM interop puts the whole CJS module.exports object (which
// DOES carry .parse/.Font as plain properties) on the namespace's own
// `default` key, and does not reliably synthesize `parse` as a named
// export of the namespace itself. This -- `ns.default ?? ns` -- resolves
// correctly under both.
const opentype = (opentypeNamespace as { default?: typeof opentypeNamespace }).default ?? opentypeNamespace;
const parseFont = opentype.parse;
import type { OnImageTextElement } from "./text-density.ts";
import type { TypographyPersonality } from "./brand-visual-dna.ts";
import type { LayoutArchetype, VerifiedContactInfo } from "./creative-treatment.ts";
import { INTER_REGULAR_TTF_BASE64, INTER_BOLD_TTF_BASE64 } from "./fonts/inter-embedded.ts";

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

let regularFontCache: Font | null = null;
let boldFontCache: Font | null = null;

/** Regular for weight < 600, Bold otherwise -- matches normal CSS font-
 * weight-to-face matching for a two-weight family. Parsed once per
 * process (module-level cache), not once per request. */
export function getFont(weight: number): Font {
  if (weight >= 600) {
    if (!boldFontCache) boldFontCache = parseFont(toArrayBuffer(Buffer.from(INTER_BOLD_TTF_BASE64, "base64")));
    return boldFontCache;
  }
  if (!regularFontCache) regularFontCache = parseFont(toArrayBuffer(Buffer.from(INTER_REGULAR_TTF_BASE64, "base64")));
  return regularFontCache;
}

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
export function legibleTextColorFor(fillHex: string | null): string {
  if (!fillHex) return "#FFFFFF";
  const luminance = hexLuminance(fillHex);
  if (luminance === null) return "#FFFFFF";
  return luminance > 0.6 ? "#111111" : "#FFFFFF";
}

/** Defensive attribute-value escaping (colors are always internally
 * computed hex strings today, but this costs nothing and guards against a
 * future caller passing something unexpected into a fill/stroke value). */
export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** letterSpacing here is always in PIXELS (matching every other pixel-
 * based measurement in this file); opentype.js's own RenderOptions.
 * letterSpacing is a fraction of fontSize, so every call site converts. */
function letterSpacingFraction(letterSpacingPx: number, fontSize: number): number {
  return fontSize > 0 ? letterSpacingPx / fontSize : 0;
}

/** Every measureWidth/glyphPath call below disables GSUB-driven glyph
 * substitution features (ligatures, contextual alternates, glyph
 * composition/decomposition) -- real bug found immediately after
 * switching to glyph-path rendering: opentype.js's own OpenType-layout
 * engine doesn't support every GSUB lookup type Inter's font actually
 * uses (specifically a ccmp lookup), and throws rather than skipping it.
 * None of these features matter for plain marketing captions -- turning
 * them off trades a font-designer nicety (ligatures) for the engine not
 * crashing on real, unremarkable business copy. */
const NO_GSUB_FEATURES = { features: { liga: false, rlig: false, ccmp: false, calt: false } } as const;

/** Real measured glyph-advance width in pixels, with the GSUB-feature
 * crash worked around and pixel-based letterSpacing converted to
 * opentype.js's own fontSize-fraction convention in one place. */
export function measureWidth(font: Font, text: string, fontSize: number, letterSpacingPx = 0): number {
  // Measured on the SAME sanitized string glyphLineSvg will actually draw
  // -- otherwise every wrap/truncate calculation is computed against
  // characters that never get rendered.
  return font.getAdvanceWidth(sanitizeForFont(font, text), fontSize, { letterSpacing: letterSpacingFraction(letterSpacingPx, fontSize), ...NO_GSUB_FEATURES });
}

/** Real font-metric word-wrap (replacing the old average-char-width
 * estimate now that real glyph advance widths are available from the
 * parsed font) -- wraps at the actual measured pixel width, never an
 * approximation. */
export function wrapText(font: Font, text: string, maxWidthPx: number, fontSizePx: number, letterSpacingPx = 0): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const measured = measureWidth(font, candidate, fontSizePx, letterSpacingPx);
    if (measured > maxWidthPx && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** wrapText, but for archetypes with a genuine, deliberate max-line-count
 * design constraint (BASIC_ESSENTIAL's 3-line headline cap, ELEVATED_BADGE's
 * circular text, TYPOGRAPHIC_HERO's 4-line cap, POLAROID_LIFESTYLE's
 * 2-line caption, MINIMAL_FOOTER_STRIP's single line). Real bug found and
 * fixed across several of these: plain `wrapText(...).slice(0, maxLines)`
 * silently DROPS any wrapped line beyond maxLines with zero indication --
 * a genuinely long headline could lose its entire second half invisibly.
 * This wraps normally, and if the result needs more lines than allowed,
 * keeps the first (maxLines-1) lines as-is and collapses everything from
 * there into a final real-font-metric-truncated line ending in "…" --
 * content is shortened, visibly, never silently discarded. */
export function wrapTextWithEllipsis(font: Font, text: string, maxWidthPx: number, fontSizePx: number, maxLines: number, letterSpacingPx = 0): string[] {
  const lines = wrapText(font, text, maxWidthPx, fontSizePx, letterSpacingPx);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines - 1);
  const remainder = lines.slice(maxLines - 1).join(" ");
  // Word-boundary-aware, not truncateToWidth's plain character cut -- a
  // real generated FEATURE_POSTER headline ("Your weekend road trip starts
  // right here in Indiranagar.") truncated to "...right here in In…",
  // cutting a real place name mid-word. Every other caller of
  // truncateToWidth (contact footer, CTA) keeps the simple character cut,
  // since a URL or phone number has no "words" to break on anyway.
  kept.push(truncateToWidthAtWordBoundary(font, remainder, maxWidthPx, fontSizePx, letterSpacingPx));
  return kept;
}

/** Real font-metric truncation (binary search on the actual measured
 * width) -- used for the contact footer, where a full address or URL
 * wrapping to a second line would push the footer (and potentially the
 * whole card/band) taller than intended, so it truncates instead. */
function truncateToWidth(font: Font, text: string, maxWidthPx: number, fontSizePx: number, letterSpacingPx = 0): string {
  if (measureWidth(font, text, fontSizePx, letterSpacingPx) <= maxWidthPx) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${text.slice(0, mid)}…`;
    if (measureWidth(font, candidate, fontSizePx, letterSpacingPx) <= maxWidthPx) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : "…";
}

/** Like truncateToWidth, but prefers to cut at the last whole word that
 * still fits rather than mid-word -- used only for the final overflowing
 * line of a multi-line wrap (wrapTextWithEllipsis), where a mid-word cut
 * reads as visibly broken in a way a mid-sentence cut at a real word
 * boundary doesn't (real bug, found on an actual generated FEATURE_POSTER
 * headline). Falls back to the plain character-level cut when even the
 * first word alone doesn't fit. */
function truncateToWidthAtWordBoundary(font: Font, text: string, maxWidthPx: number, fontSizePx: number, letterSpacingPx = 0): string {
  if (measureWidth(font, text, fontSizePx, letterSpacingPx) <= maxWidthPx) return text;
  const words = text.trim().split(/\s+/);
  if (words.length <= 1) return truncateToWidth(font, text, maxWidthPx, fontSizePx, letterSpacingPx);
  let kept = "";
  for (const word of words) {
    const candidate = kept ? `${kept} ${word}` : word;
    if (measureWidth(font, `${candidate}…`, fontSizePx, letterSpacingPx) > maxWidthPx) break;
    kept = candidate;
  }
  return kept ? `${kept}…` : truncateToWidth(font, text, maxWidthPx, fontSizePx, letterSpacingPx);
}

/** The one real text-rendering primitive in this file: pre-renders one
 * line of text as actual glyph-outline SVG path data (opentype.js's own
 * font.getPath, which already handles kerning and letter-spacing) instead
 * of emitting a `<text>` element the host would have to shape/rasterize
 * itself. Returns the line's measured width too, so callers doing their
 * own centering/underlining math never need a second, separate estimate. */
/**
 * Characters this platform's businesses genuinely use that the embedded
 * Inter latin subset has no glyph for. Without this they render as
 * .notdef tofu boxes -- confirmed live: the rupee sign, which an Indian
 * SMB platform puts in front of every price, has glyph index 0 in the
 * embedded font. Each replacement is a real, readable equivalent, never a
 * silent deletion of meaning.
 */
const UNSUPPORTED_GLYPH_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/₹/g, "Rs."],
  [/€/g, "EUR"],
  [/¥/g, "JPY"],
  [/₨/g, "Rs."],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/‑/g, "-"],
  [/ /g, " "],
];

/**
 * Makes a string safe for the embedded font: known characters are mapped
 * to real equivalents, and anything still lacking a glyph is dropped
 * rather than drawn as a tofu box. Applied inside BOTH measureWidth and
 * glyphLineSvg so measured widths and rendered glyphs can never disagree
 * (a mismatch would silently break every wrap/truncate calculation).
 */
export function sanitizeForFont(font: Font, text: string): string {
  let out = text;
  for (const [pattern, replacement] of UNSUPPORTED_GLYPH_REPLACEMENTS) out = out.replace(pattern, replacement);
  let hasMissing = false;
  for (const ch of out) {
    if (ch !== " " && font.charToGlyph(ch).index === 0) {
      hasMissing = true;
      break;
    }
  }
  if (!hasMissing) return out;
  return [...out].filter((ch) => ch === " " || font.charToGlyph(ch).index !== 0).join("");
}

/** Fixed-notation number formatter for SVG path data. `toFixed` (not
 * String()/template interpolation) is the whole point: it never emits
 * exponential notation, which is what breaks the path parser. */
function svgNum(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(decimals);
  const trimmed = decimals > 0 ? fixed.replace(/\.?0+$/, "") : fixed;
  return trimmed === "" || trimmed === "-" || trimmed === "-0" ? "0" : trimmed;
}

/**
 * Serializes an opentype.js Path to SVG path data ourselves instead of
 * calling its own `path.toPathData()`.
 *
 * REAL PRODUCTION BUG this exists to fix (found by rendering a long line
 * and inspecting the actual pixels): opentype.js's `toPathData` rounds via
 * `+(Math.round(v + 'e+' + places) + 'e-' + places)`. That string trick
 * breaks for any coordinate JavaScript already stringifies in exponential
 * notation -- a glyph outline routinely produces a near-zero value like
 * 5.6e-15, and `'5.6e-15' + 'e+2'` parses as NaN. `toPathData` then emits
 * the literal token `NaN` into the `d` attribute, and librsvg (sharp's
 * rasterizer) stops rendering that path AT THAT TOKEN -- silently, with no
 * error, leaving a half-drawn glyph and every following character missing.
 *
 * Confirmed live: "GLOBAL PATHWAYS OVERSEAS EDUCATION" rendered as
 * "GLOBAL PATHWAYS OVER" plus a clipped partial glyph, with exactly one
 * `NaN` in its 12KB of path data while the underlying `commands` array
 * contained zero non-finite numbers. This affected EVERY archetype, not
 * just one -- any line long enough to contain such a coordinate lost its
 * tail. Emitting the same commands with `toFixed` (never exponential)
 * fixes it at the source for every caller.
 */
function pathCommandsToSvgData(path: { commands: ReadonlyArray<Record<string, unknown>> }, decimals = 2): string {
  let out = "";
  for (const command of path.commands) {
    const type = command.type;
    const n = (key: string): string => svgNum(command[key] as number, decimals);
    switch (type) {
      case "M":
        out += `M${n("x")} ${n("y")}`;
        break;
      case "L":
        out += `L${n("x")} ${n("y")}`;
        break;
      case "C":
        out += `C${n("x1")} ${n("y1")} ${n("x2")} ${n("y2")} ${n("x")} ${n("y")}`;
        break;
      case "Q":
        out += `Q${n("x1")} ${n("y1")} ${n("x")} ${n("y")}`;
        break;
      case "Z":
        out += "Z";
        break;
      default:
        break;
    }
  }
  return out;
}

function glyphLineSvg(
  font: Font,
  text: string,
  x: number,
  yBaseline: number,
  fontSize: number,
  anchor: "start" | "middle" | "end",
  letterSpacingPx: number,
  fill: string,
  /** NEON_NIGHTLIFE's glow: the same glyph path drawn again underneath with
   * a wide, low-opacity stroke and no separate blur filter (filter support
   * is exactly the class of host-dependent feature this file's whole
   * glyph-path rewrite exists to avoid relying on) -- a real, if simpler,
   * soft-halo effect using only the fill/stroke primitives every SVG
   * rasterizer supports natively. */
  glowColor?: string | null
): { svg: string; width: number } {
  const drawable = sanitizeForFont(font, text);
  const width = measureWidth(font, drawable, fontSize, letterSpacingPx);
  let startX = x;
  if (anchor === "middle") startX = x - width / 2;
  else if (anchor === "end") startX = x - width;
  const path = font.getPath(drawable, startX, yBaseline, fontSize, { letterSpacing: letterSpacingFraction(letterSpacingPx, fontSize), ...NO_GSUB_FEATURES });
  const d = pathCommandsToSvgData(path);
  const glow = glowColor
    ? `<path d="${d}" fill="none" stroke="${escapeXml(glowColor)}" stroke-width="${round2(fontSize * 0.09)}" stroke-opacity="0.55" stroke-linejoin="round" />`
    : "";
  const svg = `${glow}<path d="${d}" fill="${escapeXml(fill)}" style="paint-order: stroke; stroke: rgba(0,0,0,0.15); stroke-width: 0.5px;" />`;
  return { svg, width };
}

export interface TextLineOptions {
  fontSize: number;
  weight: number;
  fill: string;
  anchor: "start" | "middle" | "end";
  letterSpacing?: number;
  uppercase?: boolean;
  underline?: boolean;
  /** NEON_NIGHTLIFE only -- see glyphLineSvg. */
  glowColor?: string | null;
  /** POLAROID_LIFESTYLE's caption: a deterministic, vector-only "handwritten"
   * feel via a cheap italic-style skew transform on the glyph paths --
   * never a second font file, never an emoji, matches this module's own
   * "no host-font/emoji dependency" rule. Degrees, negative = right-leaning. */
  skewDegrees?: number;
}

/** Shared multi-line glyph-path emitter used by every archetype's
 * headline/supporting/brand-label/CTA-as-text blocks -- keeps the paint-
 * order stroke outline (real legibility fix: thin dark stroke behind
 * every on-photo glyph so it survives an unpredictable photo region
 * behind it) in exactly one place. */
export function renderTextLines(lines: string[], x: number, yStart: number, lineHeight: number, opts: TextLineOptions): string {
  const font = getFont(opts.weight);
  const letterSpacingPx = opts.letterSpacing ?? 0;
  let svg = "";
  let y = yStart;
  for (const line of lines) {
    const content = opts.uppercase ? line.toUpperCase() : line;
    const { svg: lineSvg, width } = glyphLineSvg(font, content, x, y, opts.fontSize, opts.anchor, letterSpacingPx, opts.fill, opts.glowColor);
    let lineOut = lineSvg;
    if (opts.underline) {
      let underlineX = x;
      if (opts.anchor === "middle") underlineX = x - width / 2;
      else if (opts.anchor === "end") underlineX = x - width;
      const underlineY = y + opts.fontSize * 0.12;
      lineOut += `<rect x="${round2(underlineX)}" y="${round2(underlineY)}" width="${round2(width)}" height="${Math.max(1, round2(opts.fontSize * 0.05))}" fill="${escapeXml(opts.fill)}" />`;
    }
    if (opts.skewDegrees) {
      // skewX(deg) maps (px,py) -> (px + py*tan(deg), py) -- a point's
      // horizontal shift depends on ITS OWN y, not x. Compensating by
      // translating back -y*tan(deg) keeps this line anchored at its
      // intended position instead of drifting sideways by that amount.
      const compensation = -y * Math.tan((opts.skewDegrees * Math.PI) / 180);
      lineOut = `<g transform="translate(${round2(compensation)}, 0) skewX(${opts.skewDegrees})">${lineOut}</g>`;
    }
    svg += lineOut;
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
  fill: string;
  textColor: string;
}
interface CtaPillResult {
  svg: string;
  height: number;
}

/** Real bug found on real generated output: a genuinely good, specific CTA
 * ("...book a consultation at our Indiranagar clinic") was never wrapped --
 * a single long line overflowed past both canvas edges and got clipped,
 * and the pill was sized from a rough estimate so it (and the text inside
 * it) silently ran off-canvas. Sized here from the actual wrapped line
 * count and real measured glyph widths, hard-capped to maxWidth so neither
 * the pill nor its text can ever extend past the safe area. */
function buildCtaPillSvg(ctaText: string, opts: CtaPillOptions): CtaPillResult {
  const font = getFont(700);
  const lines = wrapText(font, ctaText, Math.max(40, opts.maxWidth - opts.fontSize * 2.2), opts.fontSize);
  const lineHeight = opts.fontSize * 1.2;
  const padX = opts.fontSize * 1.1;
  const padY = opts.fontSize * 0.55;
  const longestLine = lines.reduce((a, b) => (measureWidth(font, b, opts.fontSize) > measureWidth(font, a, opts.fontSize) ? b : a), "");
  const textWidth = measureWidth(font, longestLine, opts.fontSize);
  const pillWidth = Math.min(textWidth + padX * 2, opts.maxWidth);
  const pillHeight = lines.length * lineHeight + padY * 2 - (lineHeight - opts.fontSize);
  const pillX = opts.centerX - pillWidth / 2;
  const pillY = opts.top;
  const textStartY = pillY + padY + opts.fontSize * 0.85;

  const text = renderTextLines(lines, opts.centerX, textStartY, lineHeight, {
    fontSize: opts.fontSize, weight: 700, fill: opts.textColor, anchor: "middle",
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
// involved -- the same reasoning that led to glyph-path text above.

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

/** Filled circle with a checkmark stroke -- FEATURE_POSTER's differentiator
 * list uses this SAME icon for every row (a real, deliberate design choice,
 * not a shortcut: since the differentiator TEXT is arbitrary real business
 * data, there is no reliable way to pick a semantically-matched icon per
 * row without guessing; one consistent "this is a real benefit" mark, the
 * same convention countless real feature-list ads use, reads as more
 * intentional than a mismatched icon). Built from primitives only, same
 * rule as every other icon in this file. */
export function iconCheckCircle(x: number, y: number, size: number, fillColor: string, checkColor: string): string {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2;
  const checkStroke = Math.max(1.5, size * 0.11);
  const p1x = cx - r * 0.42;
  const p1y = cy + r * 0.02;
  const p2x = cx - r * 0.1;
  const p2y = cy + r * 0.34;
  const p3x = cx + r * 0.46;
  const p3y = cy - r * 0.32;
  return (
    `<circle cx="${round2(cx)}" cy="${round2(cy)}" r="${round2(r)}" fill="${escapeXml(fillColor)}" />` +
    `<path d="M ${round2(p1x)} ${round2(p1y)} L ${round2(p2x)} ${round2(p2y)} L ${round2(p3x)} ${round2(p3y)}" fill="none" stroke="${escapeXml(checkColor)}" stroke-width="${round2(checkStroke)}" stroke-linecap="round" stroke-linejoin="round" />`
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

  const font = getFont(500);
  const iconSize = Math.round(opts.fontSize * 1.15);
  const gap = Math.round(opts.fontSize * 0.4);
  const rowGap = Math.round(opts.fontSize * 0.5);
  const textMaxWidth = Math.max(20, opts.maxWidth - iconSize - gap);

  let svg = "";
  let y = opts.yTop;
  for (const row of rows) {
    const text = truncateToWidth(font, row.text, textMaxWidth, opts.fontSize);
    const textWidth = measureWidth(font, text, opts.fontSize);
    const rowWidth = iconSize + gap + textWidth;
    const iconX = opts.align === "middle" ? opts.x - rowWidth / 2 : opts.x;
    const textX = iconX + iconSize + gap;
    const textY = y + iconSize * 0.75;
    svg += CONTACT_ICONS[row.kind](iconX, y, iconSize, opts.color);
    svg += glyphLineSvg(font, text, textX, textY, opts.fontSize, "start", 0, opts.color).svg;
    y += iconSize + rowGap;
  }
  return { svg, height: y - opts.yTop - rowGap };
}

export interface TextOverlayLayoutInput {
  width: number;
  height: number;
  elements: OnImageTextElement[];
  /** Accepted for forward-compatibility but not currently used to select a
   * different embedded font -- every personality renders in the same
   * embedded Inter face today (see the module docblock's HONEST
   * LIMITATION). A distinct embedded font per personality is the natural
   * v2. */
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
  /** A real raster brand logo (already-uploaded tenant asset), composited
   * with its aspect ratio preserved -- never stretched. Used directly when
   * `logoVariants` isn't supplied (backward compat / single-variant
   * callers); ignored in favor of the archetype-resolved pick from
   * `logoVariants` when both are present. HONEST SCOPE: only
   * BASIC_ESSENTIAL and FLOATING_CARD actually place a real logo image
   * today -- every other archetype still falls back to the text-glyph
   * brand label regardless of what's supplied here. Wiring the remaining
   * 10 archetypes is a real, tracked follow-up, not silently claimed as
   * complete. When absent (still the common case for many tenants without
   * a saved logo), every archetype's existing text-glyph brand label is
   * unaffected. */
  logoImage?: LogoAsset | null;
  /** BrandBrain Logo Engine (Phase 3/4): the tenant's full set of
   * generated logo variants (lib/brand/logo-analyzer.ts), keyed by kind.
   * When supplied, `selectLogoVariant` picks the archetype-appropriate
   * one automatically (e.g. a mono-light knockout for a dark/photo
   * background, a bounded badge for a busy photo surface) instead of the
   * caller guessing -- see ARCHETYPE_LOGO_SURFACE below. */
  logoVariants?: LogoVariantBundle | null;
  /** FEATURE_POSTER only: the real generated/uploaded photo, as a data URI
   * -- every other archetype uses the base image as the full-bleed
   * background (sharp composites this SVG on top of the real photo
   * directly), but FEATURE_POSTER needs the photo bounded to one panel on
   * a light background, which only an in-SVG `<image>` can do. Populated
   * by renderTextOverlay itself from its own `baseImage` argument -- no
   * caller needs to pass this. */
  photoDataUri?: string | null;
  /** FEATURE_POSTER only: up to 3 of the business's own real, on-file
   * differentiator phrases (Brand Brain content.description, split into
   * clauses) for the icon-led benefit list. Never AI-invented -- an empty
   * array renders no list at all rather than a placeholder. */
  differentiators?: string[];
}

/** One resolved, ready-to-composite logo image -- a data URI (not a
 * remote URL; every caller resolves bytes itself, matching every other
 * asset this compositor touches) plus enough metadata to place it without
 * distortion. */
export interface LogoAsset {
  dataUri: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  aspectRatio: number;
}

export type LogoVariantKind = "transparent" | "monoLight" | "monoDark" | "badge";

/** Not every variant is guaranteed to exist (e.g. a tenant who saved a
 * logo before the Logo Engine shipped may only have `transparent`) --
 * selectLogoVariant always has a real fallback chain regardless of which
 * keys are actually present. */
export type LogoVariantBundle = Partial<Record<LogoVariantKind, LogoAsset>>;

/** Real per-archetype "what does the logo actually sit on" surface tone
 * -- the single place that decision is made, so extending logo placement
 * to the other 10 archetypes later needs no further policy work, just
 * wiring buildLogoImageSvg into each builder. Covers all 12 even though
 * only 2 place a real logo today (see TextOverlayLayoutInput's own scope
 * note above). */
const ARCHETYPE_LOGO_SURFACE: Record<LayoutArchetype, LogoVariantKind> = {
  BASIC_ESSENTIAL: "monoLight", // sits on the brand-primary-color band -- a flat white mark reads reliably regardless of the tenant's actual brand color
  SPLIT_BANNER: "monoLight", // same brand-color band pattern
  FLOATING_CARD: "monoDark", // sits inside its own translucent light chip
  EDITORIAL_FRAME: "badge", // sits directly on the photo -- needs its own contained surface
  MINIMAL_FOOTER_STRIP: "monoLight", // full-bleed photo with a dark scrim footer
  ELEVATED_BADGE: "badge", // photo-first with floating UI elements -- same contained-surface need
  DUAL_TONE_SIDEBAR: "monoLight", // sidebar is brand-primary-color filled
  FROSTED_GLASS_CENTER: "badge", // frosted card floats over a photo
  TYPOGRAPHIC_HERO: "badge", // dark photo wash background
  POLAROID_LIFESTYLE: "monoDark", // polaroid border is white/cream
  CLINICAL_TRUST: "monoDark", // light, clinical background
  NEON_NIGHTLIFE: "monoLight", // genuinely dark, atmospheric background
  FEATURE_POSTER: "monoDark", // light/white poster background -- a dark or full-color mark reads reliably
};

/** Resolves which logo asset (if any) an archetype should actually
 * composite: the archetype-appropriate variant from `logoVariants` when
 * present (falling through transparent -> badge -> monoLight -> monoDark
 * if the preferred kind wasn't generated for this tenant), else the
 * single `logoImage` for backward-compat callers, else null (falls back
 * to the text-glyph brand label at the call site, same as always). */
export function selectLogoVariant(input: Pick<TextOverlayLayoutInput, "logoImage" | "logoVariants" | "layoutArchetype">): LogoAsset | null {
  if (input.logoVariants) {
    const preferred = ARCHETYPE_LOGO_SURFACE[input.layoutArchetype];
    const resolved = input.logoVariants[preferred] ?? input.logoVariants.transparent ?? input.logoVariants.badge ?? input.logoVariants.monoLight ?? input.logoVariants.monoDark;
    if (resolved) return resolved;
  }
  return input.logoImage ?? null;
}

/** Composites a real raster logo into a bounding box with its aspect
 * ratio preserved (never stretched to fill) -- `<image>` is a standard
 * SVG primitive every rasterizer supports natively, the same reasoning
 * that keeps every icon in this file to primitives rather than filters.
 * Returns null (render nothing) when no logo was supplied, so callers can
 * use `logoSvg ?? <text-glyph fallback>` in one expression. */
export function buildLogoImageSvg(logoImage: TextOverlayLayoutInput["logoImage"], boxX: number, boxY: number, boxWidth: number, boxHeight: number): string | null {
  if (!logoImage || !logoImage.aspectRatio || logoImage.aspectRatio <= 0) return null;
  let renderWidth = boxWidth;
  let renderHeight = renderWidth / logoImage.aspectRatio;
  if (renderHeight > boxHeight) {
    renderHeight = boxHeight;
    renderWidth = renderHeight * logoImage.aspectRatio;
  }
  const x = boxX + (boxWidth - renderWidth) / 2;
  const y = boxY + (boxHeight - renderHeight) / 2;
  return `<image href="${escapeXml(logoImage.dataUri)}" x="${round2(x)}" y="${round2(y)}" width="${round2(renderWidth)}" height="${round2(renderHeight)}" preserveAspectRatio="xMidYMid meet" />`;
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
  const { width, height } = input;
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
      fontSize: brandFS, weight: 700, fill: bandTextColor, anchor: "start", letterSpacing: Math.round(brandFS * 0.12),
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
    const lines = wrapText(getFont(800), headline.text.trim(), safeWidth, fontSize);
    const lineHeight = fontSize * 1.15;
    parts.push(renderTextLines(lines, margin, y + fontSize, lineHeight, { fontSize, weight: 800, fill: bandTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.015);
  }

  if (supporting?.text.trim()) {
    const fontSize = Math.round(width * 0.028);
    const lines = wrapText(getFont(400), supporting.text.trim(), safeWidth, fontSize);
    const lineHeight = fontSize * 1.35;
    parts.push(renderTextLines(lines, margin, y + fontSize, lineHeight, { fontSize, weight: 400, fill: bandTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.02);
  }

  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.032);
    const pill = buildCtaPillSvg(cta.text.trim(), {
      centerX: margin + safeWidth / 2, top: y, maxWidth: safeWidth, fontSize, fill: secondary, textColor: pillTextColor,
    });
    parts.push(pill.svg);
    y += pill.height + Math.round(width * 0.025);
  }

  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: margin, yTop: y, maxWidth: safeWidth,
    fontSize: Math.round(width * 0.024), color: bandTextColor, align: "start",
  });
  if (footer.svg) {
    parts.push(footer.svg);
    y += footer.height;
  }

  const contentHeight = y + paddingBottom;
  const targetBandHeight = Math.round(height * 0.3);
  // No upper cap: "MUST prevent clipping" is non-negotiable, and a real
  // combination of headline+supporting+CTA+2-row contact footer can
  // legitimately need more than a fixed ceiling would allow (found via
  // real visual inspection of a stress case) -- the band grows to fit its
  // actual content, never clips it, with only a floor for short content
  // so the band still reads as a deliberate ~30% block, not a sliver.
  const bandHeight = Math.max(contentHeight, targetBandHeight);
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
  const { width, height } = input;
  const primary = input.primaryColor ?? input.accentColor ?? "#14181F";
  const secondary = input.secondaryColor ?? input.accentColor ?? primary;
  const { headline, supporting, cta, brandLabel } = picked;

  const parts: string[] = [];
  const brandFS = Math.round(width * 0.026);
  const chipMargin = Math.round(width * 0.07);
  const resolvedLogo = selectLogoVariant(input);
  if (resolvedLogo) {
    const logoBoxHeight = Math.round(brandFS * 1.9);
    const logoBoxWidth = Math.round(logoBoxHeight * resolvedLogo.aspectRatio);
    const chipX = width - chipMargin - logoBoxWidth - brandFS * 0.5;
    const chipY = chipMargin * 0.9 - logoBoxHeight;
    parts.push(`<rect x="${round2(chipX - brandFS * 0.4)}" y="${round2(chipY - brandFS * 0.35)}" width="${round2(logoBoxWidth + brandFS * 0.8)}" height="${round2(logoBoxHeight + brandFS * 0.7)}" rx="${round2(brandFS * 0.4)}" fill="${escapeXml(primary)}" fill-opacity="0.82" />`);
    const logoSvg = buildLogoImageSvg(resolvedLogo, chipX, chipY, logoBoxWidth, logoBoxHeight);
    if (logoSvg) parts.push(logoSvg);
  } else if (brandLabel.text.trim()) {
    const text = brandLabel.text.trim();
    const chipFont = getFont(700);
    const textWidth = measureWidth(chipFont, text, brandFS);
    const padX = brandFS * 0.7;
    const padY = brandFS * 0.45;
    const chipX = width - chipMargin - textWidth - padX * 2;
    const chipY = chipMargin * 0.9 - brandFS - padY;
    const chipTextColor = legibleTextColorFor(primary);
    parts.push(`<rect x="${round2(chipX)}" y="${round2(chipY)}" width="${round2(textWidth + padX * 2)}" height="${round2(brandFS + padY * 2)}" rx="${round2(brandFS * 0.4)}" fill="${escapeXml(primary)}" fill-opacity="0.82" />`);
    parts.push(renderTextLines([text], width - chipMargin, chipMargin * 0.9, brandFS * 1.2, {
      fontSize: brandFS, weight: 700, fill: chipTextColor, anchor: "end",
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
    const lines = wrapText(getFont(800), headline.text.trim(), cardInnerWidth, fontSize);
    const lineHeight = fontSize * 1.15;
    inner.push(renderTextLines(lines, 0, y + fontSize, lineHeight, { fontSize, weight: 800, fill: cardTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.015);
  }

  if (supporting?.text.trim()) {
    const fontSize = Math.round(width * 0.024);
    const lines = wrapText(getFont(400), supporting.text.trim(), cardInnerWidth, fontSize);
    const lineHeight = fontSize * 1.35;
    inner.push(renderTextLines(lines, 0, y + fontSize, lineHeight, { fontSize, weight: 400, fill: cardTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.02);
  }

  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.028);
    const pillTextColor = legibleTextColorFor(secondary);
    const pill = buildCtaPillSvg(cta.text.trim(), {
      centerX: cardInnerWidth / 2, top: y, maxWidth: cardInnerWidth, fontSize, fill: secondary, textColor: pillTextColor,
    });
    inner.push(pill.svg);
    y += pill.height + Math.round(width * 0.02);
  }

  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: 0, yTop: y, maxWidth: cardInnerWidth,
    fontSize: Math.round(width * 0.021), color: cardTextColor, align: "start",
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
  const { width, height, textColor } = input;
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
      fontSize: brandFS, weight: 700, fill: textColor, anchor: "middle",
      letterSpacing: Math.round(brandFS * 0.3), uppercase: true,
    }));
  }

  // Contact footer height is computed once up front (yTop=0 is a throwaway
  // probe) so the footer can be bottom-anchored AND the headline stack
  // above it can be sized to clear it -- both without a second pass.
  const footerFontSize = Math.round(width * 0.02);
  const footerProbe = buildContactFooterSvg({
    contact: input.contactInfo, x: width / 2, yTop: 0, maxWidth: safeWidth, fontSize: footerFontSize, color: textColor, align: "middle",
  });
  const footerTop = height - contentPad - footerProbe.height;

  // Phase 1: compute the centered text stack's total height WITHOUT
  // emitting SVG yet, so its start position can be chosen to clear the
  // footer (shift up, never overlap or truncate).
  const ruleHeight = Math.max(2, Math.round(width * 0.005));
  const ruleGap = Math.round(width * 0.025);
  let stackHeight = ruleHeight + ruleGap;

  const headlineFontSize = Math.round(width * 0.044);
  const headlineLines = headline?.text.trim() ? wrapText(getFont(700), headline.text.trim(), Math.round(safeWidth * 0.82), headlineFontSize) : [];
  const headlineLineHeight = headlineFontSize * 1.15;
  if (headlineLines.length) stackHeight += headlineLines.length * headlineLineHeight + Math.round(width * 0.018);

  const supportingFontSize = Math.round(width * 0.024);
  const supportingLines = supporting?.text.trim() ? wrapText(getFont(400), supporting.text.trim(), Math.round(safeWidth * 0.82), supportingFontSize) : [];
  const supportingLineHeight = supportingFontSize * 1.35;
  if (supportingLines.length) stackHeight += supportingLines.length * supportingLineHeight + Math.round(width * 0.018);

  const ctaFontSize = Math.round(width * 0.026);
  const ctaLines = cta?.text.trim() ? wrapText(getFont(700), cta.text.trim(), Math.round(safeWidth * 0.7), ctaFontSize) : [];
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
      fontSize: headlineFontSize, weight: 700, fill: textColor, anchor: "middle",
    }));
    y += headlineLines.length * headlineLineHeight + Math.round(width * 0.018);
  }

  if (supportingLines.length) {
    midParts.push(renderTextLines(supportingLines, centerX, y + supportingFontSize, supportingLineHeight, {
      fontSize: supportingFontSize, weight: 400, fill: textColor, anchor: "middle",
    }));
    y += supportingLines.length * supportingLineHeight + Math.round(width * 0.018);
  }

  if (ctaLines.length) {
    // No pill -- understated underlined text in the brand accent color
    // instead of a graphic button, per this archetype's own restraint.
    midParts.push(renderTextLines(ctaLines, centerX, y + ctaFontSize, ctaLineHeight, {
      fontSize: ctaFontSize, weight: 700, fill: secondary, anchor: "middle", underline: true,
    }));
    y += ctaLines.length * ctaLineHeight;
  }

  midParts.push(`<rect x="${round2(centerX - ruleWidth / 2)}" y="${round2(y)}" width="${ruleWidth}" height="${ruleHeight}" fill="${escapeXml(secondary)}" />`);

  parts.push(...midParts);

  if (footerProbe.height) {
    const footer = buildContactFooterSvg({
      contact: input.contactInfo, x: centerX, yTop: footerTop, maxWidth: safeWidth, fontSize: footerFontSize, color: textColor, align: "middle",
    });
    parts.push(footer.svg);
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

/**
 * BASIC_ESSENTIAL: the Starter (₹2,999) automated-tier safe default and
/**
 * Clean Logo Watermark Compositor (Failure A + Failure E Fix):
 * When no on-image headline/CTA is planned (the Social Autopilot default),
 * cleanly composites the customer's actual stored logo in a safe corner
 * with aspect ratio preserved, or renders nothing if no real logo exists.
 * Never creates an artificial text panel, fake logo, or blue slab.
 */
function buildCleanLogoWatermarkSvg(input: TextOverlayLayoutInput, resolvedLogo: LogoAsset | null, brandLabelText: string): string {
  const { width, height } = input;
  if (resolvedLogo && resolvedLogo.dataUri) {
    const margin = Math.round(width * 0.05);
    const brandFS = Math.round(width * 0.026);
    const logoBoxHeight = Math.round(brandFS * 2.4);
    const logoBoxWidth = Math.round(logoBoxHeight * (resolvedLogo.aspectRatio > 0 ? resolvedLogo.aspectRatio : 1));
    const x = width - margin - logoBoxWidth;
    const y = margin;
    const pad = Math.round(brandFS * 0.45);
    const logoSvg = buildLogoImageSvg(resolvedLogo, x, y, logoBoxWidth, logoBoxHeight);
    if (!logoSvg) return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"></svg>`;
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="${round2(x - pad)}" y="${round2(y - pad)}" width="${round2(logoBoxWidth + pad * 2)}" height="${round2(logoBoxHeight + pad * 2)}" rx="${round2(pad)}" fill="#000000" fill-opacity="0.30" />${logoSvg}</svg>`;
  }
  // Real defect found live during visual inspection (Creative Generation
  // Architecture Repair, 2026-09-07): a tenant with no uploaded logo image
  // shipped a fully unbranded creative for every photo-only post (no
  // headline, no supporting line, no CTA -- exactly what PHOTOGRAPHIC_AD/
  // BRAND_STORY/LOCAL_BUSINESS_AD legitimately produce) -- literally
  // nothing on the image identified whose business it was. "Never invent
  // one or draw fake text panels" (the original rule this function's
  // comment stated) is about never fabricating a LOGO GRAPHIC or a made-up
  // panel of copy -- it was never a reason to omit the business's own REAL,
  // verified name as plain text. Every other archetype already falls back
  // to plain brand-name text when no logo image exists (see
  // composition-render.ts's own brand lockup); this watermark path was the
  // one place that fell back to nothing instead. `brandLabelText` is
  // always the real business name (pickElements defaults it from
  // `businessName`, never invented) -- rendering it is not "inventing"
  // anything.
  if (!brandLabelText.trim()) return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  const margin = Math.round(width * 0.05);
  const brandFS = Math.round(width * 0.026);
  const font = getFont(700);
  const text = brandLabelText.trim().toUpperCase();
  const letterSpacing = Math.round(brandFS * 0.1);
  const textWidth = measureWidth(font, text, brandFS, letterSpacing);
  const padX = Math.round(brandFS * 0.6);
  const padY = Math.round(brandFS * 0.5);
  const boxW = textWidth + padX * 2;
  const boxH = brandFS * 1.3 + padY * 2;
  const x = width - margin - boxW;
  const y = margin;
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="${round2(x)}" y="${round2(y)}" width="${round2(boxW)}" height="${round2(boxH)}" rx="${round2(boxH / 2)}" fill="#000000" fill-opacity="0.30" />${renderTextLines([text], x + padX, y + padY + brandFS * 0.92, brandFS * 1.2, { fontSize: brandFS, weight: 700, fill: "#FFFFFF", anchor: "start", letterSpacing })}</svg>`;
}

/**
 * BASIC_ESSENTIAL: the Starter (₹2,999) automated-tier safe default and
 * the ₹7,999+ tenant's own "reliable" pick. When headline/supporting text
 * is present, renders a compact bottom band. When no text is planned (photo-first),
 * renders only the clean logo watermark without any bottom panel.
 */
function buildBasicEssentialSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height } = input;
  const primary = input.primaryColor ?? input.accentColor ?? "#14181F";
  const secondary = input.secondaryColor ?? input.accentColor ?? "#FFFFFF";
  const bandTextColor = legibleTextColorFor(primary);
  const pillTextColor = legibleTextColorFor(secondary);
  const { headline, supporting, cta, brandLabel } = picked;
  const resolvedLogo = selectLogoVariant(input);

  const hasTextContent = Boolean(headline?.text.trim() || supporting?.text.trim() || cta?.text.trim());
  if (!hasTextContent) {
    return buildCleanLogoWatermarkSvg(input, resolvedLogo, brandLabel.text.trim());
  }

  const margin = Math.round(width * 0.08);
  const safeWidth = width - margin * 2;
  const padding = Math.round(width * 0.045);

  const parts: string[] = [];
  let y = padding;

  const brandFS = Math.round(width * 0.024);
  const logoBoxHeight = Math.round(brandFS * 1.7);
  const logoSvg = buildLogoImageSvg(resolvedLogo, margin, y, Math.round(logoBoxHeight * (resolvedLogo?.aspectRatio ?? 1)), logoBoxHeight);
  if (logoSvg) {
    parts.push(logoSvg);
    y += logoBoxHeight + Math.round(width * 0.012);
  } else if (brandLabel.text.trim()) {
    parts.push(renderTextLines([brandLabel.text.trim()], margin, y + brandFS, brandFS * 1.2, {
      fontSize: brandFS, weight: 700, fill: bandTextColor, anchor: "start",
    }));
    y += brandFS * 1.5;
  }

  if (headline?.text.trim()) {
    const fontSize = Math.round(width * 0.044);
    // Conservative wrap width (92% of safeWidth, not the full amount) and
    // a hard cap at 3 lines -- "minimal risk of rendering failure" means
    // erring toward MORE headroom than every other archetype, not less.
    const lines = wrapTextWithEllipsis(getFont(800), headline.text.trim(), Math.round(safeWidth * 0.92), fontSize, 3);
    const lineHeight = fontSize * 1.18;
    parts.push(renderTextLines(lines, margin, y + fontSize, lineHeight, { fontSize, weight: 800, fill: bandTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.018);
  }

  if (supporting?.text.trim()) {
    const fontSize = Math.round(width * 0.026);
    const lines = wrapTextWithEllipsis(getFont(400), supporting.text.trim(), safeWidth, fontSize, 2);
    const lineHeight = fontSize * 1.35;
    parts.push(renderTextLines(lines, margin, y + fontSize, lineHeight, { fontSize, weight: 400, fill: bandTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.02);
  }

  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.03);
    const pill = buildCtaPillSvg(cta.text.trim(), {
      centerX: margin + safeWidth / 2, top: y, maxWidth: safeWidth, fontSize, fill: secondary, textColor: pillTextColor,
    });
    parts.push(pill.svg);
    y += pill.height + Math.round(width * 0.022);
  }

  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: margin, yTop: y, maxWidth: safeWidth,
    fontSize: Math.round(width * 0.022), color: bandTextColor, align: "start",
  });
  if (footer.svg) {
    parts.push(footer.svg);
    y += footer.height;
  }

  const contentHeight = y + padding;
  const targetBandHeight = Math.round(height * 0.23);
  const bandHeight = Math.max(contentHeight, targetBandHeight);
  const bandTop = height - bandHeight;

  const band = `<rect x="0" y="${round2(bandTop)}" width="${width}" height="${round2(bandHeight)}" fill="${escapeXml(primary)}" fill-opacity="0.90" />` +
    `<rect x="0" y="${round2(bandTop)}" width="${width}" height="3" fill="${escapeXml(secondary)}" />`;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${band}<g transform="translate(0, ${round2(bandTop)})">${parts.join("")}</g></svg>`;
}

/**
 * MINIMAL_FOOTER_STRIP: full-bleed hero image, a very restrained bottom
 * utility strip (~15% of canvas, capped 22%) for brand + a single
 * supporting line/CTA -- premium/luxury feel via what it deliberately
 * omits. A thin hairline (not a thick accent block) separates strip from
 * photo.
 */
function buildMinimalFooterStripSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height } = input;
  const primary = input.primaryColor ?? input.accentColor ?? "#14181F";
  const secondary = input.secondaryColor ?? input.accentColor ?? primary;
  const stripTextColor = legibleTextColorFor(primary);
  const { headline, supporting, cta, brandLabel } = picked;

  const margin = Math.round(width * 0.07);
  const safeWidth = width - margin * 2;
  const padding = Math.round(width * 0.035);
  const hairlineHeight = Math.max(1, Math.round(width * 0.003));

  const parts: string[] = [];
  let y = padding + hairlineHeight + Math.round(width * 0.015);

  const brandFS = Math.round(width * 0.024);
  if (brandLabel.text.trim()) {
    parts.push(renderTextLines([brandLabel.text.trim()], margin, y + brandFS, brandFS * 1.2, {
      fontSize: brandFS, weight: 700, fill: stripTextColor, anchor: "start", letterSpacing: Math.round(brandFS * 0.08),
    }));
    y += brandFS * 1.4;
  }

  // Deliberately no headline stack per the registry's own constraint --
  // at most one short line, rendered small and restrained, never a bold
  // display headline (that would fight the "full-bleed hero" idea). Real
  // bug found via testing: wrapping and then keeping only the first line
  // silently DROPPED the rest of a genuinely long headline with no
  // indication anything was cut -- truncateToWidth (real font-metric
  // ellipsis) at least signals "there's more" instead of losing text
  // invisibly.
  const short = headline?.text.trim() || supporting?.text.trim();
  if (short) {
    const fontSize = Math.round(width * 0.022);
    const line = truncateToWidth(getFont(400), short, safeWidth, fontSize);
    parts.push(renderTextLines([line], margin, y + fontSize, fontSize * 1.3, { fontSize, weight: 400, fill: stripTextColor, anchor: "start" }));
    y += fontSize * 1.3 + Math.round(width * 0.012);
  }

  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.024);
    const pillTextColor = legibleTextColorFor(secondary);
    const pill = buildCtaPillSvg(cta.text.trim(), {
      centerX: margin + safeWidth / 2, top: y, maxWidth: safeWidth, fontSize, fill: secondary, textColor: pillTextColor,
    });
    parts.push(pill.svg);
    y += pill.height + Math.round(width * 0.012);
  }

  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: margin, yTop: y, maxWidth: safeWidth,
    fontSize: Math.round(width * 0.02), color: stripTextColor, align: "start",
  });
  if (footer.svg) {
    parts.push(footer.svg);
    y += footer.height;
  }

  const contentHeight = y + padding;
  const targetStripHeight = Math.round(height * 0.15);
  // No upper cap -- real bug found via visual inspection: a realistic
  // combination of brand + one short line + CTA + a 2-row contact footer
  // (both phone and website present) genuinely needed more than a fixed
  // ~22% ceiling, and the footer's second row was rendering past the
  // strip's own bottom edge, clipped off-canvas. "Very restrained" is the
  // common case by construction (this archetype limits itself to one
  // short line, never a headline+supportingLine stack); it is not worth
  // clipping the rare case that needs more room.
  const stripHeight = Math.max(contentHeight, targetStripHeight);
  const stripTop = height - stripHeight;

  const strip =
    `<rect x="0" y="${round2(stripTop)}" width="${width}" height="${round2(stripHeight)}" fill="${escapeXml(primary)}" />` +
    `<rect x="0" y="${round2(stripTop)}" width="${width}" height="${hairlineHeight}" fill="${escapeXml(secondary)}" />`;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${strip}<g transform="translate(0, ${round2(stripTop)})">${parts.join("")}</g></svg>`;
}

/**
 * ELEVATED_BADGE: photo-dominant with a circular promotional badge
 * anchored to the top-right corner (a soft layered "shadow" behind it,
 * simulated with a duplicate offset lower-opacity circle rather than a
 * filter). A small brand chip lives in the opposite (bottom-left) corner
 * so it never competes with the badge; CTA (if present) sits as a small
 * pill just below the badge.
 */
function buildElevatedBadgeSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height, textColor } = input;
  const primary = input.primaryColor ?? input.accentColor ?? "#14181F";
  const secondary = input.secondaryColor ?? input.accentColor ?? primary;
  const { headline, cta, brandLabel } = picked;

  const parts: string[] = [];

  // Brand chip, bottom-left -- the corner the badge never touches.
  const brandFS = Math.round(width * 0.024);
  const chipMargin = Math.round(width * 0.07);
  if (brandLabel.text.trim()) {
    const text = brandLabel.text.trim();
    const chipFont = getFont(700);
    const textWidth = measureWidth(chipFont, text, brandFS);
    const padX = brandFS * 0.7;
    const padY = brandFS * 0.45;
    const chipY = height - chipMargin * 0.9 - brandFS * 0.3;
    const chipTextColor = legibleTextColorFor(primary);
    parts.push(`<rect x="${round2(chipMargin - padX)}" y="${round2(chipY - brandFS - padY)}" width="${round2(textWidth + padX * 2)}" height="${round2(brandFS + padY * 2)}" rx="${round2(brandFS * 0.4)}" fill="${escapeXml(primary)}" fill-opacity="0.82" />`);
    parts.push(renderTextLines([text], chipMargin, chipY, brandFS * 1.2, { fontSize: brandFS, weight: 700, fill: chipTextColor, anchor: "start" }));
  }

  // Badge, top-right.
  const badgeDiameter = Math.round(width * 0.32);
  const badgeMargin = Math.round(width * 0.08);
  const badgeCx = width - badgeMargin - badgeDiameter / 2;
  const badgeCy = badgeMargin + badgeDiameter / 2;
  const badgeTextColor = legibleTextColorFor(secondary);

  // Layered shadow: a larger, offset, low-opacity dark circle behind the
  // real badge -- a real (if simple) elevation cue, no filter dependency.
  const shadowOffset = Math.round(width * 0.01);
  parts.push(`<circle cx="${round2(badgeCx + shadowOffset)}" cy="${round2(badgeCy + shadowOffset * 1.4)}" r="${round2(badgeDiameter / 2 + width * 0.006)}" fill="#000000" fill-opacity="0.28" />`);
  parts.push(`<circle cx="${round2(badgeCx)}" cy="${round2(badgeCy)}" r="${round2(badgeDiameter / 2)}" fill="${escapeXml(secondary)}" />`);
  // Thin inner ring in the primary color -- a deliberate two-tone badge
  // edge instead of a flat single-color sticker.
  parts.push(`<circle cx="${round2(badgeCx)}" cy="${round2(badgeCy)}" r="${round2(badgeDiameter / 2 - width * 0.012)}" fill="none" stroke="${escapeXml(primary)}" stroke-width="${round2(width * 0.004)}" />`);

  if (headline?.text.trim()) {
    const fontSize = Math.round(width * 0.032);
    const badgeTextWidth = Math.round(badgeDiameter * 0.68);
    const lines = wrapTextWithEllipsis(getFont(800), headline.text.trim(), badgeTextWidth, fontSize, 3);
    const lineHeight = fontSize * 1.12;
    const totalTextHeight = lines.length * lineHeight;
    const startY = badgeCy - totalTextHeight / 2 + fontSize * 0.85;
    parts.push(renderTextLines(lines, badgeCx, startY, lineHeight, { fontSize, weight: 800, fill: badgeTextColor, anchor: "middle" }));
  }

  // Real bug found via visual inspection: centering the CTA pill and the
  // footer row directly on badgeCx/a right-edge x with a generous maxWidth
  // let a genuinely long CTA/URL extend past the canvas's right edge --
  // "middle" anchoring only guarantees symmetry AROUND its center point,
  // not that the whole shape stays on-canvas. Both are anchored here so
  // their full possible width (up to maxWidth) is guaranteed to fit
  // between the margins, not just centered under the badge.
  const rightSafeMaxWidth = Math.min(Math.round(width * 0.5), width - badgeMargin * 2);
  const rightSafeCenterX = width - badgeMargin - rightSafeMaxWidth / 2;

  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.026);
    const pillTextColor = legibleTextColorFor(primary);
    const pill = buildCtaPillSvg(cta.text.trim(), {
      centerX: rightSafeCenterX, top: badgeCy + badgeDiameter / 2 + Math.round(width * 0.03), maxWidth: rightSafeMaxWidth, fontSize, fill: primary, textColor: pillTextColor,
    });
    parts.push(pill.svg);
  }

  // Contact footer, bottom-right (mirrors the brand chip's bottom-left
  // anchor so neither corner competes with the badge above).
  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: rightSafeCenterX, yTop: height - chipMargin * 0.9 - Math.round(width * 0.05),
    maxWidth: rightSafeMaxWidth, fontSize: Math.round(width * 0.02), color: textColor, align: "middle",
  });
  if (footer.svg) parts.push(footer.svg);

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

/**
 * DUAL_TONE_SIDEBAR: a full-height brand-colored sidebar on the right
 * (~30% of canvas width, grows if content needs more, capped 42%)
 * against ~70% image -- strong asymmetrical composition, vertical text
 * stack instead of a horizontal band.
 */
function buildDualToneSidebarSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height } = input;
  const primary = input.primaryColor ?? input.accentColor ?? "#14181F";
  const secondary = input.secondaryColor ?? input.accentColor ?? "#FFFFFF";
  const sidebarTextColor = legibleTextColorFor(primary);
  const pillTextColor = legibleTextColorFor(secondary);
  const { headline, supporting, cta, brandLabel } = picked;

  const targetSidebarWidth = Math.round(width * 0.3);
  const padding = Math.round(width * 0.045);
  const innerWidth = targetSidebarWidth - padding * 2;

  const inner: string[] = [];
  let y = padding;

  const brandFS = Math.round(width * 0.026);
  if (brandLabel.text.trim()) {
    const lines = wrapText(getFont(700), brandLabel.text.trim(), innerWidth, brandFS);
    inner.push(renderTextLines(lines, 0, y + brandFS, brandFS * 1.25, { fontSize: brandFS, weight: 700, fill: sidebarTextColor, anchor: "start" }));
    y += lines.length * brandFS * 1.25;
    const accentLineWidth = Math.round(innerWidth * 0.3);
    const accentLineHeight = Math.max(2, Math.round(width * 0.006));
    inner.push(`<rect x="0" y="${round2(y + width * 0.015)}" width="${accentLineWidth}" height="${accentLineHeight}" fill="${escapeXml(secondary)}" />`);
    y += accentLineHeight + Math.round(width * 0.04);
  }

  if (headline?.text.trim()) {
    const fontSize = Math.round(width * 0.036);
    const lines = wrapText(getFont(800), headline.text.trim(), innerWidth, fontSize);
    const lineHeight = fontSize * 1.18;
    inner.push(renderTextLines(lines, 0, y + fontSize, lineHeight, { fontSize, weight: 800, fill: sidebarTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.02);
  }

  if (supporting?.text.trim()) {
    const fontSize = Math.round(width * 0.022);
    const lines = wrapText(getFont(400), supporting.text.trim(), innerWidth, fontSize);
    const lineHeight = fontSize * 1.4;
    inner.push(renderTextLines(lines, 0, y + fontSize, lineHeight, { fontSize, weight: 400, fill: sidebarTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.025);
  }

  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.026);
    const pill = buildCtaPillSvg(cta.text.trim(), {
      centerX: innerWidth / 2, top: y, maxWidth: innerWidth, fontSize, fill: secondary, textColor: pillTextColor,
    });
    inner.push(pill.svg);
    y += pill.height + Math.round(width * 0.025);
  }

  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: 0, yTop: y, maxWidth: innerWidth,
    fontSize: Math.round(width * 0.018), color: sidebarTextColor, align: "start",
  });
  if (footer.svg) {
    inner.push(footer.svg);
    y += footer.height;
  }

  const contentHeight = y + padding;
  // Unlike every band/strip/scrim archetype above, the sidebar's HEIGHT is
  // fixed at the full canvas height by definition (it's a full-height
  // vertical strip) -- there's no "grow the container" escape valve for
  // vertical overflow here the way a band can just get taller. The real
  // safeguard against clipping is a uniform scale-to-fit: if the vertical
  // stack would exceed the available height, shrink the whole content
  // group (never crop it) until it fits, with a floor so it never shrinks
  // into illegibility -- a denser sidebar is an acceptable trade, clipped
  // text is not.
  const availableHeight = height - padding * 2;
  const scale = contentHeight > availableHeight ? Math.max(0.55, availableHeight / contentHeight) : 1;
  const scaledContentHeight = contentHeight * scale;
  const sidebarWidth = targetSidebarWidth;
  const sidebarLeft = width - sidebarWidth;
  const verticalOffset = Math.max(0, (height - scaledContentHeight) / 2);

  const sidebar =
    `<rect x="${round2(sidebarLeft)}" y="0" width="${round2(sidebarWidth)}" height="${height}" fill="${escapeXml(primary)}" />` +
    `<rect x="${round2(sidebarLeft)}" y="0" width="${Math.max(3, Math.round(width * 0.006))}" height="${height}" fill="${escapeXml(secondary)}" />`;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${sidebar}<g transform="translate(${round2(sidebarLeft + padding)}, ${round2(verticalOffset)}) scale(${round2(scale)})">${inner.join("")}</g></svg>`;
}

/**
 * FROSTED_GLASS_CENTER: an atmospheric photo with a centered translucent
 * card -- "frost" simulated via a layered semi-opaque fill (never a real
 * blur filter, which this environment's rasterizer can't be trusted to
 * support -- the entire reason this file renders text as glyph paths
 * instead of relying on host font-shaping is exactly this class of
 * "assume the host supports X" risk). Minimal copy by design.
 */
function buildFrostedGlassCenterSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height, textColor } = input;
  const primary = input.primaryColor ?? input.accentColor ?? "#14181F";
  const secondary = input.secondaryColor ?? input.accentColor ?? primary;
  const { headline, cta, brandLabel } = picked;

  const cardIsLight = textColor.toUpperCase() !== "#FFFFFF";
  const cardFillColor = cardIsLight ? "#FFFFFF" : "#14181F";
  const cardTextColor = cardIsLight ? "#14181F" : "#FFFFFF";

  const cardWidth = Math.round(width * 0.78);
  const cardPadding = Math.round(width * 0.06);
  const innerWidth = cardWidth - cardPadding * 2;

  const inner: string[] = [];
  let y = 0;

  // Whichever of primary/secondary contrasts better against the card's
  // own fill -- real bug found via visual inspection: primary (a brand
  // navy) against a near-black card fill was nearly invisible.
  const tickColor = hexLuminance(primary) !== null && hexLuminance(cardFillColor) !== null && Math.abs((hexLuminance(primary) ?? 0) - (hexLuminance(cardFillColor) ?? 0)) < 0.25 ? secondary : primary;
  const accentTickWidth = Math.round(innerWidth * 0.16);
  const accentTickHeight = Math.max(3, Math.round(width * 0.008));
  inner.push(`<rect x="${round2(innerWidth / 2 - accentTickWidth / 2)}" y="0" width="${accentTickWidth}" height="${accentTickHeight}" rx="${round2(accentTickHeight / 2)}" fill="${escapeXml(tickColor)}" />`);
  y += accentTickHeight + Math.round(width * 0.03);

  if (headline?.text.trim()) {
    const fontSize = Math.round(width * 0.04);
    const lines = wrapText(getFont(700), headline.text.trim(), innerWidth, fontSize);
    const lineHeight = fontSize * 1.2;
    inner.push(renderTextLines(lines, innerWidth / 2, y + fontSize, lineHeight, { fontSize, weight: 700, fill: cardTextColor, anchor: "middle" }));
    y += lines.length * lineHeight + Math.round(width * 0.025);
  }

  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.026);
    const pillTextColor = legibleTextColorFor(secondary);
    const pill = buildCtaPillSvg(cta.text.trim(), {
      centerX: innerWidth / 2, top: y, maxWidth: innerWidth, fontSize, fill: secondary, textColor: pillTextColor,
    });
    inner.push(pill.svg);
    y += pill.height + Math.round(width * 0.02);
  }

  if (brandLabel.text.trim()) {
    const brandFS = Math.round(width * 0.022);
    inner.push(renderTextLines([brandLabel.text.trim()], innerWidth / 2, y + brandFS, brandFS * 1.2, {
      fontSize: brandFS, weight: 500, fill: cardTextColor, anchor: "middle", letterSpacing: Math.round(brandFS * 0.1),
    }));
    y += brandFS * 1.3 + Math.round(width * 0.015);
  }

  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: innerWidth / 2, yTop: y, maxWidth: innerWidth,
    fontSize: Math.round(width * 0.018), color: cardTextColor, align: "middle",
  });
  if (footer.svg) {
    inner.push(footer.svg);
    y += footer.height;
  }

  const contentHeight = y + cardPadding;
  // A generous cap, not a tight one -- "minimal copy by design" keeps
  // realistic content well under this in practice, but the cap itself
  // must never be tight enough to clip; 0.9 leaves only a small margin
  // top/bottom on a centered card, which is the true physical limit here.
  const cardHeight = Math.min(contentHeight, Math.round(height * 0.9));
  const cardX = (width - cardWidth) / 2;
  const cardY = (height - cardHeight) / 2;
  const cardRadius = Math.round(width * 0.02);

  const cardBg = `<rect x="${round2(cardX)}" y="${round2(cardY)}" width="${cardWidth}" height="${round2(cardHeight)}" rx="${cardRadius}" fill="${escapeXml(cardFillColor)}" fill-opacity="0.86" />`;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${cardBg}<g transform="translate(${round2(cardX + cardPadding)}, ${round2(cardY + cardPadding)})">${inner.join("")}</g></svg>`;
}

/**
 * TYPOGRAPHIC_HERO: typography intentionally dominant, background photo
 * subdued behind a wash localized to the text band (not the whole canvas
 * -- the top/bottom stay visible photo). Largest headline font size of
 * any archetype; minimal supporting text; still a finished branded
 * creative (real brand mark + optional CTA pill), never a bare text
 * poster.
 */
function buildTypographicHeroSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height } = input;
  const primary = input.primaryColor ?? input.accentColor ?? "#14181F";
  const secondary = input.secondaryColor ?? input.accentColor ?? "#FFFFFF";
  const washTextColor = legibleTextColorFor(primary);
  const pillTextColor = legibleTextColorFor(secondary);
  const { headline, supporting, cta, brandLabel } = picked;

  const margin = Math.round(width * 0.08);
  const safeWidth = width - margin * 2;

  const inner: string[] = [];
  let y = 0;

  if (headline?.text.trim()) {
    const fontSize = Math.round(width * 0.09);
    const lines = wrapTextWithEllipsis(getFont(800), headline.text.trim(), safeWidth, fontSize, 4);
    const lineHeight = fontSize * 1.05;
    inner.push(renderTextLines(lines, 0, y + fontSize, lineHeight, { fontSize, weight: 800, fill: washTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.02);
  }

  if (supporting?.text.trim()) {
    const fontSize = Math.round(width * 0.024);
    // truncateToWidth (real ellipsis), not wrapText+slice(0,1) -- see
    // MINIMAL_FOOTER_STRIP's identical fix: silently dropping wrapped
    // overflow with no ellipsis loses text with zero visible indication.
    const line = truncateToWidth(getFont(400), supporting.text.trim(), safeWidth, fontSize);
    inner.push(renderTextLines([line], 0, y + fontSize, fontSize * 1.3, { fontSize, weight: 400, fill: washTextColor, anchor: "start" }));
    y += fontSize * 1.3 + Math.round(width * 0.02);
  }

  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.028);
    const pill = buildCtaPillSvg(cta.text.trim(), {
      centerX: safeWidth / 2, top: y, maxWidth: safeWidth, fontSize, fill: secondary, textColor: pillTextColor,
    });
    inner.push(pill.svg);
    y += pill.height + Math.round(width * 0.02);
  }

  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: safeWidth / 2, yTop: y, maxWidth: safeWidth,
    fontSize: Math.round(width * 0.02), color: washTextColor, align: "middle",
  });
  if (footer.svg) {
    inner.push(footer.svg);
    y += footer.height;
  }

  const contentHeight = y;
  const washPaddingV = Math.round(width * 0.06);
  // Same "generous cap, not a tight one" reasoning as FROSTED_GLASS_CENTER's
  // cardHeight -- headline is capped to 4 wrapped lines above, which keeps
  // realistic content well under this, but the cap itself must never clip.
  const washHeight = Math.min(contentHeight + washPaddingV * 2, Math.round(height * 0.92));
  const washTop = (height - washHeight) / 2;

  const parts: string[] = [
    `<rect x="0" y="${round2(washTop)}" width="${width}" height="${round2(washHeight)}" fill="${escapeXml(primary)}" fill-opacity="0.58" />`,
  ];

  const brandFS = Math.round(width * 0.024);
  const chipMargin = Math.round(width * 0.07);
  if (brandLabel.text.trim()) {
    const text = brandLabel.text.trim();
    const chipFont = getFont(700);
    const textWidth = measureWidth(chipFont, text, brandFS);
    const padX = brandFS * 0.7;
    const padY = brandFS * 0.45;
    parts.push(`<rect x="${round2(width - chipMargin - textWidth - padX * 2)}" y="${round2(chipMargin * 0.9 - brandFS - padY)}" width="${round2(textWidth + padX * 2)}" height="${round2(brandFS + padY * 2)}" rx="${round2(brandFS * 0.4)}" fill="${escapeXml(primary)}" fill-opacity="0.82" />`);
    parts.push(renderTextLines([text], width - chipMargin, chipMargin * 0.9, brandFS * 1.2, { fontSize: brandFS, weight: 700, fill: legibleTextColorFor(primary), anchor: "end" }));
  }

  parts.push(`<g transform="translate(${margin}, ${round2(washTop + washPaddingV)})">${inner.join("")}</g>`);

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

/**
 * POLAROID_LIFESTYLE: a real white polaroid-style border painted over the
 * photo's own edges (thin on top/left/right, a genuinely thick bottom
 * margin) with a caption line in that bottom margin rendered with a
 * deterministic italic-style skew (never a second font file, never
 * emoji). Social-proof, lifestyle, UGC-adjacent feeling.
 */
function buildPolaroidLifestyleSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height } = input;
  const primary = input.primaryColor ?? input.accentColor ?? "#14181F";
  const { supporting, headline, cta, brandLabel } = picked;
  const captionSource = supporting?.text.trim() || headline?.text.trim();

  const borderColor = "#FBF9F4"; // warm off-white, real polaroid paper tone
  const borderTextColor = "#2A2620";
  const sideBorder = Math.round(width * 0.045);
  const topBorder = Math.round(width * 0.045);

  const parts: string[] = [];

  const captionFS = Math.round(width * 0.032);
  const brandFS = Math.round(width * 0.022);
  // Bottom margin sizes to its real content (caption + brand/CTA row),
  // targeting a classic ~20% but never shrinking below what the caption
  // actually needs.
  const captionLines = captionSource ? wrapTextWithEllipsis(getFont(400), captionSource, width - sideBorder * 2 - Math.round(width * 0.06), captionFS, 2) : [];
  const captionBlockHeight = captionLines.length ? captionLines.length * captionFS * 1.3 : 0;
  const footerFS = Math.round(width * 0.018);
  const footerProbe = buildContactFooterSvg({
    contact: input.contactInfo, x: sideBorder + Math.round(width * 0.02), yTop: 0, maxWidth: width - sideBorder * 2 - Math.round(width * 0.04),
    fontSize: footerFS, color: borderTextColor, align: "start",
  });
  const bottomContentHeight =
    Math.round(width * 0.03) + captionBlockHeight
    + (brandLabel.text.trim() || cta?.text.trim() ? brandFS * 1.8 : 0)
    + (footerProbe.height ? footerProbe.height + Math.round(width * 0.015) : 0)
    + Math.round(width * 0.03);
  const bottomBorder = Math.max(Math.round(width * 0.2), bottomContentHeight);

  // Four border rects painted OVER the photo's own edges -- the compositor
  // has no way to actually re-crop/resize the already-generated photo, so
  // the polaroid inset is simulated the same way every other archetype's
  // "reserved area" is: an opaque overlay covering that margin.
  parts.push(`<rect x="0" y="0" width="${width}" height="${topBorder}" fill="${escapeXml(borderColor)}" />`);
  parts.push(`<rect x="0" y="0" width="${sideBorder}" height="${height}" fill="${escapeXml(borderColor)}" />`);
  parts.push(`<rect x="${width - sideBorder}" y="0" width="${sideBorder}" height="${height}" fill="${escapeXml(borderColor)}" />`);
  parts.push(`<rect x="0" y="${height - bottomBorder}" width="${width}" height="${bottomBorder}" fill="${escapeXml(borderColor)}" />`);

  let y = height - bottomBorder + Math.round(width * 0.035);
  if (captionLines.length) {
    parts.push(renderTextLines(captionLines, sideBorder + Math.round(width * 0.02), y + captionFS, captionFS * 1.3, {
      fontSize: captionFS, weight: 400, fill: borderTextColor, anchor: "start", skewDegrees: -8,
    }));
    y += captionLines.length * captionFS * 1.3 + Math.round(width * 0.02);
  }

  if (brandLabel.text.trim() || cta?.text.trim()) {
    if (brandLabel.text.trim()) {
      parts.push(renderTextLines([brandLabel.text.trim()], sideBorder + Math.round(width * 0.02), y + brandFS, brandFS * 1.2, {
        fontSize: brandFS, weight: 700, fill: legibleTextColorFor(borderColor) === "#FFFFFF" ? borderTextColor : primary, anchor: "start",
      }));
    }
    if (cta?.text.trim()) {
      const ctaFS = Math.round(width * 0.02);
      parts.push(renderTextLines([cta.text.trim()], width - sideBorder - Math.round(width * 0.02), y + ctaFS, ctaFS * 1.2, {
        fontSize: ctaFS, weight: 700, fill: primary, anchor: "end", underline: true,
      }));
    }
    y += brandFS * 1.8;
  }

  if (footerProbe.height) {
    const footer = buildContactFooterSvg({
      contact: input.contactInfo, x: sideBorder + Math.round(width * 0.02), yTop: y, maxWidth: width - sideBorder * 2 - Math.round(width * 0.04),
      fontSize: footerFS, color: borderTextColor, align: "start",
    });
    parts.push(footer.svg);
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

/**
 * CLINICAL_TRUST: healthcare-safe -- a light/white band (never the
 * photo's own dark tones or a bold brand-primary fill), one restrained
 * accent line, calm generously-spaced hierarchy, high readability.
 */
function buildClinicalTrustSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height } = input;
  // Deliberately does NOT use primary as the band fill (registry
  // constraint: band is always light) -- primary is reserved for the thin
  // accent line only, alongside a calm default blue when no brand accent
  // exists, since "restrained blue/green accents" is the archetype's own
  // design intent, not an arbitrary brand color.
  const accent = input.secondaryColor ?? input.accentColor ?? input.primaryColor ?? "#2E6F95";
  const bandFill = "#FFFFFF";
  const bandTextColor = "#1B2430";
  const pillTextColor = legibleTextColorFor(accent);
  const { headline, supporting, cta, brandLabel } = picked;

  const margin = Math.round(width * 0.075);
  const safeWidth = width - margin * 2;
  const paddingTop = Math.round(width * 0.055);
  const paddingBottom = Math.round(width * 0.055);

  const parts: string[] = [];
  let y = paddingTop;

  const brandFS = Math.round(width * 0.024);
  if (brandLabel.text.trim()) {
    parts.push(renderTextLines([brandLabel.text.trim()], margin, y + brandFS, brandFS * 1.2, {
      fontSize: brandFS, weight: 700, fill: bandTextColor, anchor: "start",
    }));
    y += brandFS * 1.3;
    const accentLineWidth = Math.round(safeWidth * 0.12);
    const accentLineHeight = Math.max(2, Math.round(width * 0.005));
    parts.push(`<rect x="${margin}" y="${round2(y)}" width="${accentLineWidth}" height="${accentLineHeight}" fill="${escapeXml(accent)}" />`);
    y += accentLineHeight + Math.round(width * 0.03);
  }

  if (headline?.text.trim()) {
    const fontSize = Math.round(width * 0.042);
    const lines = wrapText(getFont(700), headline.text.trim(), safeWidth, fontSize);
    const lineHeight = fontSize * 1.25;
    parts.push(renderTextLines(lines, margin, y + fontSize, lineHeight, { fontSize, weight: 700, fill: bandTextColor, anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.018);
  }

  if (supporting?.text.trim()) {
    const fontSize = Math.round(width * 0.026);
    const lines = wrapText(getFont(400), supporting.text.trim(), safeWidth, fontSize);
    const lineHeight = fontSize * 1.4;
    parts.push(renderTextLines(lines, margin, y + fontSize, lineHeight, { fontSize, weight: 400, fill: "#3A4452", anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.025);
  }

  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.03);
    const pill = buildCtaPillSvg(cta.text.trim(), {
      centerX: margin + safeWidth / 2, top: y, maxWidth: safeWidth, fontSize, fill: accent, textColor: pillTextColor,
    });
    parts.push(pill.svg);
    y += pill.height + Math.round(width * 0.025);
  }

  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: margin, yTop: y, maxWidth: safeWidth,
    fontSize: Math.round(width * 0.022), color: "#3A4452", align: "start",
  });
  if (footer.svg) {
    parts.push(footer.svg);
    y += footer.height;
  }

  const contentHeight = y + paddingBottom;
  const targetBandHeight = Math.round(height * 0.28);
  // No upper cap -- see SPLIT_BANNER's identical comment.
  const bandHeight = Math.max(contentHeight, targetBandHeight);
  const bandTop = height - bandHeight;

  const band =
    `<rect x="0" y="${round2(bandTop)}" width="${width}" height="${round2(bandHeight)}" fill="${escapeXml(bandFill)}" />` +
    `<rect x="0" y="${round2(bandTop)}" width="${width}" height="${Math.max(2, Math.round(width * 0.004))}" fill="${escapeXml(accent)}" />`;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${band}<g transform="translate(0, ${round2(bandTop)})">${parts.join("")}</g></svg>`;
}

/**
 * NEON_NIGHTLIFE: a dark scrim over the bottom of the frame with glowing
 * brand-accent-colored headline/CTA text -- glow simulated with a wide
 * low-opacity stroke behind the crisp fill (see glyphLineSvg), never a
 * blur filter. Base text stays white/near-white for legibility even with
 * the glow layered on.
 */
function buildNeonNightlifeSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height } = input;
  const accent = input.secondaryColor ?? input.accentColor ?? input.primaryColor ?? "#FF2E88";
  const { headline, supporting, cta, brandLabel } = picked;

  const margin = Math.round(width * 0.08);
  const safeWidth = width - margin * 2;
  const padding = Math.round(width * 0.05);

  const parts: string[] = [];
  let y = padding;

  const brandFS = Math.round(width * 0.024);
  if (brandLabel.text.trim()) {
    parts.push(renderTextLines([brandLabel.text.trim()], margin, y + brandFS, brandFS * 1.2, {
      fontSize: brandFS, weight: 700, fill: "#FFFFFF", anchor: "start", letterSpacing: Math.round(brandFS * 0.1),
    }));
    y += brandFS * 1.5;
  }

  if (headline?.text.trim()) {
    const fontSize = Math.round(width * 0.05);
    const lines = wrapText(getFont(800), headline.text.trim(), safeWidth, fontSize);
    const lineHeight = fontSize * 1.2;
    parts.push(renderTextLines(lines, margin, y + fontSize, lineHeight, { fontSize, weight: 800, fill: "#FFFFFF", anchor: "start", glowColor: accent }));
    y += lines.length * lineHeight + Math.round(width * 0.018);
  }

  if (supporting?.text.trim()) {
    const fontSize = Math.round(width * 0.026);
    const lines = wrapText(getFont(400), supporting.text.trim(), safeWidth, fontSize);
    const lineHeight = fontSize * 1.35;
    parts.push(renderTextLines(lines, margin, y + fontSize, lineHeight, { fontSize, weight: 400, fill: "#E8E8EC", anchor: "start" }));
    y += lines.length * lineHeight + Math.round(width * 0.02);
  }

  if (cta?.text.trim()) {
    const fontSize = Math.round(width * 0.03);
    const pillTextColor = legibleTextColorFor(accent);
    const pill = buildCtaPillSvg(cta.text.trim(), {
      centerX: margin + safeWidth / 2, top: y, maxWidth: safeWidth, fontSize, fill: accent, textColor: pillTextColor,
    });
    parts.push(pill.svg);
    y += pill.height + Math.round(width * 0.02);
  }

  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: margin, yTop: y, maxWidth: safeWidth,
    fontSize: Math.round(width * 0.022), color: "#E8E8EC", align: "start",
  });
  if (footer.svg) {
    parts.push(footer.svg);
    y += footer.height;
  }

  const contentHeight = y + padding;
  const targetScrimHeight = Math.round(height * 0.34);
  // No upper cap -- see SPLIT_BANNER's identical comment.
  const scrimHeight = Math.max(contentHeight, targetScrimHeight);
  const scrimTop = height - scrimHeight;

  // Two-layer dark scrim -- a fuller-opacity band plus a taller, lower-
  // opacity layer above it for a soft fade toward the photo, without any
  // gradient/filter primitive.
  const scrim =
    `<rect x="0" y="${round2(scrimTop - scrimHeight * 0.25)}" width="${width}" height="${round2(scrimHeight * 0.25)}" fill="#000000" fill-opacity="0.32" />` +
    `<rect x="0" y="${round2(scrimTop)}" width="${width}" height="${round2(scrimHeight)}" fill="#000000" fill-opacity="0.78" />`;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${scrim}<g transform="translate(0, ${round2(scrimTop)})">${parts.join("")}</g></svg>`;
}

/**
 * FEATURE_POSTER (Image Quality + Marketing Creative Certification
 * mission, 2026-09-06): a structured, agency-style promotional poster on
 * a light background -- built from a real reference the business
 * supplied, not a photo-with-a-band variant. Two columns below a header
 * row: left carries the logo/business name, headline, supporting line,
 * and an icon-led list of the business's own real differentiators; right
 * carries the real generated photo in a bounded, rounded panel (never
 * full-bleed -- the whole point of this archetype is that the photo is
 * ONE element among several, not the entire canvas). A full-width
 * brand-color CTA bar closes the poster, mirroring the reference's own
 * bottom tagline bar. Every other archetype in this file draws directly
 * on top of the real photo (sharp composites this SVG onto it); this one
 * is the one exception -- see renderTextOverlay's own FEATURE_POSTER
 * branch for why the photo has to be embedded as an in-SVG `<image>`
 * instead.
 */
/**
 * Real, natural business prose sometimes arrives as its own bulleted or
 * numbered list ("• Direct university shortlisting support\n•
 * ...") rather than one flowing sentence -- found on an actual generated
 * FEATURE_POSTER creative's supportingLine. Collapses any such shape into
 * one sentence regardless of which body-tier role it's used for (not just
 * supportingLine); a no-op for the normal single-sentence case.
 */
function collapseToSentence(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim().replace(/^(?:[•\-*]|\d+[.)])\s*/, ""))
    .filter(Boolean)
    .join(". ");
}

function buildFeaturePosterSvg(input: TextOverlayLayoutInput, picked: PickedElements): string {
  const { width, height } = input;
  const primary = input.primaryColor ?? input.accentColor ?? "#14181F";
  const secondary = input.secondaryColor ?? input.accentColor ?? primary;
  const ink = "#171A20"; // near-black -- this archetype's background is always light, so text is always dark regardless of brand color/light-dark preference
  const muted = "#5B6472";
  // headline/supporting are deliberately NOT destructured here -- the
  // content-block loop below reads the full input.elements array directly
  // so it can render whatever roles the treatment actually chose, not just
  // one-picked-per-legacy-role. picked.cta/brandLabel are still the real
  // source for the lockup and CTA bar (structural chrome, not message
  // content the strategy decides).
  const { cta, brandLabel } = picked;
  const differentiators = (input.differentiators ?? []).map((d) => d.trim()).filter(Boolean).slice(0, 3);

  const margin = Math.round(width * 0.065);
  const columnGap = Math.round(width * 0.045);
  const hasPhoto = Boolean(input.photoDataUri);
  const photoColWidth = hasPhoto ? Math.round(width * 0.34) : 0;
  const textColWidth = width - margin * 2 - (hasPhoto ? columnGap + photoColWidth : 0);
  // Computed early (doesn't depend on anything else) so both the photo
  // panel and the text-block centering below can stop short of the CTA
  // bar instead of running underneath it or leaving it stranded far below
  // real content.
  const hasCta = Boolean(cta?.text.trim());
  const ctaBarHeight = hasCta ? Math.round(height * 0.09) : 0;
  const bandBottom = height - ctaBarHeight - (hasCta ? margin : Math.round(margin * 0.6));

  const left: string[] = [];
  let y = margin;

  // --- Logo / business name lockup ---------------------------------------
  const resolvedLogo = selectLogoVariant(input);
  const logoBoxHeight = Math.round(width * 0.052);
  if (resolvedLogo) {
    const logoBoxWidth = Math.min(textColWidth, Math.round(logoBoxHeight * resolvedLogo.aspectRatio * 2.4));
    const logoSvg = buildLogoImageSvg(resolvedLogo, margin, y, logoBoxWidth, logoBoxHeight);
    if (logoSvg) left.push(logoSvg);
    y += logoBoxHeight + Math.round(width * 0.03);
  } else if (brandLabel.text.trim()) {
    // Bounded to textColWidth like every other element in this column, and
    // wrapped (not mid-word ellipsis-truncated) -- a real, ordinary-length
    // business name ("Fort Kochi Coastal Kitchen") previously either ran
    // straight into the photo panel unbounded, or, once bounded, got
    // chopped to "FORT KOCHI COASTAL KIT…" on one line (both real bugs,
    // caught by visual inspection of an actual render, not just the unit
    // tests). Two lines is enough room for any realistic business name at
    // this font size; only a genuinely extreme name still ellipsizes, on
    // the second line, same as headline/supportingLine below it.
    const brandFS = Math.round(width * 0.03);
    const brandLetterSpacing = Math.round(brandFS * 0.08);
    const brandLines = wrapTextWithEllipsis(getFont(700), brandLabel.text.trim().toUpperCase(), textColWidth, brandFS, 2, brandLetterSpacing);
    const brandLineHeight = brandFS * 1.25;
    left.push(renderTextLines(brandLines, margin, y + brandFS, brandLineHeight, {
      fontSize: brandFS, weight: 700, fill: ink, anchor: "start", letterSpacing: brandLetterSpacing,
    }));
    y += brandLines.length * brandLineHeight + Math.round(width * 0.02);
  }

  // --- Content blocks: rendered in the EXACT order and roles the real
  //     Creative Treatment chose for THIS post -- FEATURE_POSTER's job is
  //     to present whatever message structure the content strategy
  //     decided (a headline, a pain point + solution, a question +
  //     answer, ...), never to force every business into the same
  //     headline+differentiators+CTA shape regardless of the actual
  //     strategy (real bug found live: FEATURE_POSTER flattened every
  //     creative into headline -> the same static 3 on-file
  //     differentiators -> CTA, no matter what the treatment's own
  //     concept/hook/angle was). brandLabel and cta are handled elsewhere
  //     (lockup and bottom bar respectively) -- everything else in
  //     input.elements renders here as one of three visual tiers keyed
  //     off role, so the content SHAPE varies while the archetype's own
  //     visual grammar (display line / supporting line / icon-proof row)
  //     stays consistent. -----------------------------------------------
  const DISPLAY_ROLES = new Set(["headline", "statement", "question"]);
  const POINT_ROLES = new Set(["proof", "value", "benefit", "offer"]);
  const contentElements = input.elements.filter((e) => e.role !== "brandLabel" && e.role !== "cta" && e.text?.trim());

  const renderPointRow = (text: string) => {
    const iconSize = Math.round(width * 0.034);
    const fontSize = Math.round(width * 0.024);
    const textGap = Math.round(width * 0.02);
    left.push(iconCheckCircle(margin, y, iconSize, secondary, legibleTextColorFor(secondary)));
    const lines = wrapTextWithEllipsis(getFont(600), text, textColWidth - iconSize - textGap, fontSize, 2);
    const lineHeight = fontSize * 1.3;
    const textY = y + iconSize / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.32;
    left.push(renderTextLines(lines, margin + iconSize + textGap, textY, lineHeight, { fontSize, weight: 600, fill: ink, anchor: "start" }));
    y += Math.max(iconSize, lines.length * lineHeight) + Math.round(width * 0.024);
  };

  if (!contentElements.length) y += Math.round(width * 0.015);
  for (const element of contentElements) {
    if (element.role === "differentiators") {
      // Real on-file business data ONLY -- ignores whatever placeholder
      // text the model put in this slot; renders only when the content
      // strategy actually asked for this role (i.e. only ever appears in
      // input.elements when it's genuinely the strongest angle for this
      // creative), never unconditionally on every single post.
      if (!differentiators.length) continue;
      for (const item of differentiators) renderPointRow(item);
      y += Math.round(width * 0.01);
    } else if (POINT_ROLES.has(element.role)) {
      renderPointRow(collapseToSentence(element.text.trim()));
    } else if (DISPLAY_ROLES.has(element.role)) {
      // Capped at 5 lines, not 3 (real bug found live twice: a genuinely
      // strategic two-sentence headline like "Zero guesswork. 25 years of
      // backed performance." truncated at 3 lines, and a full natural
      // question like "Will one wrong choice cost you an entire admission
      // cycle?" (10 words -- exactly the specific, non-generic on-image
      // copy this whole content-strategy fix exists to enable) still
      // truncated one word short of finishing even at 4 lines in this
      // narrower, photo-panel-sharing column).
      const fontSize = Math.round(width * 0.058);
      const lines = wrapTextWithEllipsis(getFont(800), element.text.trim(), textColWidth, fontSize, 5);
      const lineHeight = fontSize * 1.12;
      left.push(renderTextLines(lines, margin, y + fontSize, lineHeight, { fontSize, weight: 800, fill: ink, anchor: "start" }));
      y += lines.length * lineHeight + Math.round(width * 0.018);
    } else {
      // supportingLine / insight / painPoint / solution / answer / other:
      // one medium, muted supporting line. Defense-in-depth against the
      // model writing its own bulleted/numbered list here (real bug,
      // found live: "• Direct university shortlisting support\n• ..."
      // duplicating the separate icon-proof rows above/below it) --
      // collapseToSentence is a no-op for the normal single-sentence case.
      // Capped at 4 lines, not 2, for the same real-headline-truncation
      // reason as the display tier above.
      const fontSize = Math.round(width * 0.026);
      const lines = wrapTextWithEllipsis(getFont(400), collapseToSentence(element.text.trim()), textColWidth, fontSize, 4);
      const lineHeight = fontSize * 1.4;
      left.push(renderTextLines(lines, margin, y + fontSize, lineHeight, { fontSize, weight: 400, fill: muted, anchor: "start" }));
      y += lines.length * lineHeight + Math.round(width * 0.03);
    }
  }

  const columnContentHeight = y - margin;

  // --- Contact footer -- measured against the real, un-shifted absolute
  //     coordinates first (yTop assumes no extra offset yet) so its real
  //     height is known before the whole text block below is centered. ---
  const footerGap = Math.round(width * 0.02);
  const footer = buildContactFooterSvg({
    contact: input.contactInfo, x: margin, yTop: margin + columnContentHeight + footerGap, maxWidth: textColWidth,
    fontSize: Math.round(width * 0.02), color: muted, align: "start",
  });
  if (footer.svg) left.push(footer.svg);

  // Vertically centers the whole text block (headline through footer)
  // within the same vertical band the photo panel fills, instead of
  // always pinning it to the top margin -- a short text block (no
  // supporting line, one differentiator) previously left a large dead
  // void beneath it while the photo panel above it was equally short,
  // rather than reading as a deliberately composed poster (real defect,
  // caught by visual inspection of an actual render). All coordinates
  // above were built assuming zero offset, so one uniform wrapping <g>
  // shifts headline, differentiators, and footer together -- never a
  // double-shift, since nothing here is translated a second time.
  const textBlockHeight = columnContentHeight + (footer.svg ? footerGap + footer.height : 0);
  const availableBand = bandBottom - margin;
  const verticalOffset = Math.max(0, Math.round((availableBand - textBlockHeight) / 2));
  const leftGroup = `<g transform="translate(0, ${verticalOffset})">${left.join("")}</g>`;

  // --- Real photo panel, bounded (never full-bleed) -- runs the full
  //     available band height (down to just above the CTA bar, or the
  //     bottom margin when there's no CTA) rather than only as tall as
  //     the text column's own content, so a short text block doesn't
  //     leave the photo panel looking stranded in a mostly-empty canvas
  //     (real defect, same visual-inspection finding as above). --------
  let photoSvg = "";
  if (hasPhoto) {
    const photoX = margin + textColWidth + columnGap;
    const photoY = margin;
    const photoHeight = Math.max(Math.round(width * 0.3), bandBottom - photoY);
    const radius = Math.round(width * 0.025);
    const clipId = "feature-poster-photo-clip";
    photoSvg =
      `<clipPath id="${clipId}"><rect x="${round2(photoX)}" y="${round2(photoY)}" width="${round2(photoColWidth)}" height="${round2(photoHeight)}" rx="${radius}" /></clipPath>` +
      `<image href="${escapeXml(input.photoDataUri!)}" x="${round2(photoX)}" y="${round2(photoY)}" width="${round2(photoColWidth)}" height="${round2(photoHeight)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />` +
      `<rect x="${round2(photoX)}" y="${round2(photoY)}" width="${round2(photoColWidth)}" height="${round2(photoHeight)}" rx="${radius}" fill="none" stroke="${escapeXml(primary)}" stroke-opacity="0.12" stroke-width="${Math.max(1, Math.round(width * 0.003))}" />`;
  }

  // --- Full-width brand-color CTA bar (mirrors the reference's own
  //     bottom tagline bar) -- only rendered when a real CTA exists, so
  //     nothing invents copy just to fill an empty colored rectangle. ---
  let ctaSvg = "";
  if (hasCta) {
    const ctaTop = height - ctaBarHeight;
    const ctaTextColor = legibleTextColorFor(primary);
    const iconSize = Math.round(ctaBarHeight * 0.4);
    const font = getFont(700);
    const ctaFontSize = Math.round(ctaBarHeight * 0.32);
    const ctaText = truncateToWidth(font, cta!.text.trim(), width - margin * 2 - iconSize * 1.6, ctaFontSize);
    const textWidth = measureWidth(font, ctaText, ctaFontSize);
    const groupWidth = iconSize + Math.round(ctaBarHeight * 0.22) + textWidth;
    const groupX = (width - groupWidth) / 2;
    ctaSvg =
      `<rect x="0" y="${round2(ctaTop)}" width="${width}" height="${round2(ctaBarHeight)}" fill="${escapeXml(primary)}" />` +
      iconCheckCircle(groupX, ctaTop + (ctaBarHeight - iconSize) / 2, iconSize, ctaTextColor, primary) +
      renderTextLines([ctaText], groupX + iconSize + Math.round(ctaBarHeight * 0.22), ctaTop + ctaBarHeight / 2 + ctaFontSize * 0.34, ctaFontSize * 1.2, {
        fontSize: ctaFontSize, weight: 700, fill: ctaTextColor, anchor: "start",
      });
  }

  const background = `<rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF" />`;
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${background}${photoSvg}${leftGroup}${ctaSvg}</svg>`;
}

/** Dispatches to the layout-specific renderer for input.layoutArchetype.
 * A creative with genuinely no on-image text (no headline/supporting/CTA
 * and an empty business name) short-circuits to a bare, empty SVG for
 * every archetype -- there's nothing to design a container around. */
export function buildTextOverlaySvg(input: TextOverlayLayoutInput): string {
  const { width, height, elements, businessName } = input;
  const picked = pickElements(elements, businessName);
  // FEATURE_POSTER reads its content directly from the full `elements`
  // array (see buildFeaturePosterSvg) rather than only the three legacy
  // roles pickElements() extracts -- a real treatment expressed entirely
  // through the newer roles (e.g. "painPoint" + "solution", no literal
  // "headline"/"supportingLine"/"cta") would otherwise look like "no text
  // content" here and get short-circuited to the bare logo watermark,
  // silently discarding a real, deliberately-structured message. Scoped to
  // FEATURE_POSTER specifically -- every other archetype still only ever
  // renders the three legacy roles, so their own "no text" check is
  // unchanged.
  const hasTextContent = Boolean(
    picked.headline?.text.trim() || picked.supporting?.text.trim() || picked.cta?.text.trim()
      || (input.layoutArchetype === "FEATURE_POSTER" && elements.some((e) => e.text?.trim()))
  );
  if (!hasTextContent) {
    const resolvedLogo = selectLogoVariant(input);
    return buildCleanLogoWatermarkSvg(input, resolvedLogo, picked.brandLabel.text.trim());
  }
  switch (input.layoutArchetype) {
    case "BASIC_ESSENTIAL":
      return buildBasicEssentialSvg(input, picked);
    case "SPLIT_BANNER":
      return buildSplitBannerSvg(input, picked);
    case "FLOATING_CARD":
      return buildFloatingCardSvg(input, picked);
    case "EDITORIAL_FRAME":
      return buildEditorialFrameSvg(input, picked);
    case "MINIMAL_FOOTER_STRIP":
      return buildMinimalFooterStripSvg(input, picked);
    case "ELEVATED_BADGE":
      return buildElevatedBadgeSvg(input, picked);
    case "DUAL_TONE_SIDEBAR":
      return buildDualToneSidebarSvg(input, picked);
    case "FROSTED_GLASS_CENTER":
      return buildFrostedGlassCenterSvg(input, picked);
    case "TYPOGRAPHIC_HERO":
      return buildTypographicHeroSvg(input, picked);
    case "POLAROID_LIFESTYLE":
      return buildPolaroidLifestyleSvg(input, picked);
    case "CLINICAL_TRUST":
      return buildClinicalTrustSvg(input, picked);
    case "NEON_NIGHTLIFE":
      return buildNeonNightlifeSvg(input, picked);
    case "FEATURE_POSTER":
      return buildFeaturePosterSvg(input, picked);
    default:
      // Unreachable given validateCreativeTreatment's own enum check --
      // kept as a real, working default rather than a throw so a
      // never-quite-impossible bad value still renders something usable.
      return buildBasicEssentialSvg(input, picked);
  }
}

export async function renderTextOverlay(baseImage: Buffer, input: TextOverlayLayoutInput): Promise<Buffer> {
  // FEATURE_POSTER is the one archetype that does NOT draw on top of a
  // full-bleed photo -- every other archetype's SVG assumes the real photo
  // already fills the whole canvas underneath it (sharp composites onto
  // baseImage directly, below). FEATURE_POSTER's photo lives in a bounded
  // panel instead, which only an in-SVG `<image>` element can place, so the
  // real photo bytes are re-encoded as a data URI and handed to
  // buildTextOverlaySvg as input.photoDataUri; the "base" sharp composites
  // onto here is a plain light canvas, not the photo itself.
  if (input.layoutArchetype === "FEATURE_POSTER") {
    const photoPng = await sharp(baseImage).png().toBuffer();
    const photoDataUri = `data:image/png;base64,${photoPng.toString("base64")}`;
    const svg = buildTextOverlaySvg({ ...input, photoDataUri });
    const svgBuffer = Buffer.from(svg, "utf8");
    return sharp({ create: { width: input.width, height: input.height, channels: 3, background: "#ffffff" } })
      .composite([{ input: svgBuffer, top: 0, left: 0 }])
      .png()
      .toBuffer();
  }
  const svg = buildTextOverlaySvg(input);
  const svgBuffer = Buffer.from(svg, "utf8");
  return sharp(baseImage)
    .resize(input.width, input.height, { fit: "cover" })
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
