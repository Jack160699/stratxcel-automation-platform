/**
 * Canonical Generation Context & Metadata Schema
 *
 * Enforces unified brand data representation, canonical generation tracking,
 * and prompt versioning across all Social Autopilot generation pathways.
 */

import type { IndustryCategory } from "./industry-taxonomy.ts";
import type { AudiencePsychology, BusinessOffering } from "./business-intelligence.ts";
import type { LayoutArchetype } from "./archetype-registry.ts";
import type { ContentOpportunityType } from "./opportunity-map.ts";
import type { VisualCategory } from "./campaign-strategy-planner.ts";

export const PROMPT_VERSIONS = {
  copyGeneration: "social-autopilot-copy-v2.1",
  creativeTreatment: "creative-treatment-v2.1",
  visualDirector: "visual-director-photo-first-v2.1",
  qualityGate: "quality-gate-anti-template-v2.1",
} as const;

export interface CanonicalBrandContext {
  tenantId: string;
  businessName: string;
  industry: IndustryCategory;
  subNiche: string;
  location?: string | null;
  website?: string | null;
  phone?: string | null;
  googleBusinessProfileLinked: boolean;
  offerings: BusinessOffering[];
  primaryAudience: AudiencePsychology;
  uniqueValueProposition: string;
  keyDifferentiators: string[];
  approvedClaims: string[];
  prohibitedClaims: string[];
  brandTone: string[];
  brandColors: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  hasStoredLogo: boolean;
  logoAssetId?: string | null;
  logoUrl?: string | null;
  verifiedFacts: string[];
}

export interface CanonicalGenerationMetadata {
  generationId: string;
  tenantId: string;
  authorizationId?: string | null;
  queueItemId?: string | null;
  strategyDay: number;
  opportunityType: ContentOpportunityType;
  visualCategory: VisualCategory;
  layoutArchetype: LayoutArchetype;
  promptVersion: string;
  provider: string;
  model: string;
  qualityScore: number;
  qualityPassed: boolean;
  logoAssetId?: string | null;
  imageAssetId?: string | null;
  variantId?: string | null;
  status: "QUEUED" | "PROCESSING" | "READY" | "FAILED" | "PREPARED" | "PUBLISHED";
  failureReason?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export function buildCanonicalBrandContext(input: {
  tenantId: string;
  businessName: string;
  industry?: string | null;
  subNiche?: string | null;
  location?: string | null;
  website?: string | null;
  phone?: string | null;
  googleBusinessProfileLinked?: boolean;
  offerings?: BusinessOffering[];
  primaryAudience?: Partial<AudiencePsychology>;
  uniqueValueProposition?: string;
  keyDifferentiators?: string[];
  approvedClaims?: string[];
  prohibitedClaims?: string[];
  brandTone?: string[];
  brandColors?: { primary?: string; secondary?: string; accent?: string };
  hasStoredLogo?: boolean;
  logoAssetId?: string | null;
  logoUrl?: string | null;
  verifiedFacts?: string[];
}): CanonicalBrandContext {
  const verified = input.verifiedFacts ?? [];
  return {
    tenantId: input.tenantId,
    businessName: input.businessName.trim() || "Business",
    industry: (input.industry as IndustryCategory) || "generic",
    subNiche: input.subNiche || "general_business",
    location: input.location ?? null,
    website: input.website ?? null,
    phone: input.phone ?? null,
    googleBusinessProfileLinked: Boolean(input.googleBusinessProfileLinked),
    offerings: input.offerings?.length ? input.offerings : [{ name: `${input.businessName} Core Services` }],
    primaryAudience: {
      buyerType: input.primaryAudience?.buyerType || "Local customers seeking reliable service",
      coreDesire: input.primaryAudience?.coreDesire || "Convenient, high-quality, professional outcome",
      primaryWorries: input.primaryAudience?.primaryWorries?.length ? input.primaryAudience.primaryWorries : ["Delays", "Hidden costs", "Inconsistent quality"],
      commonObjections: input.primaryAudience?.commonObjections?.length ? input.primaryAudience.commonObjections : ["Is it worth the investment?", "Will it fit my schedule?"],
      hesitationTriggers: input.primaryAudience?.hesitationTriggers?.length ? input.primaryAudience.hesitationTriggers : ["Unclear process", "Lack of direct examples"],
      trustTriggers: input.primaryAudience?.trustTriggers?.length ? input.primaryAudience.trustTriggers : ["Clear pricing", "Verified customer outcomes", "Experienced staff"],
      frequentlyAskedQuestions: input.primaryAudience?.frequentlyAskedQuestions ?? [],
    },
    uniqueValueProposition: input.uniqueValueProposition || "Reliable, customer-focused service built on quality and clear communication.",
    keyDifferentiators: input.keyDifferentiators ?? [],
    approvedClaims: input.approvedClaims ?? [],
    prohibitedClaims: input.prohibitedClaims ?? [],
    brandTone: input.brandTone ?? ["Professional", "Warm", "Helpful"],
    brandColors: input.brandColors ?? {},
    hasStoredLogo: Boolean(input.hasStoredLogo || input.logoAssetId || input.logoUrl),
    logoAssetId: input.logoAssetId ?? null,
    logoUrl: input.logoUrl ?? null,
    verifiedFacts: verified,
  };
}
