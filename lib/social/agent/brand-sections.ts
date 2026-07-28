import type { BrandProfileRow } from "../repositories/brand";

export const BRAND_SECTIONS = ["summary", "identity", "products", "audiences", "pillars", "sources", "rules", "all"] as const;
export type BrandSection = (typeof BRAND_SECTIONS)[number];

/**
 * Pure shape-selection for inspect_brand — kept separate from the Supabase
 * fetch (getBrandProfile) so this can be unit tested directly against a
 * plain object, with no owner context / database needed.
 */
export function selectBrandSection(profile: BrandProfileRow, section: BrandSection) {
  const counts = {
    products: profile.products.length,
    audiences: profile.audiences.length,
    pillars: profile.content_pillars.length,
    sources: profile.source_material.length,
    rules: profile.rules.length,
  };
  const available_sections = BRAND_SECTIONS.filter((s) => s !== "summary" && s !== "all");

  switch (section) {
    case "identity":
      return { identity: profile.identity, voice: profile.voice, visual: profile.visual };
    case "products":
      return { products: profile.products, total: counts.products };
    case "audiences":
      return { audiences: profile.audiences, total: counts.audiences };
    case "pillars":
      return { content_pillars: profile.content_pillars, total: counts.pillars };
    case "sources":
      return { source_material: profile.source_material, total: counts.sources };
    case "rules":
      return { rules: profile.rules, forbidden_claims: profile.voice.forbidden_claims, total: counts.rules };
    case "all":
      return profile;
    case "summary":
    default:
      return {
        identity: profile.identity,
        voice: { tone: profile.voice.tone, blocked_phrases: profile.voice.blocked_phrases },
        counts,
        available_sections,
      };
  }
}
