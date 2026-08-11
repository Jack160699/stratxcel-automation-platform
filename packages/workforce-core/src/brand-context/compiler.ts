import type { BrandBrainContent } from "@stratxcel/brand-brain";

export type BrandContextSliceKey =
  | "visual_identity"
  | "voice"
  | "audience"
  | "approved_claims"
  | "campaign_objective"
  | "product_facts";

export interface BrandContextSlice {
  keys: readonly BrandContextSliceKey[];
  content: BrandBrainContent;
}

const ROLE_SLICES: Record<string, readonly BrandContextSliceKey[]> = {
  "media.image_producer": ["visual_identity", "campaign_objective", "audience", "approved_claims", "product_facts"],
  "content.copywriter": ["voice", "audience", "campaign_objective", "approved_claims"],
  "research.audience_researcher": ["audience", "product_facts"],
  "quality.creative_critic": ["voice", "visual_identity", "approved_claims"],
};

export function compileBrandContextSlice(args: {
  department: string;
  role: string;
  brandBrain: BrandBrainContent;
  campaignObjective?: string;
  approvedClaims?: readonly string[];
}): BrandContextSlice {
  const sliceKeys = ROLE_SLICES[`${args.department}.${args.role}`] ?? ["voice", "audience", "campaign_objective"];
  const content: BrandBrainContent = {};

  if (sliceKeys.includes("visual_identity")) {
    content.business_name = args.brandBrain.business_name;
    content.pillars = args.brandBrain.pillars;
  }
  if (sliceKeys.includes("voice")) {
    content.tone_of_voice = args.brandBrain.tone_of_voice;
    content.rules = args.brandBrain.rules;
  }
  if (sliceKeys.includes("audience")) {
    content.target_audience = args.brandBrain.target_audience;
  }
  if (sliceKeys.includes("product_facts")) {
    content.products = args.brandBrain.products;
    content.industry = args.brandBrain.industry;
  }
  if (sliceKeys.includes("campaign_objective") && args.campaignObjective) {
    content.campaign_objective = args.campaignObjective;
  }
  if (sliceKeys.includes("approved_claims") && args.approvedClaims) {
    content.approved_claims = args.approvedClaims;
  }

  return { keys: sliceKeys, content };
}
