/**
 * Types & Contracts for the AI Website Generation Engine
 */

import type { WebsiteSpecification, VersionedSpecification, WebsiteType } from "../specification/schema.ts";
import type { WebsiteUnderstanding } from "../intelligence/schema.ts";
import type { SiteProject } from "../site-builder.ts";

export interface BusinessBrandContext {
  businessName: string;
  businessCategory?: string;
  brandAesthetic?: string;
  tagline?: string;
  industry?: string;
  businessType?: string;
  targetAudience?: string;
  brandDescription?: string;
  brandPersonality?: string[];
  uniqueSellingPoints?: string[];
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
  };
  logoUrl?: string;
  toneOfVoice?: string;
  productsOrServices?: Array<{
    name: string;
    description?: string;
    priceCents?: number;
    currency?: string;
    category?: string;
  }>;
  primaryCta?: {
    text: string;
    href: string;
  };
  location?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
}

export interface GenerateWebsiteInput {
  prompt: string;
  tenantId: string;
  projectId?: string;
  websiteType?: WebsiteType;
  brandContext?: BusinessBrandContext;
  referenceUnderstanding?: WebsiteUnderstanding;
  previousVersion?: VersionedSpecification;
  regenerationInstruction?: string;
  tier?: "LOW" | "MEDIUM" | "PREMIUM";
}

import type { DesignSystem } from "../design-system/schema.ts";
import type { AssetPlan } from "../assets/schema.ts";

export interface GenerateWebsiteOutput {
  success: boolean;
  specification: VersionedSpecification;
  siteModel: SiteProject;
  designSystem?: DesignSystem;
  assetPlan?: AssetPlan;
  version: number;
  previewUrl?: string;
  validationWarnings?: Array<{ path: string; message: string }>;
  aiMetadata?: {
    taskClass: string;
    model: string;
    tokensUsed: number;
    latencyMs: number;
  };
  error?: string;
}

