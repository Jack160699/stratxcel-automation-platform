/**
 * BrandBrain Logo Engine (Phase 3): real, deterministic sharp-based logo
 * processing -- no OpenAI, no external segmentation service. "rembg" (the
 * mission's suggested AI-segmentation fallback) is not configured
 * anywhere in this codebase and no such dependency exists; background
 * removal here is a real, working sharp-only chroma-key technique
 * (corner-color sampling + per-pixel color-distance thresholding on the
 * raw RGBA buffer), honestly documented as a heuristic rather than true
 * ML segmentation -- it cleanly handles the common real case (a logo on a
 * solid white/black/brand-color background) and safely no-ops (keeps the
 * image opaque, backgroundRemoved: false) when it can't confidently
 * detect one, rather than mangling a photo-based or already-complex
 * image.
 *
 * Every function here is pure (Buffer in, Buffer out) so it can be unit-
 * tested with programmatically-generated sharp fixtures, without a live
 * Supabase project or a real upload -- the API route
 * (app/api/platform/brand/logo-analyze/route.ts) is the only place this
 * touches storage/DB.
 */
import sharp, { type Channels } from "sharp";

export interface LogoVariantSet {
  /** Cleaned/transparent original -- background removed when one was
   * confidently detected, otherwise the source re-encoded as PNG as-is. */
  transparent: Buffer;
  /** Pure #FFFFFF knockout of the transparent variant -- reads on dark
   * layouts/backgrounds. */
  monoLight: Buffer;
  /** Pure #1A1A1A knockout of the transparent variant -- reads on light
   * layouts/backgrounds. */
  monoDark: Buffer;
  /** The transparent variant centered inside a padded white circular
   * badge -- for archetypes where the logo sits directly on a busy photo
   * and needs its own contained surface to stay legible. */
  badge: Buffer;
}

export interface LogoAnalysisResult extends LogoVariantSet {
  /** Whether a solid background was actually detected and stripped --
   * false means `transparent` is the source image re-encoded, unchanged,
   * because nothing confident enough to remove was found (e.g. a photo, a
   * busy/gradient background, or an image with no uniform border). */
  backgroundRemoved: boolean;
  width: number;
  height: number;
}

const MAX_DIMENSION = 1024; // logos are small; this bounds processing cost and output size without visibly degrading quality
const CORNER_SAMPLE = 6; // px square sampled at each corner
const CORNER_UNIFORMITY_MAX_STDDEV = 10; // a corner patch this uniform is plausibly "solid background", not part of a busy image
const BG_HARD_CUTOFF = 30; // per-pixel color distance below this is fully transparent
const BG_SOFT_CUTOFF = 60; // between HARD and SOFT: a real anti-aliased edge, partial transparency proportional to distance
const REAL_ALPHA_SAMPLE_STRIDE = 17; // prime stride so a sampled subset still covers the whole image, not just one edge pattern
const BADGE_SIZE = 512;
const BADGE_PADDING_RATIO = 0.16;

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: Channels;
}

async function toRawRgba(input: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(input)
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** True when the source already has real, meaningful transparency (a
 * proper PNG cutout) -- sampling a stride of pixels rather than every one
 * keeps this cheap on a full-resolution raw buffer. */
function hasRealAlphaVariance(img: RawImage): boolean {
  const { data, channels } = img;
  if (channels < 4) return false;
  let sawTransparent = false;
  let sawOpaque = false;
  for (let i = 3; i < data.length; i += channels * REAL_ALPHA_SAMPLE_STRIDE) {
    if (data[i]! < 245) sawTransparent = true;
    else sawOpaque = true;
    if (sawTransparent && sawOpaque) return true;
  }
  return false;
}

/** Samples a small square at each of the 4 corners; if all 4 corners are
 * both internally uniform (low pixel-to-pixel variance -- plausibly a
 * flat background, not part of a busy image reaching the corner) and
 * close to each other in color, returns that shared color as the
 * detected background. Returns null when the corners disagree or aren't
 * uniform -- deliberately conservative, since a wrong guess here would
 * cut a hole into a real logo. */
function detectSolidBackgroundColor(img: RawImage): { r: number; g: number; b: number } | null {
  const { data, width, height, channels } = img;
  if (width < CORNER_SAMPLE * 2 || height < CORNER_SAMPLE * 2) return null;

  const corners = [
    { x: 0, y: 0 },
    { x: width - CORNER_SAMPLE, y: 0 },
    { x: 0, y: height - CORNER_SAMPLE },
    { x: width - CORNER_SAMPLE, y: height - CORNER_SAMPLE },
  ];

  const cornerAverages: Array<{ r: number; g: number; b: number }> = [];
  for (const corner of corners) {
    let sumR = 0, sumG = 0, sumB = 0;
    const samples: Array<[number, number, number]> = [];
    for (let dy = 0; dy < CORNER_SAMPLE; dy += 1) {
      for (let dx = 0; dx < CORNER_SAMPLE; dx += 1) {
        const x = corner.x + dx;
        const y = corner.y + dy;
        const idx = (y * width + x) * channels;
        const r = data[idx]!, g = data[idx + 1]!, b = data[idx + 2]!;
        samples.push([r, g, b]);
        sumR += r; sumG += g; sumB += b;
      }
    }
    const n = samples.length;
    const avgR = sumR / n, avgG = sumG / n, avgB = sumB / n;
    // internal uniformity: average per-pixel distance from this corner's own mean
    let varianceSum = 0;
    for (const [r, g, b] of samples) varianceSum += colorDistance(r, g, b, avgR, avgG, avgB);
    const meanDeviation = varianceSum / n;
    if (meanDeviation > CORNER_UNIFORMITY_MAX_STDDEV) return null; // this corner isn't flat -- likely part of the logo itself, bail conservatively
    cornerAverages.push({ r: avgR, g: avgG, b: avgB });
  }

  const [c0, c1, c2, c3] = cornerAverages as [typeof cornerAverages[0], typeof cornerAverages[0], typeof cornerAverages[0], typeof cornerAverages[0]];
  const maxCornerDistance = Math.max(
    colorDistance(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b),
    colorDistance(c0.r, c0.g, c0.b, c2.r, c2.g, c2.b),
    colorDistance(c0.r, c0.g, c0.b, c3.r, c3.g, c3.b),
    colorDistance(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b),
  );
  if (maxCornerDistance > CORNER_UNIFORMITY_MAX_STDDEV * 2) return null; // corners disagree -- not a uniform background

  const r = Math.round((c0.r + c1.r + c2.r + c3.r) / 4);
  const g = Math.round((c0.g + c1.g + c2.g + c3.g) / 4);
  const b = Math.round((c0.b + c1.b + c2.b + c3.b) / 4);
  return { r, g, b };
}

/**
 * Real background-removal pass. When the source is already a proper
 * transparent PNG, returns it unchanged (re-encoded). Otherwise attempts
 * corner-based solid-background detection and, when confident, chroma-
 * keys it out with a soft edge (avoids the jagged hard-cutout look a
 * naive threshold produces).
 */
export async function extractTransparentLogo(inputBuffer: Buffer): Promise<{ png: Buffer; backgroundRemoved: boolean; width: number; height: number }> {
  const img = await toRawRgba(inputBuffer);
  const { data, width, height, channels } = img;

  if (hasRealAlphaVariance(img)) {
    return { png: await sharp(data, { raw: { width, height, channels } }).png().toBuffer(), backgroundRemoved: false, width, height };
  }

  const background = detectSolidBackgroundColor(img);
  if (!background) {
    return { png: await sharp(data, { raw: { width, height, channels } }).png().toBuffer(), backgroundRemoved: false, width, height };
  }

  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += channels) {
    const dist = colorDistance(out[i]!, out[i + 1]!, out[i + 2]!, background.r, background.g, background.b);
    if (dist <= BG_HARD_CUTOFF) {
      out[i + 3] = 0;
    } else if (dist <= BG_SOFT_CUTOFF) {
      const t = (dist - BG_HARD_CUTOFF) / (BG_SOFT_CUTOFF - BG_HARD_CUTOFF);
      out[i + 3] = Math.round((out[i + 3] ?? 255) * t);
    }
  }
  return { png: await sharp(out, { raw: { width, height, channels } }).png().toBuffer(), backgroundRemoved: true, width, height };
}

/** Recolors every non-transparent pixel of a transparent-PNG buffer to a
 * single flat color, preserving the real alpha shape -- a true knockout,
 * not a tint (partial-alpha edge pixels keep their partial alpha, so
 * anti-aliased edges from extractTransparentLogo stay smooth). */
export async function buildMonochromeKnockout(transparentPng: Buffer, hex: `#${string}`): Promise<Buffer> {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const { data, info } = await sharp(transparentPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += info.channels) {
    if (out[i + 3]! > 0) {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
}

/** Places the transparent logo, contained and padded, inside a flat white
 * circular badge -- a real, self-contained surface for archetypes whose
 * background is a photo the plain logo could get lost against. */
export async function buildBoundedBadge(transparentPng: Buffer): Promise<Buffer> {
  const size = BADGE_SIZE;
  const padding = Math.round(size * BADGE_PADDING_RATIO);
  const innerSize = size - padding * 2;
  const resizedLogo = await sharp(transparentPng)
    .resize(innerSize, innerSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const container = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#FFFFFF" /></svg>`;
  return sharp(Buffer.from(container))
    .composite([{ input: resizedLogo, gravity: "center" }])
    .png()
    .toBuffer();
}

/** The full Phase 3 pipeline: one uploaded logo buffer in, all 4 real
 * variants out. */
export async function analyzeLogo(inputBuffer: Buffer): Promise<LogoAnalysisResult> {
  const { png: transparent, backgroundRemoved, width, height } = await extractTransparentLogo(inputBuffer);
  const [monoLight, monoDark, badge] = await Promise.all([
    buildMonochromeKnockout(transparent, "#FFFFFF"),
    buildMonochromeKnockout(transparent, "#1A1A1A"),
    buildBoundedBadge(transparent),
  ]);
  return { transparent, monoLight, monoDark, badge, backgroundRemoved, width, height };
}
