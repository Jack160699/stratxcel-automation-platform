const ALLOWED_BRAND_KEYS = [
  "business_name",
  "industry",
  "tone_of_voice",
  "target_audience",
  "products",
  "pillars",
  "rules",
  "approved_claims",
  "prohibited_claims",
  "color_hints",
  "visual_direction",
  "locations",
] as const;

/** Keep only approved Brand Brain fields at the provider boundary. */
export function snapshotImageBrandContext(content: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!content) return {};
  const snapshot: Record<string, unknown> = {};
  for (const key of ALLOWED_BRAND_KEYS) {
    const value = content[key];
    if (value !== undefined && value !== null && value !== "") snapshot[key] = value;
  }
  return snapshot;
}

function line(label: string, value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return `${label}: ${value.trim()}`;
  if (Array.isArray(value) && value.length) {
    const rendered = value
      .slice(0, 12)
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join("; ");
    return `${label}: ${rendered}`;
  }
  return null;
}

export function buildProviderReadyImagePrompt(input: {
  brief: string;
  intendedUse: string;
  aspectRatio: string;
  styleDirection?: string | null;
  brandContext: Record<string, unknown>;
  revisionInstruction?: string | null;
  language?: string | null;
}): string {
  const brand = input.brandContext;
  const lines = [
    `Create one production-quality image for ${input.intendedUse.replaceAll("_", " ")}.`,
    `Creative brief: ${input.brief.trim()}`,
    `Composition: ${input.aspectRatio} aspect ratio; keep important subjects inside platform-safe margins.`,
    line("Business", brand.business_name),
    line("Industry", brand.industry),
    line("Audience", brand.target_audience),
    line("Brand voice", brand.tone_of_voice),
    line("Products/services (use only these known facts)", brand.products),
    line("Visual direction", brand.visual_direction),
    line("Brand colors", brand.color_hints),
    line("Brand rules", brand.rules),
    line("Approved claims", brand.approved_claims),
    line("Never include these claims", brand.prohibited_claims),
    input.language?.trim() ? `Language / Cultural Context: ${input.language.trim()}` : null,
    input.styleDirection?.trim() ? `Creative direction: ${input.styleDirection.trim()}` : null,
    "HARD MANDATORY NEGATIVE CONSTRAINT: DO NOT DRAW, RENDER, OR INVENT ANY TEXT, WORDS, LETTERS, SLOGANS, HEADLINES, LOGOS, OR BRAND MARKS ANYWHERE IN THIS IMAGE. Produce clean, authentic, editorial photography ONLY with natural lighting and realistic composition. Absolutely no fake logos, invented typography, poster banners, or text overlays.",
    "Do not invent business facts, awards, prices, testimonials, product details, or hallucinated branding.",
    "Avoid malformed anatomy, AI artifacts, fake logos, watermarks, unsafe claims, and platform-inappropriate crops.",
  ].filter((value): value is string => Boolean(value));
  return lines.join("\n").slice(0, 12_000);
}

export function createAdvisoryImageCritique(input: {
  aspectRatio: string;
  intendedUse: string;
  hasBrandContext: boolean;
  referenceCount: number;
  provider: string;
  model: string;
}): Record<string, unknown> {
  return {
    kind: "automated_preflight",
    advisory: true,
    certainty: "limited_without_independent_visual_review",
    decision: "HUMAN_SELECTION_REQUIRED",
    checks: {
      brief_alignment: "provider_output_returned",
      brand_context: input.hasBrandContext ? "included_in_generation_prompt" : "not_available",
      composition: `requested_${input.aspectRatio}`,
      platform_suitability: input.intendedUse,
      reference_fidelity: input.referenceCount > 0 ? "requires_human_confirmation" : "not_applicable",
      text_logo_quality: "requires_human_confirmation",
      prohibited_claims: "prompt_guard_applied_requires_human_confirmation",
    },
    provider: input.provider,
    model: input.model,
  };
}
