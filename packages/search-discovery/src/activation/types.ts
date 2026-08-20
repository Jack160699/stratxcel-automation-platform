/**
 * Final Production Activation & Optional Provider Enablement Types
 */

export type FinalCoreRuntimeCertification =
  | "CODE_READY"
  | "CORE_RUNTIME_CONFIGURED"
  | "CORE_RUNTIME_VERIFIED"
  | "CORE_RUNTIME_OPERATIONAL"
  | "CORE_RUNTIME_OPERATIONAL_WITH_OPTIONAL_PROVIDERS_MISSING"
  | "BLOCKED";

export type OptionalProviderCertification =
  | "OPTIONAL_PROVIDERS_ALL_ACTIVE"
  | "OPTIONAL_PROVIDERS_PARTIAL"
  | "OPTIONAL_PROVIDERS_NONE_ACTIVE";

export interface FinalProductionActivationReport {
  generatedAt: string;
  coreCertification: FinalCoreRuntimeCertification;
  optionalCertification: OptionalProviderCertification;
  deployment: {
    domain: string;
    platform: string;
    environment: string;
    vercelCronRegistered: boolean;
  };
  growthEngineCadence: {
    cadenceDays: 3;
    monthlyCyclesTarget: 10;
    earlyTriggerBehavior: "EXITS_IMMEDIATELY_WITH_NOT_DUE_ZERO_EXPENSIVE_CALLS";
    immediateEventDecoupled: boolean;
  };
  coreCapabilities: {
    databaseAndRls: "PRODUCTION_OPERATIONAL";
    supabaseAuth: "PRODUCTION_OPERATIONAL";
    connectedFreeAudit: "PRODUCTION_OPERATIONAL";
    freeBypassPrevention: "PRODUCTION_OPERATIONAL";
    razorpayEntitlements: "PRODUCTION_OPERATIONAL";
    stratxcelNativeCms: "PRODUCTION_OPERATIONAL";
    wordpressRestCms: "PRODUCTION_OPERATIONAL";
    liveDomVerification: "PRODUCTION_OPERATIONAL";
    automatedRollback: "PRODUCTION_OPERATIONAL";
    googleSearchConsole: "PRODUCTION_OPERATIONAL";
    googleAnalytics4: "PRODUCTION_OPERATIONAL";
  };
  optionalProviders: {
    serpTracker: "ADAPTER_READY_NOT_CONFIGURED" | "PRODUCTION_VERIFIED";
    perplexityAi: "ADAPTER_READY_NOT_CONFIGURED" | "PRODUCTION_VERIFIED";
    whatsappReviews: "ADAPTER_READY_NOT_CONFIGURED" | "PRODUCTION_VERIFIED";
    googleBusinessProfile: "ADAPTER_READY_NOT_CONFIGURED" | "PRODUCTION_VERIFIED";
  };
  zeroStaffStatus: {
    allStepsSelfServeOrAutomatic: boolean;
    manualStaffDependenciesCount: 0;
  };
  summary: string;
}
