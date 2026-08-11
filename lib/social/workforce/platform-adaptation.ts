import type { SocialPlatform, UpstreamFinalCreative } from "./types.ts";
import { normalizeSocialPlatform, SocialReleaseArtifactError } from "./release-artifact.ts";

/**
 * Platform adaptation reshapes presentation without rewriting factual claims.
 */

const CLAIM_TOKEN =
  /\b(?:\d+(?:\.\d+)?%|\d+\+|guaranteed?|best|#[a-z0-9_]+|\b(?:roi|roas|cpa|cpl)\b)/gi;

function extractClaimTokens(text: string): string[] {
  return [...text.matchAll(CLAIM_TOKEN)].map((m) => m[0].toLowerCase()).sort();
}

export function assertFactualClaimsPreserved(source: string, adapted: string): void {
  const sourceClaims = extractClaimTokens(source);
  const adaptedClaims = extractClaimTokens(adapted);
  const adaptedLower = adapted.toLowerCase();
  const sourceLower = source.toLowerCase();

  for (const claim of new Set(sourceClaims)) {
    if (!adaptedLower.includes(claim)) {
      throw new SocialReleaseArtifactError("factual_claim_rewrite_rejected");
    }
  }

  for (const claim of new Set(adaptedClaims)) {
    if (/^\d/.test(claim) || /guaranteed?|best/i.test(claim)) {
      if (!sourceLower.includes(claim)) {
        throw new SocialReleaseArtifactError("factual_claim_invention_rejected");
      }
    }
  }
}

export interface PlatformAdaptationResult {
  platform: SocialPlatform;
  caption: string;
  hashtags: readonly string[];
  cta: string | null;
  accessibilityText: string | null;
}

function trimTo(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Adapt master creative into a platform-specific release form.
 * Only call for genuinely connected + supported platforms (caller enforces account).
 */
export function adaptFinalCreativeForPlatform(
  upstream: UpstreamFinalCreative,
  platformRaw: string,
): PlatformAdaptationResult {
  const platform = normalizeSocialPlatform(platformRaw);
  const baseCaption = upstream.caption.trim();
  const hashtags = [...(upstream.hashtags ?? [])];
  const cta = upstream.cta ?? null;
  const accessibilityText = upstream.accessibilityText ?? null;

  let caption = baseCaption;
  switch (platform) {
    case "instagram":
      caption = baseCaption;
      break;
    case "facebook":
      caption = cta && !baseCaption.includes(cta) ? `${baseCaption}\n\n${cta}` : baseCaption;
      break;
    case "threads":
      caption = trimTo(baseCaption, 480);
      break;
    case "linkedin":
      caption = baseCaption;
      break;
    case "youtube":
      caption = cta && !baseCaption.includes(cta) ? `${baseCaption}\n\n${cta}` : baseCaption;
      break;
  }

  assertFactualClaimsPreserved(baseCaption, caption);

  return {
    platform,
    caption,
    hashtags,
    cta,
    accessibilityText,
  };
}

export function adaptForConnectedPlatforms(
  upstream: UpstreamFinalCreative,
  connectedPlatforms: readonly string[],
): PlatformAdaptationResult[] {
  const out: PlatformAdaptationResult[] = [];
  for (const raw of connectedPlatforms) {
    try {
      out.push(adaptFinalCreativeForPlatform(upstream, raw));
    } catch (err) {
      if (err instanceof SocialReleaseArtifactError && err.message === "fabricated_or_unsupported_platform") {
        continue;
      }
      throw err;
    }
  }
  return out;
}
