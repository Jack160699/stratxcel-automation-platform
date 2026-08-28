import { getActiveServices, type BrandBrainContent } from "@stratxcel/brand-brain";
import { compileBrandContextSlice } from "@stratxcel/workforce-core";
import type { CreativeBrandContext } from "../types.ts";

export function compileCreativeBrandContext(args: {
  department: string;
  role: string;
  brandBrain: BrandBrainContent;
  campaignObjective?: string;
  approvedClaims?: readonly string[];
  prohibitedClaims?: readonly string[];
}): CreativeBrandContext {
  const slice = compileBrandContextSlice({
    department: args.department,
    role: args.role,
    brandBrain: args.brandBrain,
    campaignObjective: args.campaignObjective,
    approvedClaims: args.approvedClaims,
  });

  return {
    sliceKeys: [...slice.keys],
    businessName: slice.content.business_name ?? args.brandBrain.business_name,
    toneOfVoice: slice.content.tone_of_voice ?? args.brandBrain.tone_of_voice,
    targetAudience: slice.content.target_audience ?? args.brandBrain.target_audience,
    pillars: slice.content.pillars ?? args.brandBrain.pillars,
    rules: slice.content.rules ?? args.brandBrain.rules,
    // Canonical services (Section 7) computed directly here, not just from
    // the slice, so this stays correct even for roles (e.g.
    // creative_director) whose ROLE_SLICES entry doesn't include
    // product_facts -- a tenant with only the new structured `services`
    // field must never silently fall back to an empty legacy `products`.
    products: getActiveServices(args.brandBrain).map((s) => ({ name: s.name, description: s.shortDescription })),
    approvedClaims:
      args.approvedClaims ??
      (Array.isArray(slice.content.approved_claims)
        ? (slice.content.approved_claims as string[])
        : undefined),
    prohibitedClaims: args.prohibitedClaims,
    campaignObjective:
      args.campaignObjective ??
      (typeof slice.content.campaign_objective === "string"
        ? slice.content.campaign_objective
        : undefined),
    colorHints: Array.isArray(args.brandBrain.color_hints)
      ? (args.brandBrain.color_hints as string[])
      : undefined,
  };
}

export function toCreativeDirectorBrand(brandBrain: BrandBrainContent): CreativeBrandContext {
  return compileCreativeBrandContext({
    department: "creative",
    role: "creative_director",
    brandBrain,
    campaignObjective:
      typeof brandBrain.campaign_objective === "string" ? brandBrain.campaign_objective : undefined,
    approvedClaims: Array.isArray(brandBrain.approved_claims)
      ? (brandBrain.approved_claims as string[])
      : undefined,
    prohibitedClaims: Array.isArray(brandBrain.prohibited_claims)
      ? (brandBrain.prohibited_claims as string[])
      : undefined,
  });
}
