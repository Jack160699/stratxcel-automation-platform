export type ProvenanceType = "VERIFIED_PUBLIC" | "USER_CONFIRMED" | "INFERRED" | "UNKNOWN";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface EvidenceRecord<T> {
  value: T;
  sourceUrl?: string;
  sourcePage?: string;
  evidenceType?: string;
  confidence: ConfidenceLevel;
  provenance: ProvenanceType;
}

export interface DiscoveredSocialChannel {
  platform: string;
  url: string;
  handle: string;
  displayName?: string;
  confidence: ConfidenceLevel;
  provenance: ProvenanceType;
  isConfirmed?: boolean;
}

export interface CompleteBusinessIntelligence {
  websiteUrl: string;
  crawledPagesCount: number;
  sitemapPresent: boolean;
  robotsPresent: boolean;
  generatedAt: string;

  // Identity Agent
  identity: {
    businessName: EvidenceRecord<string>;
    legalName?: EvidenceRecord<string>;
    tagline?: EvidenceRecord<string>;
    description?: EvidenceRecord<string>;
    logoUrl?: EvidenceRecord<string>;
  };

  // Business Agent
  business: {
    industry: EvidenceRecord<string>;
    businessModel: EvidenceRecord<string>;
    businessStage: EvidenceRecord<string>;
    operatingLocations: EvidenceRecord<string[]>;
    services: EvidenceRecord<string[]>;
    products: EvidenceRecord<string[]>;
    primaryOffer?: EvidenceRecord<string>;
    pricingSignals: EvidenceRecord<string[]>;
  };

  // Audience Agent
  audience: {
    targetAudience: EvidenceRecord<string>;
    customerSegments: EvidenceRecord<string[]>;
    b2bOrB2c: EvidenceRecord<"B2B" | "B2C" | "HYBRID" | "UNKNOWN">;
  };

  // Brand Agent
  brand: {
    toneOfVoice: EvidenceRecord<string>;
    personality: EvidenceRecord<string>;
    valueProposition: EvidenceRecord<string>;
    differentiators: EvidenceRecord<string[]>;
  };

  // Social Agent
  social: {
    channels: DiscoveredSocialChannel[];
  };

  // Trust Agent
  trust: {
    hasReviews: boolean;
    rating?: number;
    reviewCount?: number;
    testimonials: string[];
    certifications: string[];
    privacyPolicyUrl?: string;
    termsUrl?: string;
  };

  // Conversion Agent
  conversion: {
    primaryCta?: string;
    contactMethods: string[];
    hasForms: boolean;
    hasWhatsapp: boolean;
    whatsappNumber?: string;
    phoneNumber?: string;
    emailAddress?: string;
  };

  // Tech Agent
  tech: {
    ecommercePlatform?: string;
    bookingSystem?: string;
    analytics: string[];
    pixels: string[];
    chatWidget?: string;
  };

  // Unified Derivations
  recommendedGoals: string[];
  recommendedPackage: string;
  transformation: {
    current: string[];
    target: string[];
    thirtyDayAction: string;
  };
}
