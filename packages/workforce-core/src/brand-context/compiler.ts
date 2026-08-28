import { getActiveServices, type BrandBrainContent } from "@stratxcel/brand-brain";

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
  "seo.keyword_researcher": ["audience", "product_facts", "campaign_objective"],
  "seo.serp_researcher": ["audience", "product_facts"],
  "seo.seo_writer": ["voice", "audience", "approved_claims", "product_facts", "campaign_objective"],
  "seo.onpage_optimizer": ["product_facts", "approved_claims", "voice"],
  "seo.internal_linking_specialist": ["product_facts", "audience"],
  "website.ux_architect": ["audience", "campaign_objective", "product_facts", "visual_identity"],
  "website.page_copy_specialist": ["voice", "audience", "approved_claims", "campaign_objective", "product_facts"],
  "website.landing_page_builder": ["visual_identity", "voice", "audience", "campaign_objective", "approved_claims"],
  "website.deploy_coordinator": ["campaign_objective", "product_facts"],
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
    // Single source of truth (Brand Brain Final UX + Data + Save System
    // Section 7): reads the canonical, normalized services list (the new
    // structured `services` array, with the legacy `products` array as a
    // read-only fallback for tenants who haven't re-saved yet) rather than
    // the raw `products` field directly, so SEO/website/media roles see a
    // tenant's real structured services (category, price, facts) exactly
    // like every other real consumer of Brand Brain content now does.
    const services = getActiveServices(args.brandBrain);
    content.products = services.map((s) => ({ name: s.name, description: s.shortDescription }));
    content.services = services;
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
