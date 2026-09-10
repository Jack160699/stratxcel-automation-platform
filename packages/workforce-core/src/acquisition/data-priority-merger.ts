/**
 * Hierarchical Data Priority Merger
 * StratXcel Autonomous Company OS - Workforce Core
 *
 * Enforces strict information precedence:
 * Verified 1st-party > Verified business website > Official directories > Google Places/Search > Enrichment providers > Research/inference
 *
 * Never overwrites stronger verified facts with weaker enrichment.
 */

import type { CanonicalLead, EvidenceConfidenceLevel } from "./types.ts";

export type SourceTrustTier = 1 | 2 | 3 | 4 | 5 | 6;

export interface SourceTierMapping {
  tier: SourceTrustTier;
  confidence: EvidenceConfidenceLevel;
  description: string;
}

export const SOURCE_TIER_HIERARCHY: Record<string, SourceTierMapping> = {
  // Tier 1: Verified First-Party / Customer Provided
  customer_portal: { tier: 1, confidence: "VERIFIED", description: "Customer-submitted first-party data" },
  whatsapp_inbound: { tier: 1, confidence: "VERIFIED", description: "Direct customer WhatsApp conversation" },
  grounded_catalog: { tier: 1, confidence: "VERIFIED", description: "Grounded Enterprise Registry (verified state entities)" },

  // Tier 2: Verified Business Website Data
  website_crawler: { tier: 2, confidence: "HIGH", description: "Official business website first-party HTML/DNS" },
  website_metadata: { tier: 2, confidence: "HIGH", description: "Official domain meta/schema.org inspection" },

  // Tier 3: Official / Public Business Directories
  udyam: { tier: 3, confidence: "HIGH", description: "Ministry of MSME / Udyam registration portal" },
  mca_filing: { tier: 3, confidence: "HIGH", description: "Ministry of Corporate Affairs registry" },
  indiamart: { tier: 3, confidence: "MEDIUM", description: "IndiaMART verified supplier directory" },
  tradeindia: { tier: 3, confidence: "MEDIUM", description: "TradeIndia verified catalog directory" },
  justdial: { tier: 3, confidence: "MEDIUM", description: "Justdial local business listing" },

  // Tier 4: Google Places / Search
  google_places: { tier: 4, confidence: "HIGH", description: "Google Places / Maps API verified business listing" },
  google_search: { tier: 4, confidence: "MEDIUM", description: "Google Search organic SERP extraction" },

  // Tier 5: Enrichment Providers
  apollo: { tier: 5, confidence: "MEDIUM", description: "Apollo.io B2B intelligence and enrichment" },
  social_meta: { tier: 5, confidence: "LOW", description: "Meta Facebook / Instagram business profile" },
  social_linkedin: { tier: 5, confidence: "MEDIUM", description: "LinkedIn Company page" },

  // Tier 6: Research / Inference
  ai_inference: { tier: 6, confidence: "INFERRED", description: "LLM semantic extraction / heuristic matching" },
};

export function getSourceTier(sourceKey: string): SourceTierMapping {
  const normalized = sourceKey.toLowerCase();
  for (const [key, mapping] of Object.entries(SOURCE_TIER_HIERARCHY)) {
    if (normalized.includes(key)) return mapping;
  }
  return { tier: 5, confidence: "MEDIUM", description: "Generic source" };
}

/**
 * Merges incoming field values into a target canonical lead respecting data priority.
 */
export function mergeWithDataPriority(
  current: CanonicalLead,
  incoming: {
    sourceKey: string;
    companyName?: string;
    websiteUrl?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    stateOrRegion?: string;
  }
): CanonicalLead {
  const incomingTier = getSourceTier(incoming.sourceKey).tier;

  // Determine current field tiers from provenance
  const getFieldHighestTier = (field: string): number => {
    let highest = 99;
    for (const prov of current.provenanceHistory) {
      if (prov.extractedFields.includes(field)) {
        const t = getSourceTier(prov.sourceKey).tier;
        if (t < highest) highest = t;
      }
    }
    return highest;
  };

  const updatedIdentity = { ...current.identity };

  // 1. Company Name: Only overwrite if incoming is strictly higher priority (lower tier number)
  if (incoming.companyName && (!updatedIdentity.companyName || incomingTier < getFieldHighestTier("companyName"))) {
    updatedIdentity.companyName = incoming.companyName;
  }

  // 2. Website URL: Only overwrite if higher priority or currently null
  if (incoming.websiteUrl && (!updatedIdentity.websiteUrl || incomingTier < getFieldHighestTier("websiteUrl"))) {
    updatedIdentity.websiteUrl = incoming.websiteUrl;
  }

  // 3. Primary Phone: Only overwrite if higher priority or currently null
  if (incoming.phone && (!updatedIdentity.primaryPhone || incomingTier < getFieldHighestTier("phone"))) {
    updatedIdentity.primaryPhone = incoming.phone;
    updatedIdentity.normalizedPhone = incoming.phone;
  }

  // 4. Primary Email: Only overwrite if higher priority or currently null
  if (incoming.email && (!updatedIdentity.primaryEmail || incomingTier < getFieldHighestTier("email"))) {
    updatedIdentity.primaryEmail = incoming.email;
    updatedIdentity.normalizedEmail = incoming.email;
  }

  // 5. Address / City: Fill if empty or higher priority
  if (incoming.address && (!updatedIdentity.facilityAddress || incomingTier < getFieldHighestTier("address"))) {
    updatedIdentity.facilityAddress = incoming.address;
  }
  if (incoming.city && (!updatedIdentity.city || incomingTier < getFieldHighestTier("city"))) {
    updatedIdentity.city = incoming.city;
  }
  if (incoming.stateOrRegion && (!updatedIdentity.stateOrRegion || incomingTier < getFieldHighestTier("stateOrRegion"))) {
    updatedIdentity.stateOrRegion = incoming.stateOrRegion;
  }

  return {
    ...current,
    identity: updatedIdentity,
  };
}
