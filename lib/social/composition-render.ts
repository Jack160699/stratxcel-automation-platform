/**
 * FINAL HERMES -- RESTORE TRUE MARKETING CREATIVE GENERATION (2026-09-06).
 *
 * WHY THIS FILE EXISTS (the real, traced root cause it fixes):
 *
 * text-overlay-render.ts renders a creative by (a) reducing the treatment's
 * entire on-image content to exactly four named slots via `pickElements`
 * -- headline / supportingLine / cta / brandLabel -- and then (b)
 * dispatching on a 13-value `layoutArchetype` enum to one of 13
 * hand-written SVG functions, each of which consumes only those four
 * slots. Both halves of that are structural ceilings, not tuning problems:
 *
 *   1. CONTENT CEILING. No matter what Business Intelligence, Customer
 *      Psychology, Market Intelligence, the Opportunity Map, the 28-Day
 *      Planner or the Creative Treatment decided upstream, 12 of the 13
 *      archetype builders are physically incapable of drawing anything
 *      except brandLabel + headline + supportingLine + CTA. A strategy
 *      that concluded "lead with the 40% bill reduction as a number",
 *      "contrast the old way against our way", or "walk the four stages of
 *      the journey" has nowhere to put that -- it gets flattened into a
 *      sentence and dropped into the same slot a mood post uses.
 *      (FEATURE_POSTER was exempted from `pickElements` in an earlier pass,
 *      which is exactly why FEATURE_POSTER creatives were the only ones
 *      that ever showed a different message structure.)
 *
 *   2. FORMAT CEILING. "Choosing a format" was choosing one of 13 strings,
 *      each bound to a pre-written function. There is no vocabulary in
 *      which "huge stat + proof badge + three benefit rows + offer chip"
 *      can even be EXPRESSED, so it can never be chosen, however good the
 *      strategy is. Adding a 14th archetype would not change that -- it
 *      would add one more fixed poster.
 *
 * The observed output ("LOGO + HEADLINE + SUPPORTING TEXT + ONE PHOTO +
 * CTA", every time, for every business and every strategy) is the exact
 * shape those two ceilings force.
 *
 * THE FIX: a declarative composition. The creative layer emits a
 * `CreativeComposition` -- a canvas mode plus an ORDERED LIST OF
 * ADVERTISING BLOCKS (stat, offer, badges, benefit rows, process steps,
 * comparison columns, testimonial quote, headline, body, CTA) -- and this
 * module lays out and renders whatever blocks it is actually given. There
 * is no fixed slot count, no fixed order, and no fixed block set: the
 * FORMAT IS AN EMERGENT PROPERTY OF THE BLOCKS THE STRATEGY CHOSE, not a
 * template picked from a list. A number-led offer ad and a four-step
 * process ad are different compositions of the same primitives, the way a
 * real designer builds them.
 *
 * NOTHING IS REMOVED. All 13 archetypes in text-overlay-render.ts stay
 * exactly as they are and remain the path for any treatment that does not
 * emit a composition; this module is additive and one-directional (it
 * imports that module's shared primitives, never the reverse).
 *
 * HONEST SCOPE (v1): single photograph per creative. Multi-image collage /
 * before-after photography needs the candidate pipeline to generate more
 * than one image per creative, which is a real change in
 * lib/image-generation/service.ts, not a rendering change -- so `steps`
 * and `comparison` express sequence and contrast TYPOGRAPHICALLY (numbered
 * chips, two labelled columns) over a single supporting photograph rather
 * than pretending to be multi-photo. That is a real limitation, stated
 * rather than hidden.
 */

import sharp from "sharp";
import {
  escapeXml,
  getFont,
  legibleTextColorFor,
  measureWidth,
  renderTextLines,
  round2,
  wrapTextWithEllipsis,
  buildLogoImageSvg,
  selectLogoVariant,
  type LogoAsset,
  type LogoVariantBundle,
} from "./text-overlay-render.ts";

/**
 * How the photograph relates to the design. This is a real compositional
 * decision (where the imagery lives), NOT a template id -- the blocks that
 * sit on top are independent of it.
 */
export type CompositionCanvas =
  /** Photograph fills the frame; the content sits on a brand-colored panel over it. */
  | "photo_full"
  /** Photograph occupies a top band; content sits on a solid panel beneath it. */
  | "photo_top"
  /** Photograph occupies one vertical half; content sits on the other. */
  | "photo_side"
  /** Solid brand ground with the photograph inset as a bounded, rounded card. */
  | "photo_inset"
  /** No photograph at all -- typography/number-led composition. */
  | "solid";

/** Which edge the content panel occupies (meaningful for photo_full/photo_side). */
export type CompositionPanel = "bottom" | "top" | "left" | "right";

/**
 * The advertising primitives. Each is a real thing that appears in real
 * agency/Canva-grade social advertising, and each is independently
 * choosable -- a creative uses the ones its strategy actually needs.
 */
export type CompositionBlock =
  /** Small uppercase kicker above the headline (category, location, offer flag). */
  | { kind: "eyebrow"; text: string }
  /** The dominant message. */
  | { kind: "headline"; text: string }
  /** Secondary line under the headline. */
  | { kind: "subhead"; text: string }
  /** Explanatory sentence(s). */
  | { kind: "body"; text: string }
  /** The number-led ad: an oversized figure with a caption under it. */
  | { kind: "stat"; value: string; caption?: string }
  /** The offer ad: a promotional value on an accent field, with detail. */
  | { kind: "offer"; value: string; detail?: string }
  /** Proof/trust chips (warranty, tie-ups, certifications). */
  | { kind: "badges"; items: string[] }
  /** Benefit list with real check icons. */
  | { kind: "benefits"; items: string[] }
  /** The process ad: numbered stages. */
  | { kind: "steps"; items: string[] }
  /** The comparison ad: two labelled columns. */
  | { kind: "comparison"; leftLabel: string; leftItems: string[]; rightLabel: string; rightItems: string[] }
  /** The testimonial ad. */
  | { kind: "quote"; text: string; attribution?: string }
  /** The action. */
  | { kind: "cta"; text: string };

export interface CreativeComposition {
  canvas: CompositionCanvas;
  panel?: CompositionPanel;
  blocks: CompositionBlock[];
}

export interface CompositionRenderInput {
  width: number;
  height: number;
  composition: CreativeComposition;
  businessName: string;
  /** Real generated photograph as a data URI. Null only for canvas: "solid". */
  photoDataUri?: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoImage?: LogoAsset | null;
  logoVariants?: LogoVariantBundle | null;
}

const VALID_CANVASES: ReadonlySet<string> = new Set<CompositionCanvas>([
  "photo_full",
  "photo_top",
  "photo_side",
  "photo_inset",
  "solid",
]);

const VALID_BLOCK_KINDS: ReadonlySet<string> = new Set([
  "eyebrow",
  "headline",
  "subhead",
  "body",
  "stat",
  "offer",
  "badges",
  "benefits",
  "steps",
  "comparison",
  "quote",
  "cta",
]);

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(str).filter(Boolean).slice(0, max);
}

/**
 * Structural validation of an AI-authored composition. Returns null when
 * the payload is not a usable composition, so the caller can fall back to
 * the existing archetype path rather than rendering a broken creative --
 * this never repairs by inventing content, only by dropping malformed
 * blocks.
 */
export function parseCreativeComposition(value: unknown): CreativeComposition | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const canvas = str(raw.canvas);
  if (!VALID_CANVASES.has(canvas)) return null;
  if (!Array.isArray(raw.blocks)) return null;

  const blocks: CompositionBlock[] = [];
  for (const entry of raw.blocks) {
    if (!entry || typeof entry !== "object") continue;
    const b = entry as Record<string, unknown>;
    const kind = str(b.kind);
    if (!VALID_BLOCK_KINDS.has(kind)) continue;
    switch (kind) {
      case "eyebrow":
      case "headline":
      case "subhead":
      case "body":
      case "cta": {
        const text = str(b.text);
        if (text) blocks.push({ kind, text } as CompositionBlock);
        break;
      }
      case "stat": {
        const value2 = str(b.value);
        if (value2) blocks.push({ kind: "stat", value: value2, caption: str(b.caption) || undefined });
        break;
      }
      case "offer": {
        const value2 = str(b.value);
        if (value2) blocks.push({ kind: "offer", value: value2, detail: str(b.detail) || undefined });
        break;
      }
      case "badges": {
        const items = strList(b.items, 3);
        if (items.length) blocks.push({ kind: "badges", items });
        break;
      }
      case "benefits": {
        const items = strList(b.items, 4);
        if (items.length) blocks.push({ kind: "benefits", items });
        break;
      }
      case "steps": {
        const items = strList(b.items, 4);
        if (items.length >= 2) blocks.push({ kind: "steps", items });
        break;
      }
      case "comparison": {
        const leftItems = strList(b.leftItems, 3);
        const rightItems = strList(b.rightItems, 3);
        const leftLabel = str(b.leftLabel);
        const rightLabel = str(b.rightLabel);
        if (leftLabel && rightLabel && leftItems.length && rightItems.length) {
          blocks.push({ kind: "comparison", leftLabel, leftItems, rightLabel, rightItems });
        }
        break;
      }
      case "quote": {
        const text = str(b.text);
        if (text) blocks.push({ kind: "quote", text, attribution: str(b.attribution) || undefined });
        break;
      }
      default:
        break;
    }
  }
  if (!blocks.length) return null;
  return { canvas: canvas as CompositionCanvas, panel: (["bottom", "top", "left", "right"] as const).find((p) => p === str(raw.panel)), blocks };
}

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PaintPlan {
  /** SVG drawn before the content blocks (photo, panels, scrims). */
  backdrop: string;
  /** Where the blocks are laid out. */
  content: Region;
  /** Color the blocks are drawn against. */
  surface: string;
  /** Whether the content sits directly on photography (needs stronger contrast). */
  onPhoto: boolean;
}

function clipPathDefs(width: number, height: number): string {
  return `<defs><clipPath id="fullClip"><rect x="0" y="0" width="${width}" height="${height}" /></clipPath></defs>`;
}

/**
 * Places the photograph and the content region for the chosen canvas
 * mode. Every mode returns a real, bounded content region -- the layout
 * engine below never has to know which mode produced it.
 */
function planCanvas(input: CompositionRenderInput): PaintPlan {
  const { width, height } = input;
  const brand = input.primaryColor ?? input.accentColor ?? "#14181F";
  const photo = input.photoDataUri;
  const pad = width * 0.075;

  const photoTag = (x: number, y: number, w: number, h: number, radius = 0): string => {
    if (!photo) return "";
    const clipId = `pc${Math.round(x)}_${Math.round(y)}`;
    const clip = radius > 0
      ? `<defs><clipPath id="${clipId}"><rect x="${round2(x)}" y="${round2(y)}" width="${round2(w)}" height="${round2(h)}" rx="${round2(radius)}" /></clipPath></defs>`
      : "";
    const clipAttr = radius > 0 ? ` clip-path="url(#${clipId})"` : "";
    return `${clip}<image href="${escapeXml(photo)}" x="${round2(x)}" y="${round2(y)}" width="${round2(w)}" height="${round2(h)}" preserveAspectRatio="xMidYMid slice"${clipAttr} />`;
  };

  switch (input.composition.canvas) {
    case "photo_top": {
      const photoH = height * 0.46;
      return {
        backdrop: `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(brand)}" />${photoTag(0, 0, width, photoH)}`,
        content: { x: pad, y: photoH + pad * 0.8, width: width - pad * 2, height: height - photoH - pad * 1.6 },
        surface: brand,
        onPhoto: false,
      };
    }
    case "photo_side": {
      const right = input.composition.panel === "left";
      const photoW = width * 0.44;
      const photoX = right ? width - photoW : 0;
      const contentX = right ? pad : photoW + pad * 0.8;
      return {
        backdrop: `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(brand)}" />${photoTag(photoX, 0, photoW, height)}`,
        content: { x: contentX, y: pad, width: width - photoW - pad * 1.8, height: height - pad * 2 },
        surface: brand,
        onPhoto: false,
      };
    }
    case "photo_inset": {
      const insetW = width - pad * 2;
      const insetH = height * 0.40;
      return {
        backdrop: `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(brand)}" />${photoTag(pad, pad, insetW, insetH, width * 0.035)}`,
        content: { x: pad, y: pad + insetH + pad * 0.7, width: insetW, height: height - insetH - pad * 2.4 },
        surface: brand,
        onPhoto: false,
      };
    }
    case "solid": {
      return {
        backdrop: `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(brand)}" />`,
        content: { x: pad, y: pad, width: width - pad * 2, height: height - pad * 2 },
        surface: brand,
        onPhoto: false,
      };
    }
    case "photo_full":
    default: {
      // Photograph behind everything, content on a solid brand panel over
      // it. A solid panel (not a translucent scrim) is what makes this read
      // as designed advertising rather than a subtitle over a stock photo.
      const side = input.composition.panel ?? "bottom";
      const backdropPhoto = `<rect x="0" y="0" width="${width}" height="${height}" fill="#1B1B1B" />${photoTag(0, 0, width, height)}`;
      if (side === "left" || side === "right") {
        const panelW = width * 0.52;
        const panelX = side === "left" ? 0 : width - panelW;
        return {
          backdrop: `${backdropPhoto}<rect x="${round2(panelX)}" y="0" width="${round2(panelW)}" height="${height}" fill="${escapeXml(brand)}" fill-opacity="0.94" />`,
          content: { x: panelX + pad * 0.8, y: pad, width: panelW - pad * 1.6, height: height - pad * 2 },
          surface: brand,
          onPhoto: false,
        };
      }
      const panelH = height * 0.50;
      const panelY = side === "top" ? 0 : height - panelH;
      return {
        backdrop: `${backdropPhoto}<rect x="0" y="${round2(panelY)}" width="${width}" height="${round2(panelH)}" fill="${escapeXml(brand)}" fill-opacity="0.94" />`,
        content: { x: pad, y: panelY + pad * 0.75, width: width - pad * 2, height: panelH - pad * 1.5 },
        surface: brand,
        onPhoto: false,
      };
    }
  }
}

interface BlockContext {
  x: number;
  y: number;
  width: number;
  /** Global type scale (1 = design size); shrunk when content overflows. */
  scale: number;
  canvasWidth: number;
  ink: string;
  inkMuted: string;
  accent: string;
  accentInk: string;
  surface: string;
}

interface BlockOutput {
  svg: string;
  height: number;
}

function mutedOf(ink: string): string {
  return ink === "#FFFFFF" ? "#D7DBE0" : "#5A6068";
}

/** Vector check mark inside a filled circle -- never a Unicode glyph. */
function checkIcon(cx: number, cy: number, r: number, fill: string, tick: string): string {
  const s = r * 0.86;
  const d = `M ${round2(cx - s * 0.45)} ${round2(cy)} L ${round2(cx - s * 0.08)} ${round2(cy + s * 0.36)} L ${round2(cx + s * 0.5)} ${round2(cy - s * 0.34)}`;
  return `<circle cx="${round2(cx)}" cy="${round2(cy)}" r="${round2(r)}" fill="${escapeXml(fill)}" /><path d="${d}" fill="none" stroke="${escapeXml(tick)}" stroke-width="${round2(r * 0.28)}" stroke-linecap="round" stroke-linejoin="round" />`;
}

function renderBlock(block: CompositionBlock, ctx: BlockContext): BlockOutput {
  const cw = ctx.canvasWidth;
  const s = ctx.scale;
  const { x, y, width } = ctx;

  switch (block.kind) {
    case "eyebrow": {
      const fs = cw * 0.026 * s;
      const font = getFont(600);
      const lines = wrapTextWithEllipsis(font, block.text, width, fs, 1, fs * 0.14);
      return {
        svg: renderTextLines(lines, x, y + fs, fs * 1.3, { fontSize: fs, weight: 600, fill: ctx.accent, anchor: "start", uppercase: true, letterSpacing: fs * 0.14 }),
        height: fs * 1.3 + cw * 0.018 * s,
      };
    }
    case "headline": {
      const fs = cw * 0.070 * s;
      const font = getFont(700);
      const lines = wrapTextWithEllipsis(font, block.text, width, fs, 4);
      const lh = fs * 1.08;
      return {
        svg: renderTextLines(lines, x, y + fs * 0.86, lh, { fontSize: fs, weight: 700, fill: ctx.ink, anchor: "start" }),
        height: lh * lines.length + cw * 0.022 * s,
      };
    }
    case "subhead": {
      const fs = cw * 0.036 * s;
      const font = getFont(600);
      const lines = wrapTextWithEllipsis(font, block.text, width, fs, 3);
      const lh = fs * 1.28;
      return {
        svg: renderTextLines(lines, x, y + fs * 0.9, lh, { fontSize: fs, weight: 600, fill: ctx.ink, anchor: "start" }),
        height: lh * lines.length + cw * 0.02 * s,
      };
    }
    case "body": {
      const fs = cw * 0.029 * s;
      const font = getFont(400);
      const lines = wrapTextWithEllipsis(font, block.text, width, fs, 4);
      const lh = fs * 1.42;
      return {
        svg: renderTextLines(lines, x, y + fs * 0.9, lh, { fontSize: fs, weight: 400, fill: ctx.inkMuted, anchor: "start" }),
        height: lh * lines.length + cw * 0.022 * s,
      };
    }
    case "stat": {
      // The number-led advertisement: the figure is the hero, not a word
      // inside a sentence.
      const fs = cw * 0.155 * s;
      const font = getFont(700);
      const fitted = measureWidth(font, block.value, fs) > width ? (width / measureWidth(font, block.value, fs)) * fs : fs;
      let svg = renderTextLines([block.value], x, y + fitted * 0.82, fitted * 1.02, { fontSize: fitted, weight: 700, fill: ctx.accent, anchor: "start" });
      let h = fitted * 1.02;
      if (block.caption) {
        const cfs = cw * 0.029 * s;
        const cfont = getFont(500);
        const clines = wrapTextWithEllipsis(cfont, block.caption, width, cfs, 2);
        svg += renderTextLines(clines, x, y + h + cfs * 0.9, cfs * 1.34, { fontSize: cfs, weight: 500, fill: ctx.ink, anchor: "start" });
        h += cfs * 1.34 * clines.length + cfs * 0.3;
      }
      return { svg, height: h + cw * 0.024 * s };
    }
    case "offer": {
      // The offer advertisement: a promotional value on its own accent
      // field so it reads as an offer, not as a sentence.
      const vfs = cw * 0.062 * s;
      const dfs = cw * 0.026 * s;
      const vfont = getFont(700);
      const dfont = getFont(500);
      const padX = cw * 0.028 * s;
      const padY = cw * 0.022 * s;
      const innerW = width - padX * 2;
      const vLines = wrapTextWithEllipsis(vfont, block.value, innerW, vfs, 2);
      const dLines = block.detail ? wrapTextWithEllipsis(dfont, block.detail, innerW, dfs, 2) : [];
      const vLh = vfs * 1.1;
      const dLh = dfs * 1.34;
      const boxH = padY * 2 + vLh * vLines.length + (dLines.length ? dLh * dLines.length + dfs * 0.35 : 0);
      const box = `<rect x="${round2(x)}" y="${round2(y)}" width="${round2(width)}" height="${round2(boxH)}" rx="${round2(cw * 0.018)}" fill="${escapeXml(ctx.accent)}" />`;
      let inner = renderTextLines(vLines, x + padX, y + padY + vfs * 0.86, vLh, { fontSize: vfs, weight: 700, fill: ctx.accentInk, anchor: "start" });
      if (dLines.length) {
        inner += renderTextLines(dLines, x + padX, y + padY + vLh * vLines.length + dfs * 1.15, dLh, { fontSize: dfs, weight: 500, fill: ctx.accentInk, anchor: "start" });
      }
      return { svg: box + inner, height: boxH + cw * 0.024 * s };
    }
    case "badges": {
      // Trust/proof chips, laid out on a real wrapping row.
      const fs = cw * 0.022 * s;
      const font = getFont(600);
      const padX = fs * 0.85;
      const chipH = fs * 2.5;
      const gap = fs * 0.6;
      let cx = x;
      let cy = y;
      let svg = "";
      let rows = 1;
      for (const item of block.items) {
        const label = item.toUpperCase();
        const w = measureWidth(font, label, fs, fs * 0.08) + padX * 2;
        if (cx + w > x + width && cx > x) {
          cx = x;
          cy += chipH + gap;
          rows++;
        }
        svg += `<rect x="${round2(cx)}" y="${round2(cy)}" width="${round2(w)}" height="${round2(chipH)}" rx="${round2(chipH / 2)}" fill="none" stroke="${escapeXml(ctx.accent)}" stroke-width="${round2(Math.max(1, fs * 0.09))}" />`;
        svg += renderTextLines([label], cx + padX, cy + chipH * 0.65, chipH, { fontSize: fs, weight: 600, fill: ctx.accent, anchor: "start", letterSpacing: fs * 0.08 });
        cx += w + gap;
      }
      return { svg, height: rows * chipH + (rows - 1) * gap + cw * 0.024 * s };
    }
    case "benefits": {
      const fs = cw * 0.028 * s;
      const font = getFont(500);
      const rowGap = fs * 0.85;
      const iconR = fs * 0.62;
      const textX = x + iconR * 2 + fs * 0.7;
      const textW = width - (textX - x);
      let cy = y;
      let svg = "";
      for (const item of block.items) {
        // Real defect found live during visual inspection (Creative
        // Generation Architecture Repair, 2026-09-07): a genuine,
        // realistic benefit sentence ("Creatives generated with your real
        // logo, automatically") rendered as "Creatives generated with your
        // real logo,..." -- the LAST WORD silently dropped by the ellipsis,
        // reading as cut-off, incoherent text on the actual rendered
        // creative. This column is narrower than headline/body/quote's
        // (an icon + gap eats into it) yet was capped at the SAME 2-line
        // budget as a short label -- raised to 3 so a real, complete
        // benefit sentence has room before the renderer resorts to an
        // ellipsis at all.
        const lines = wrapTextWithEllipsis(font, item, textW, fs, 3);
        const lh = fs * 1.32;
        svg += checkIcon(x + iconR, cy + fs * 0.62, iconR, ctx.accent, ctx.surface);
        svg += renderTextLines(lines, textX, cy + fs * 0.92, lh, { fontSize: fs, weight: 500, fill: ctx.ink, anchor: "start" });
        cy += lh * lines.length + rowGap;
      }
      return { svg, height: cy - y + cw * 0.014 * s };
    }
    case "steps": {
      // The process advertisement: real numbered stages, so sequence is
      // visible at a glance instead of being described in a sentence.
      const fs = cw * 0.026 * s;
      const numFs = cw * 0.030 * s;
      const font = getFont(500);
      const r = numFs * 0.92;
      const rowGap = fs * 0.9;
      const textX = x + r * 2 + fs * 0.8;
      const textW = width - (textX - x);
      let cy = y;
      let svg = "";
      block.items.forEach((item, i) => {
        // Same fix as the "benefits" case above -- a narrow icon-offset
        // column with only a 2-line budget silently ellipsized real
        // content on a genuine step description.
        const lines = wrapTextWithEllipsis(font, item, textW, fs, 3);
        const lh = fs * 1.32;
        const cyMid = cy + fs * 0.6;
        svg += `<circle cx="${round2(x + r)}" cy="${round2(cyMid)}" r="${round2(r)}" fill="${escapeXml(ctx.accent)}" />`;
        svg += renderTextLines([String(i + 1)], x + r, cyMid + numFs * 0.34, numFs, { fontSize: numFs, weight: 700, fill: ctx.accentInk, anchor: "middle" });
        if (i < block.items.length - 1) {
          svg += `<line x1="${round2(x + r)}" y1="${round2(cyMid + r * 1.12)}" x2="${round2(x + r)}" y2="${round2(cy + lh * lines.length + rowGap + fs * 0.6 - r * 1.12)}" stroke="${escapeXml(ctx.accent)}" stroke-width="${round2(Math.max(1, r * 0.14))}" stroke-opacity="0.5" />`;
        }
        svg += renderTextLines(lines, textX, cy + fs * 0.92, lh, { fontSize: fs, weight: 500, fill: ctx.ink, anchor: "start" });
        cy += lh * lines.length + rowGap;
      });
      return { svg, height: cy - y + cw * 0.014 * s };
    }
    case "comparison": {
      // The comparison advertisement: two real columns, so the contrast is
      // structural rather than asserted in prose.
      const labelFs = cw * 0.023 * s;
      const itemFs = cw * 0.025 * s;
      const gutter = cw * 0.03 * s;
      const colW = (width - gutter) / 2;
      const labelFont = getFont(700);
      const itemFont = getFont(500);
      const padY = cw * 0.018 * s;

      const renderCol = (cx: number, label: string, items: string[], emphasised: boolean): { svg: string; height: number } => {
        const fill = emphasised ? ctx.accent : "transparent";
        const strokeCol = emphasised ? ctx.accent : ctx.inkMuted;
        const labelInk = emphasised ? ctx.accentInk : ctx.inkMuted;
        const itemInk = ctx.ink;
        let inner = "";
        let cy = padY + labelFs * 1.9;
        for (const item of items) {
          const lines = wrapTextWithEllipsis(itemFont, item, colW - cw * 0.03 * s, itemFs, 2);
          const lh = itemFs * 1.3;
          inner += renderTextLines(lines, cx + cw * 0.015 * s, cy + itemFs * 0.9, lh, { fontSize: itemFs, weight: 500, fill: itemInk, anchor: "start" });
          cy += lh * lines.length + itemFs * 0.5;
        }
        const boxH = cy + padY * 0.6;
        const labelLines = wrapTextWithEllipsis(labelFont, label.toUpperCase(), colW - cw * 0.03 * s, labelFs, 1, labelFs * 0.1);
        const head = `<rect x="${round2(cx)}" y="${round2(0)}" width="${round2(colW)}" height="${round2(labelFs * 2.5)}" rx="${round2(cw * 0.012)}" fill="${escapeXml(fill)}" ${emphasised ? "" : `stroke="${escapeXml(strokeCol)}" stroke-width="1"`} />`
          + renderTextLines(labelLines, cx + cw * 0.015 * s, labelFs * 1.62, labelFs * 1.3, { fontSize: labelFs, weight: 700, fill: labelInk, anchor: "start", letterSpacing: labelFs * 0.1 });
        return { svg: head + inner, height: boxH };
      };

      const left = renderCol(0, block.leftLabel, block.leftItems, false);
      const right = renderCol(colW + gutter, block.rightLabel, block.rightItems, true);
      const h = Math.max(left.height, right.height);
      return {
        svg: `<g transform="translate(${round2(x)}, ${round2(y)})">${left.svg}${right.svg}</g>`,
        height: h + cw * 0.026 * s,
      };
    }
    case "quote": {
      const fs = cw * 0.036 * s;
      const font = getFont(600);
      const lines = wrapTextWithEllipsis(font, `“${block.text}”`, width - cw * 0.03 * s, fs, 4);
      const lh = fs * 1.34;
      const bar = `<rect x="${round2(x)}" y="${round2(y)}" width="${round2(Math.max(2, cw * 0.006))}" height="${round2(lh * lines.length)}" fill="${escapeXml(ctx.accent)}" />`;
      const textX = x + cw * 0.028 * s;
      let svg = bar + renderTextLines(lines, textX, y + fs * 0.95, lh, { fontSize: fs, weight: 600, fill: ctx.ink, anchor: "start" });
      let h = lh * lines.length;
      if (block.attribution) {
        const afs = cw * 0.024 * s;
        svg += renderTextLines([block.attribution], textX, y + h + afs * 1.5, afs * 1.3, { fontSize: afs, weight: 500, fill: ctx.inkMuted, anchor: "start" });
        h += afs * 2;
      }
      return { svg, height: h + cw * 0.026 * s };
    }
    case "cta": {
      const fs = cw * 0.030 * s;
      const font = getFont(700);
      const padX = fs * 1.25;
      const padY = fs * 0.72;
      const maxInner = width - padX * 2;
      const lines = wrapTextWithEllipsis(font, block.text, maxInner, fs, 2);
      const longest = lines.reduce((a, b) => (measureWidth(font, b, fs) > measureWidth(font, a, fs) ? b : a), "");
      const innerW = Math.min(maxInner, measureWidth(font, longest, fs));
      const boxW = innerW + padX * 2;
      const lh = fs * 1.25;
      const boxH = lh * lines.length + padY * 2;
      const box = `<rect x="${round2(x)}" y="${round2(y)}" width="${round2(boxW)}" height="${round2(boxH)}" rx="${round2(boxH / 2)}" fill="${escapeXml(ctx.accent)}" />`;
      const text = renderTextLines(lines, x + boxW / 2, y + padY + fs * 0.92, lh, { fontSize: fs, weight: 700, fill: ctx.accentInk, anchor: "middle" });
      return { svg: box + text, height: boxH + cw * 0.02 * s };
    }
    default:
      return { svg: "", height: 0 };
  }
}

function layout(blocks: CompositionBlock[], base: Omit<BlockContext, "y">, startY: number): { svg: string; height: number } {
  let y = startY;
  let svg = "";
  for (const block of blocks) {
    const out = renderBlock(block, { ...base, y });
    svg += out.svg;
    y += out.height;
  }
  return { svg, height: y - startY };
}

/**
 * Renders a composition to SVG. Content is measured first and the whole
 * type scale is shrunk (never individual blocks clipped) if the strategy
 * chose more blocks than the region can hold at design size -- so a rich
 * composition degrades by getting tighter, not by silently losing the
 * proof point or the CTA.
 */
export function buildCompositionSvg(input: CompositionRenderInput): string {
  const { width, height } = input;
  const plan = planCanvas(input);

  const ink = legibleTextColorFor(plan.surface);
  const accentRaw = input.secondaryColor ?? input.accentColor ?? (ink === "#FFFFFF" ? "#FFFFFF" : "#14181F");
  // The accent must be legible ON the panel and must give legible text
  // INSIDE its own filled shapes (offer field, CTA pill, step numbers).
  const accent = accentRaw.toUpperCase() === plan.surface.toUpperCase() ? (ink === "#FFFFFF" ? "#FFFFFF" : "#14181F") : accentRaw;
  const accentInk = legibleTextColorFor(accent);

  const baseCtx: Omit<BlockContext, "y"> = {
    x: plan.content.x,
    width: plan.content.width,
    scale: 1,
    canvasWidth: width,
    ink,
    inkMuted: mutedOf(ink),
    accent,
    accentInk,
    surface: plan.surface,
  };

  // Reserve the logo lockup at the top of the content region.
  const logo = selectLogoVariant({ logoImage: input.logoImage ?? null, logoVariants: input.logoVariants ?? null, layoutArchetype: "BASIC_ESSENTIAL" });
  const logoBoxH = width * 0.062;
  const logoSvg = buildLogoImageSvg(logo, plan.content.x, plan.content.y, width * 0.20, logoBoxH);
  // The brand lockup SHRINKS TO FIT rather than truncating: a clipped
  // business name ("GLOBAL PATHWAYS OVER…") is never acceptable on a
  // customer-facing advertisement, and the name is measured in its final
  // UPPERCASE form -- measuring the mixed-case source and rendering the
  // wider uppercase version is exactly how a lockup silently overruns.
  const brandFont = getFont(700);
  const brandText = input.businessName.toUpperCase();
  let brandFs = width * 0.024;
  const brandMax = plan.content.width;
  const brandMeasured = measureWidth(brandFont, brandText, brandFs, brandFs * 0.1);
  if (brandMeasured > brandMax) brandFs = Math.max(width * 0.013, brandFs * (brandMax / brandMeasured));
  const brandLockup = logoSvg
    ? logoSvg
    : renderTextLines(
        [brandText],
        plan.content.x,
        plan.content.y + brandFs,
        brandFs * 1.3,
        { fontSize: brandFs, weight: 700, fill: ink, anchor: "start", letterSpacing: brandFs * 0.1 },
      );
  const lockupH = (logoSvg ? logoBoxH : brandFs * 1.3) + width * 0.030;

  const blocksTop = plan.content.y + lockupH;
  const available = plan.content.height - lockupH;

  // Measure at design size, then fit.
  const measured = layout(input.composition.blocks, baseCtx, blocksTop).height;
  let scale = 1;
  if (measured > available && measured > 0) {
    scale = Math.max(0.62, available / measured);
  }
  const fitted = layout(input.composition.blocks, { ...baseCtx, scale }, blocksTop);

  // Vertically center the block stack in whatever room is left, so a short
  // composition doesn't hang off the top of a tall panel.
  const slack = Math.max(0, available - fitted.height);
  const shift = Math.min(slack, slack * 0.5);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    clipPathDefs(width, height),
    plan.backdrop,
    brandLockup,
    `<g transform="translate(0, ${round2(shift)})">${fitted.svg}</g>`,
    `</svg>`,
  ].join("");
}

/**
 * Rasterizes a composition onto a plain canvas. The real photograph is
 * embedded INSIDE the SVG (as a data URI) rather than being the sharp
 * base, because a composition decides where imagery lives -- full-bleed,
 * a top band, one half, an inset card, or nowhere at all -- and only an
 * in-SVG <image> can honour all five. (text-overlay-render.ts's legacy
 * archetype path keeps its own full-bleed-base behaviour untouched.)
 */
export async function renderCompositionOverlay(
  baseImage: Buffer | null,
  input: Omit<CompositionRenderInput, "photoDataUri">,
): Promise<Buffer> {
  let photoDataUri: string | null = null;
  if (baseImage && input.composition.canvas !== "solid") {
    const png = await sharp(baseImage).png().toBuffer();
    photoDataUri = `data:image/png;base64,${png.toString("base64")}`;
  }
  const svg = buildCompositionSvg({ ...input, photoDataUri });
  return sharp({ create: { width: input.width, height: input.height, channels: 3, background: "#FFFFFF" } })
    .composite([{ input: Buffer.from(svg, "utf8"), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
