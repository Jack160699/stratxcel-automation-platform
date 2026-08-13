import type { SourceClass } from "./provenance.ts";
import type { DiscoveredBusinessProfile } from "./adaptive-questions.ts";

export interface VerifiedReviewSummary {
  rating: number;
  count: number | null;
  sourceClass: SourceClass;
  sourceUrl?: string;
  sourceLabel: string;
}

function finiteRating(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 5) return null;
  return Math.round(numeric * 10) / 10;
}

function finiteCount(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(String(value).replace(/,/g, "")) : NaN;
  if (!Number.isFinite(numeric) || numeric < 1) return null;
  return Math.round(numeric);
}

function sourceLabelFromUrl(url?: string): string {
  if (!url) return "Public page";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (/google\./i.test(host)) return "Google";
    return host;
  } catch {
    return "Public page";
  }
}

/**
 * Reviews are shown only from verified public evidence. Missing or invented
 * ratings must never render as empty stars.
 */
export function verifiedReviewsFromProfile(profile: DiscoveredBusinessProfile | null | undefined): VerifiedReviewSummary | null {
  const field = profile?.reviews;
  if (!field || field.sourceClass !== "VERIFIED_PUBLIC") return null;
  const rating = finiteRating(field.value?.rating);
  if (rating == null) return null;
  const count = finiteCount(field.value?.count);
  return {
    rating,
    count,
    sourceClass: field.sourceClass,
    sourceUrl: field.sourceUrl,
    sourceLabel: sourceLabelFromUrl(field.sourceUrl),
  };
}

export function parseAggregateRating(node: Record<string, unknown>): { rating: number; count: number | null } | null {
  const aggregate = node.aggregateRating;
  if (!aggregate || typeof aggregate !== "object" || Array.isArray(aggregate)) return null;
  const rating = finiteRating((aggregate as Record<string, unknown>).ratingValue);
  if (rating == null) return null;
  return {
    rating,
    count: finiteCount((aggregate as Record<string, unknown>).reviewCount ?? (aggregate as Record<string, unknown>).ratingCount),
  };
}
