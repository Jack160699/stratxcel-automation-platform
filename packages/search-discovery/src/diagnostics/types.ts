/**
 * Mechanically Derived Production Readiness and Capability Certification Types
 */

export type ProviderActivationStatus =
  | "PRODUCTION_VERIFIED"
  | "CONFIGURED_NOT_VERIFIED"
  | "ADAPTER_READY"
  | "NOT_CONFIGURED"
  | "REAUTH_REQUIRED"
  | "ERROR"
  | "UNSUPPORTED"
  | "DISCOVERY_ONLY"
  | "RECOMMENDATION_ONLY"
  | "READ_ONLY"
  | "WRITE_AVAILABLE";

export type ProviderCredentialState =
  | "SET"
  | "MISSING"
  | "INVALID"
  | "EXPIRED"
  | "UNKNOWN";

export type ProviderCategory =
  | "first_party_search"
  | "serp_measurement"
  | "ai_search"
  | "cms_website"
  | "social_local"
  | "reputation_reviews"
  | "community_radar";

export interface ProviderCapabilityRecord {
  providerKey: string;
  displayName: string;
  category: ProviderCategory;
  adapterExists: boolean;
  credentialState: ProviderCredentialState;
  readAvailable: boolean;
  writeAvailable: boolean;
  tenantScoped: boolean;
  productionVerified: boolean;
  manualSetupRequired: string;
  externalApprovalRequired: string;
  status: ProviderActivationStatus;
  notes: string;
}

export type PlatformReadinessState =
  | "FULLY_OPERATIONAL"
  | "CORE_OPERATIONAL"
  | "PARTIALLY_OPERATIONAL"
  | "CONFIGURATION_REQUIRED"
  | "BLOCKED";

export type CapabilityReadinessState =
  | "OPERATIONAL"
  | "CONFIGURED_UNVERIFIED"
  | "ADAPTER_READY"
  | "DISCOVERY_ONLY"
  | "RECOMMENDATION_ONLY"
  | "NOT_CONFIGURED"
  | "BLOCKED";

export interface MultiDimensionalReadinessReport {
  generatedAt: string;
  overallStatus: PlatformReadinessState;
  overallStatusExplanation: string;
  dimensions: {
    coreSearch: {
      status: CapabilityReadinessState;
      provider: string;
      details: string;
    };
    aiSearch: {
      status: CapabilityReadinessState;
      provider: string;
      details: string;
    };
    websiteExecution: {
      status: CapabilityReadinessState;
      provider: string;
      details: string;
      writeEnabled: boolean;
    };
    wordpressExecution: {
      status: CapabilityReadinessState;
      provider: string;
      details: string;
      writeEnabled: boolean;
    };
    local: {
      status: CapabilityReadinessState;
      provider: string;
      details: string;
    };
    social: {
      status: CapabilityReadinessState;
      provider: string;
      details: string;
    };
    authority: {
      status: CapabilityReadinessState;
      details: string;
    };
    community: {
      status: CapabilityReadinessState;
      details: string;
    };
    reputation: {
      status: CapabilityReadinessState;
      details: string;
    };
  };
  counts: {
    totalProviders: number;
    productionVerifiedCount: number;
    configuredUnverifiedCount: number;
    adapterReadyCount: number;
    notConfiguredCount: number;
  };
  activeBlockers: string[];
  manualSetupItems: Array<{ provider: string; actionRequired: string }>;
  externalApprovalsRequired: Array<{ provider: string; approvalNeeded: string }>;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface ProviderHealthCheckResult {
  providerKey: string;
  displayName: string;
  status: ProviderActivationStatus;
  checkedAt: string;
  latencyMs: number;
  readOk: boolean;
  writeOk: boolean;
  scopes?: string[];
  errorMessage?: string;
  nextAction: string;
}
