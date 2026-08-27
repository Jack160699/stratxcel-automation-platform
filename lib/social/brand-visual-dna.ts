/**
 * Brand Visual DNA (Premium Creative Intelligence brief Section 5): don't
 * just extract a hex code and call it "branding." Derive a compact visual
 * system every creative for this business must respect -- color
 * temperature, contrast, typography personality, and a positioning
 * archetype -- from whatever real brand signal actually exists (saved
 * brand colors, tone-of-voice words, industry).
 *
 * Pure and deterministic: no AI call, no I/O. This is explicitly an
 * INFERENCE layer, not a real visual-asset analysis -- these fixtures (and
 * most real tenants at this stage) have no uploaded photography/logo files
 * to run actual image analysis against, only a saved hex palette and tone
 * words. Every field that is inferred rather than directly stated is
 * labeled as such in `basis` so no caller mistakes "we guessed from a hex
 * code" for "we analyzed the brand's real visual assets."
 */

export type ColorTemperature = "warm" | "cool" | "neutral";
export type ContrastLevel = "low" | "medium" | "high";
export type SaturationLevel = "muted" | "moderate" | "vivid";
export type LightDarkPreference = "light" | "dark" | "balanced";
export type TypographyPersonality = "editorial-serif" | "confident-display" | "clean-geometric" | "warm-humanist" | "bold-condensed";
export type PositioningArchetype = "luxury" | "energetic" | "approachable" | "clinical" | "playful" | "industrial";

export interface BrandVisualDNA {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  colorTemperature: ColorTemperature;
  contrastLevel: ContrastLevel;
  saturationLevel: SaturationLevel;
  lightDarkPreference: LightDarkPreference;
  typographyPersonality: TypographyPersonality;
  positioningArchetype: PositioningArchetype;
  /** Explains what was actually available vs inferred -- never let a
   * caller treat an inference as a verified brand fact. */
  basis: string[];
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1]!, 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

function temperatureFromHue(h: number): ColorTemperature {
  // Red/orange/yellow (0-70, 330-360) reads warm; cyan/blue/violet
  // (150-290) reads cool; green/teal boundary bands read neutral.
  if ((h >= 0 && h <= 70) || h >= 330) return "warm";
  if (h >= 150 && h <= 290) return "cool";
  return "neutral";
}

const TONE_TO_TYPOGRAPHY: Array<{ words: string[]; personality: TypographyPersonality }> = [
  { words: ["elegant", "refined", "luxury", "premium", "sophisticated", "editorial"], personality: "editorial-serif" },
  { words: ["confident", "bold", "trend-forward", "modern", "expert", "authoritative"], personality: "confident-display" },
  { words: ["clean", "clinical", "professional", "trustworthy", "precise", "calm"], personality: "clean-geometric" },
  { words: ["warm", "unpretentious", "friendly", "approachable", "welcoming", "homely"], personality: "warm-humanist" },
  { words: ["energetic", "high-energy", "intense", "powerful", "gritty", "industrial"], personality: "bold-condensed" },
];

const TONE_TO_POSITIONING: Array<{ words: string[]; archetype: PositioningArchetype }> = [
  { words: ["luxury", "premium", "elegant", "refined", "sophisticated"], archetype: "luxury" },
  { words: ["energetic", "high-energy", "intense", "powerful", "gritty"], archetype: "energetic" },
  { words: ["warm", "unpretentious", "friendly", "approachable", "welcoming", "homely"], archetype: "approachable" },
  { words: ["clinical", "trustworthy", "precise", "calm", "professional"], archetype: "clinical" },
  { words: ["playful", "fun", "quirky", "vibrant"], archetype: "playful" },
  { words: ["industrial", "rugged", "utilitarian", "no-nonsense"], archetype: "industrial" },
];

function matchFromTone(tone: string[], table: Array<{ words: string[] }>): number {
  const haystack = tone.join(" ").toLowerCase();
  for (let i = 0; i < table.length; i++) {
    if (table[i]!.words.some((w) => haystack.includes(w))) return i;
  }
  return -1;
}

/** Industry-appropriate defaults used only when brand tone gives no signal
 * -- never silently defaults to the same look for every industry. */
const INDUSTRY_TYPOGRAPHY_FALLBACK: Record<string, TypographyPersonality> = {
  restaurant: "warm-humanist",
  salon: "editorial-serif",
  gym: "bold-condensed",
  clinic: "clean-geometric",
  retail: "confident-display",
  real_estate: "editorial-serif",
  local_service: "clean-geometric",
  generic: "clean-geometric",
};

const INDUSTRY_POSITIONING_FALLBACK: Record<string, PositioningArchetype> = {
  restaurant: "approachable",
  salon: "luxury",
  gym: "energetic",
  clinic: "clinical",
  retail: "playful",
  real_estate: "luxury",
  local_service: "industrial",
  generic: "approachable",
};

export function deriveBrandVisualDNA(input: {
  brandColors: string[];
  brandTone: string[];
  industryCategory: string;
}): BrandVisualDNA {
  const basis: string[] = [];
  const validColors = input.brandColors.filter((c) => hexToHsl(c));
  const primaryColor = validColors[0] ?? null;
  const secondaryColor = validColors[1] ?? null;
  const accentColor = validColors[2] ?? validColors[1] ?? null;

  let colorTemperature: ColorTemperature = "neutral";
  let contrastLevel: ContrastLevel = "medium";
  let saturationLevel: SaturationLevel = "moderate";
  let lightDarkPreference: LightDarkPreference = "balanced";

  if (primaryColor) {
    const hsl = hexToHsl(primaryColor)!;
    colorTemperature = temperatureFromHue(hsl.h);
    saturationLevel = hsl.s < 0.35 ? "muted" : hsl.s > 0.7 ? "vivid" : "moderate";
    lightDarkPreference = hsl.l < 0.35 ? "dark" : hsl.l > 0.7 ? "light" : "balanced";
    basis.push(`color temperature/saturation/lightness inferred from saved primary brand color ${primaryColor}`);
  } else {
    basis.push("no valid saved brand color -- color temperature/saturation/lightness left at neutral defaults");
  }

  if (validColors.length >= 2) {
    const a = hexToHsl(validColors[0]!)!;
    const b = hexToHsl(validColors[1]!)!;
    const lDelta = Math.abs(a.l - b.l);
    contrastLevel = lDelta > 0.45 ? "high" : lDelta > 0.2 ? "medium" : "low";
    basis.push(`contrast level inferred from lightness delta between the two saved brand colors`);
  } else {
    basis.push("fewer than two saved brand colors -- contrast level left at medium default");
  }

  let typographyPersonality: TypographyPersonality;
  const toneTypoIdx = matchFromTone(input.brandTone, TONE_TO_TYPOGRAPHY);
  if (toneTypoIdx >= 0) {
    typographyPersonality = TONE_TO_TYPOGRAPHY[toneTypoIdx]!.personality;
    basis.push(`typography personality inferred from saved brand tone word(s): ${input.brandTone.join(", ")}`);
  } else {
    typographyPersonality = INDUSTRY_TYPOGRAPHY_FALLBACK[input.industryCategory] ?? "clean-geometric";
    basis.push(`no brand-tone signal for typography -- fell back to the ${input.industryCategory} industry default`);
  }

  let positioningArchetype: PositioningArchetype;
  const tonePosIdx = matchFromTone(input.brandTone, TONE_TO_POSITIONING);
  if (tonePosIdx >= 0) {
    positioningArchetype = TONE_TO_POSITIONING[tonePosIdx]!.archetype;
    basis.push(`positioning archetype inferred from saved brand tone word(s): ${input.brandTone.join(", ")}`);
  } else {
    positioningArchetype = INDUSTRY_POSITIONING_FALLBACK[input.industryCategory] ?? "approachable";
    basis.push(`no brand-tone signal for positioning -- fell back to the ${input.industryCategory} industry default`);
  }

  return {
    primaryColor,
    secondaryColor,
    accentColor,
    colorTemperature,
    contrastLevel,
    saturationLevel,
    lightDarkPreference,
    typographyPersonality,
    positioningArchetype,
    basis,
  };
}

/** Compact one-line summary for prompt injection -- keeps the visual DNA
 * from bloating the treatment-generation prompt while still steering it. */
export function summarizeBrandVisualDNA(dna: BrandVisualDNA): string {
  const colors = [dna.primaryColor, dna.secondaryColor, dna.accentColor].filter(Boolean).join(", ") || "no saved brand color";
  return `${dna.positioningArchetype} positioning, ${dna.colorTemperature}/${dna.saturationLevel} palette (${colors}), ${dna.contrastLevel} contrast, prefers ${dna.lightDarkPreference} imagery, ${dna.typographyPersonality} typography personality.`;
}
