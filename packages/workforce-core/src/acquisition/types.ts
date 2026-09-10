/**
 * Advertising + Growth acquisition contracts.
 * Planning artifacts only — never authorize production spend or ad-account billing mutation.
 */

export type PaidAcquisitionReadinessStatus =
  | "READY"
  | "PARTIAL"
  | "NOT_READY"
  | "SETUP_REQUIRED";

export type ReadinessDimensionKey =
  | "offer_clarity"
  | "landing_page"
  | "tracking"
  | "conversion_path"
  | "audience"
  | "creative_availability"
  | "account_connection"
  | "payment_spend_authority"
  | "historical_data"
  | "entitlement";

export type DimensionStrength = "none" | "weak" | "adequate" | "strong" | "unknown";

export interface ReadinessDimension {
  key: ReadinessDimensionKey;
  strength: DimensionStrength;
  status: "pass" | "partial" | "fail" | "setup_required";
  evidenceIds: readonly string[];
  notes: string;
  blocksSpend: boolean;
}

export interface PaidAcquisitionReadiness {
  tenantId: string;
  status: PaidAcquisitionReadinessStatus;
  dimensions: readonly ReadinessDimension[];
  blockingReasons: readonly string[];
  mayRecommendPaid: boolean;
  mayPlanCampaign: boolean;
  /** Always false — plan never equals spend. */
  authorizesSpend: false;
  summary: string;
  evidenceIds: readonly string[];
  assessedAtIso: string;
}

export type GrowthLever =
  | "organic"
  | "search"
  | "social"
  | "paid"
  | "conversion"
  | "crm_followup"
  | "retention";

export interface GrowthLeverSelection {
  primary: GrowthLever;
  secondary: readonly GrowthLever[];
  deferred: readonly GrowthLever[];
  paidVsOrganicReasoning: string;
  bottleneckCodes: readonly string[];
  evidenceIds: readonly string[];
  paidMandatory: false;
  recommendPaid: boolean;
}

export type AdPlatform = "meta" | "google" | "other";
export type FunnelStage = "awareness" | "consideration" | "conversion" | "retention" | "remarketing";

export type AudienceKind =
  | "first_party"
  | "retargeting"
  | "lookalike"
  | "interest_contextual"
  | "search_intent";

export interface AudienceHypothesis {
  kind: AudienceKind;
  label: string;
  eligible: boolean;
  platformSupported: boolean;
  reason: string;
  sensitiveTargetingRisk: boolean;
  evidenceIds: readonly string[];
}

export interface BudgetProposal {
  currency: "INR" | "USD" | "UNKNOWN";
  proposedMinCents: number | null;
  proposedMaxCents: number | null;
  envelopeCapCents: number | null;
  withinCommercialEnvelope: boolean;
  authorizesSpend: false;
  assumptions: readonly string[];
  evidenceIds: readonly string[];
  predictedCpcCents: null;
  predictedCpaCents: null;
  notes: string;
}

export interface CampaignPlanApprovals {
  requiresPlanApproval: true;
  requiresSpendAuthorization: true;
  requiresCreativeApproval: true;
  requiresFinanceClearance: true;
  approvedForSpend: false;
}

export interface AcquisitionMeasurementContract {
  ownerWorkstream: "measurement_engine";
  primaryMetric: string;
  secondaryMetrics: readonly string[];
  attributionWindowDays: number | null;
  requiredEventNames: readonly string[];
  feedSchemaVersion: "acquisition.v1";
  notes: string;
}

export interface CampaignPlan {
  id: string;
  tenantId: string;
  missionId: string;
  objective: string;
  businessOutcome: string;
  platform: AdPlatform;
  funnelStage: FunnelStage;
  audienceHypotheses: readonly AudienceHypothesis[];
  offer: string;
  landingDestination: string | null;
  creativeRequirements: readonly string[];
  placements: readonly string[];
  budgetProposal: BudgetProposal;
  durationDays: number | null;
  kpi: string;
  measurement: AcquisitionMeasurementContract;
  stopConditions: readonly string[];
  experimentDesignId: string | null;
  approvals: CampaignPlanApprovals;
  evidenceIds: readonly string[];
  readinessStatus: PaidAcquisitionReadinessStatus;
  authorizesSpend: false;
  authorizesPublish: false;
  createdAtIso: string;
}

export interface AdCreativeBrief {
  id: string;
  tenantId: string;
  missionId: string;
  campaignPlanId: string;
  objective: string;
  audience: string;
  offer: string;
  hook: string;
  format: "image" | "carousel" | "video" | "reel" | "search_text" | "mixed";
  variantsNeeded: number;
  platformConstraints: readonly string[];
  claimConstraints: readonly string[];
  handoffDepartment: "creative";
  evidenceIds: readonly string[];
  createdAtIso: string;
}

export interface LandingPageHandoffRequest {
  id: string;
  tenantId: string;
  missionId: string;
  campaignPlanId: string;
  reason: string;
  requiredPageType: "landing" | "offer" | "thank_you";
  conversionRequirements: readonly string[];
  handoffDepartment: "website";
  evidenceIds: readonly string[];
  createdAtIso: string;
}

export interface ExperimentPlan {
  id: string;
  tenantId: string;
  missionId: string;
  hypothesis: string;
  variable: string;
  control: string;
  variants: readonly string[];
  metric: string;
  minimumEvidenceCriterion: string;
  evaluationWindowDays: number;
  stopCondition: string;
  claimsStatisticalSignificance: false;
  evidenceIds: readonly string[];
  createdAtIso: string;
}

export type AdsPublishGateCode =
  | "tenant"
  | "account"
  | "entitlement"
  | "approval"
  | "spend_authorization"
  | "budget"
  | "kill_switch"
  | "provider_readiness"
  | "readiness"
  | "creative_ready"
  | "plan_approved";

export interface AdsPublishGateResult {
  allowed: false;
  decision: "DENIED";
  failedGates: readonly AdsPublishGateCode[];
  reasons: readonly string[];
  productionMutations: "NONE";
}

export type PaidAdsAuditVerdict =
  | "NO"
  | "NOT_YET"
  | "SETUP_REQUIRED"
  | "CONDITIONAL_YES"
  | "INSUFFICIENT_EVIDENCE";

export interface PaidAdsAuditAssessment {
  tenantId: string;
  verdict: PaidAdsAuditVerdict;
  shouldRunPaidAds: boolean;
  readiness: PaidAcquisitionReadiness;
  growthLevers: GrowthLeverSelection;
  rationale: string;
  evidenceIds: readonly string[];
  upsellDefault: false;
  assessedAtIso: string;
}

export interface PaidAcquisitionSignals {
  offerClarity?: DimensionStrength;
  landingPageStrength?: DimensionStrength;
  trackingStrength?: DimensionStrength;
  conversionPathStrength?: DimensionStrength;
  audienceDefinitionStrength?: DimensionStrength;
  creativeAvailability?: DimensionStrength;
  adAccountConnected?: boolean;
  adPlatforms?: readonly AdPlatform[];
  spendAuthorityPresent?: boolean;
  historicalAdsDataPresent?: boolean;
  metaAdCampaignEntitlement?: number;
  killSwitchEngaged?: boolean;
  evidenceIds?: readonly string[];
}

// ============================================================================
// UNIVERSAL LEAD ACQUISITION & ENRICHMENT ENGINE CONTRACTS
// ============================================================================

export type ProviderVerificationState =
  | "VERIFIED"
  | "PARTIAL"
  | "BLOCKED"
  | "UNAVAILABLE"
  | "BILLING_REQUIRED"
  | "POLICY_RESTRICTED";

export interface ProviderAvailabilityStatus {
  providerKey: string;
  providerName: string;
  category: "search" | "maps" | "directory" | "social" | "enrichment" | "government" | "website" | "catalog";
  state: ProviderVerificationState;
  accessMethod: "api" | "mcp" | "web_scraping" | "browser" | "native_catalog";
  authenticated: boolean;
  rateLimitInfo?: string;
  commercialRequirement?: string;
  policyConstraints?: string;
  verificationEvidence?: string;
  fallbackProviderKey?: string;
}

export type EvidenceConfidenceLevel = "VERIFIED" | "HIGH" | "MEDIUM" | "LOW" | "INFERRED";

export interface LeadSourceProvenance {
  sourceKey: string;
  sourceName: string;
  sourceUrl?: string;
  sourceRecordId?: string;
  discoveredAt: string;
  verificationMethod: "direct_api" | "html_scrape" | "dns_probe" | "public_registry" | "grounded_catalog" | "manual";
  confidence: EvidenceConfidenceLevel;
  confidenceScore: number; // 0.0 - 1.0
  deduplicationHash: string;
  extractedFields: string[];
  rawSnippet?: string;
}

export interface LeadEvidence {
  id: string;
  claim: string;
  field: string;
  value: unknown;
  sourceKey: string;
  sourceUrl?: string;
  confidence: EvidenceConfidenceLevel;
  recordedAt: string;
}

export interface LeadIdentity {
  companyName: string;
  normalizedCompanyName: string;
  websiteUrl: string | null;
  canonicalDomain: string | null;
  primaryPhone: string | null;
  normalizedPhone: string | null;
  allPhones: string[];
  primaryEmail: string | null;
  normalizedEmail: string | null;
  allEmails: string[];
  facilityAddress: string | null;
  city: string | null;
  stateOrRegion: string | null;
  country: string;
  socialHandles?: {
    linkedin?: string;
    instagram?: string;
    facebook?: string;
    twitter?: string;
  };
  gstin?: string;
  udyamNumber?: string;
  deduplicationHash: string;
}

export interface LeadEnrichment {
  employeeCountRange?: string;
  annualRevenueEstimatedInr?: number;
  techStack?: string[];
  subIndustry?: string;
  executiveContacts?: Array<{
    name: string;
    designation: string;
    email?: string;
    phone?: string;
    linkedinUrl?: string;
    isPrimaryDecisionMaker: boolean;
  }>;
  operationalSignals?: string[];
  ratingsScore?: number;
  reviewCount?: number;
  openingStatus?: string;
  lastEnrichedAt: string;
  enrichmentSources: string[];
}

export interface LeadQualification {
  qualificationScore: number; // 0 - 100
  icpFitTier: "TIER_1_ENTERPRISE" | "TIER_2_GROWTH" | "TIER_3_SMB" | "UNQUALIFIED";
  status: "DISCOVERED" | "ENRICHED" | "VERIFIED" | "QUALIFIED";
  signals: {
    geographyMatch: boolean;
    industryFit: boolean;
    scaleMatch: boolean;
    needOrProblemDetected: boolean;
    decisionMakerIdentified: boolean;
    contactabilityReady: boolean;
  };
  scoringBreakdown: Array<{
    factor: string;
    pointsAwarded: number;
    maxPoints: number;
    explanation: string;
  }>;
  summaryRationale: string;
  recommendedOfferCategory?: string;
  estimatedDealValueInr?: number;
}

export interface OutreachEligibility {
  isEligible: boolean;
  preferredChannel: "whatsapp" | "email" | "phone" | "manual_review";
  consentState: "EXPLICIT_CONSENT" | "LEGITIMATE_INTEREST_B2B" | "OPT_OUT" | "CONSENT_REQUIRED";
  whatsappOptInReady: boolean;
  reason: string;
  suppressionReason?: string;
}

export interface CanonicalLead {
  id: string;
  tenantId: string;
  identity: LeadIdentity;
  provenanceHistory: LeadSourceProvenance[];
  evidenceList: LeadEvidence[];
  enrichment: LeadEnrichment;
  qualification: LeadQualification;
  outreachEligibility: OutreachEligibility;
  status: "DISCOVERED" | "ENRICHED" | "VERIFIED" | "QUALIFIED" | "CONTACTED" | "RESPONDED" | "INTERESTED" | "PROPOSAL" | "WON" | "LOST";
  source: "whatsapp" | "website_form" | "manual" | "import" | "whatsapp_outreach" | "hermes_research";
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt: string;
}

export interface RawDiscoveredLead {
  companyName: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  stateOrRegion?: string;
  country?: string;
  industry?: string;
  category?: string;
  painPointOrSignal?: string;
  decisionMakerRole?: string;
  contactPersonName?: string;
  rating?: number;
  reviewCount?: number;
  sourceKey: string;
  sourceName: string;
  sourceUrl?: string;
  confidence?: EvidenceConfidenceLevel;
  rawPayload?: Record<string, unknown>;
}

export interface LeadDiscoveryQuery {
  tenantId: string;
  objectiveText: string;
  targetIndustry?: string;
  targetGeography?: string;
  targetOfferCategory?: string;
  targetQuantity?: number;
  minQualificationScore?: number;
  allowedSources?: string[];
  maxSearchDepth?: number;
}

export interface LeadSourceAdapter {
  readonly providerKey: string;
  readonly providerName: string;
  readonly sourceCategory: "search" | "maps" | "directory" | "social" | "enrichment" | "government" | "website" | "catalog";
  readonly accessMethod: "api" | "mcp" | "web_scraping" | "browser" | "native_catalog";
  readonly authenticationType: "api_key" | "oauth2" | "session" | "none";

  checkAvailability(): Promise<ProviderAvailabilityStatus>;
  discoverLeads(query: LeadDiscoveryQuery): Promise<RawDiscoveredLead[]>;
  enrichLead?(identity: LeadIdentity): Promise<Partial<LeadEnrichment>>;
}

export interface UniversalDiscoveryExecutionResult {
  missionId: string;
  tenantId: string;
  objective: string;
  targetQuantity: number;
  sourcesQueried: string[];
  sourcesSucceeded: string[];
  sourcesFailed: string[];
  rawDiscoveredCount: number;
  deduplicatedCount: number;
  verifiedCount: number;
  qualifiedCount: number;
  persistedCount: number;
  leads: CanonicalLead[];
  providerStatuses: Record<string, ProviderAvailabilityStatus>;
  executionSummary: string;
  overlapAnalysis: {
    singleSourceLeads: number;
    multiSourceLeads: number;
    topOverlappingSources: string[];
  };
  [key: string]: unknown;
}
