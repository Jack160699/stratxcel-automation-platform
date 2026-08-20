/**
 * Runtime Activation Proof & Production Provider Types
 */

export type GranularCapabilityState =
  | "CODE_READY"
  | "CONFIGURED"
  | "DEPLOYED"
  | "RUNTIME_VERIFIED"
  | "PRODUCTION_OPERATIONAL";

export type FinalRuntimeCertification =
  | "CODE_READY_RUNTIME_UNVERIFIED"
  | "CODE_READY_RUNTIME_PARTIAL"
  | "CORE_RUNTIME_VERIFIED"
  | "PRODUCTION_OPERATIONAL"
  | "BLOCKED";

export type StepAutonomyStatus =
  | "AUTOMATIC"
  | "SELF-SERVE"
  | "OWNER_SETUP"
  | "STAFF_REQUIRED"
  | "BLOCKED";

export interface CustomerJourneyStepAudit {
  step: string;
  autonomy: StepAutonomyStatus;
  description: string;
  notes?: string;
}

export interface RuntimeProviderTelemetry {
  providerId: string;
  name: string;
  envConfigured: boolean;
  authenticated: boolean;
  readVerified: boolean;
  writeVerified: boolean;
  runtimeObserved: boolean;
  status:
    | "PRODUCTION_VERIFIED"
    | "CONFIGURED_NOT_VERIFIED"
    | "ADAPTER_READY"
    | "NOT_CONFIGURED"
    | "REAUTH_REQUIRED"
    | "ERROR";
  operationalNote: string;
}

export interface RuntimeActivationReport {
  generatedAt: string;
  certification: FinalRuntimeCertification;
  deploymentDetails: {
    productionDomain: string;
    platform: string;
    deploymentStatus: string;
  };
  cronRegistration: {
    searchScheduler: {
      path: string;
      schedule: string;
      status: "REGISTERED_IN_VERCEL_JSON" | "NOT_REGISTERED";
      runtimeStatus: "CONFIGURED_PENDING_EXTERNAL_INVOCATION" | "RUNTIME_VERIFIED";
    };
    auditWorker: {
      path: string;
      schedule: string;
      status: "REGISTERED_IN_VERCEL_JSON" | "NOT_REGISTERED";
      runtimeStatus: "CONFIGURED_PENDING_EXTERNAL_INVOCATION" | "RUNTIME_VERIFIED";
    };
  };
  schedulerSecret: {
    isConfigured: boolean;
    authVerificationPassed: boolean;
  };
  providers: RuntimeProviderTelemetry[];
  zeroStaffJourneyMatrix: CustomerJourneyStepAudit[];
  summary: string;
}
