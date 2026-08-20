/**
 * Deployed Production Runtime Verification & Release Gate Types
 */

export type CodeReadinessState =
  | "CODE_READY"
  | "CODE_INCOMPLETE"
  | "CODE_REGRESSIONS_PRESENT";

export type RuntimeReadinessState =
  | "RUNTIME_FULLY_VERIFIED"
  | "RUNTIME_PARTIALLY_VERIFIED"
  | "RUNTIME_CONFIGURED_PENDING_DEPLOY"
  | "RUNTIME_UNVERIFIED"
  | "RUNTIME_FAILED";

export type ReleaseGateVerdict =
  | "CODE_READY_RUNTIME_READY"
  | "CODE_READY_RUNTIME_PARTIAL"
  | "CODE_READY_RUNTIME_UNVERIFIED"
  | "BLOCKED";

export interface LiveRouteVerificationResult {
  route: string;
  method: "GET" | "POST";
  authRequired: boolean;
  expectedStatus: number;
  testedStatus: number;
  passed: boolean;
  notes?: string;
}

export interface ProductionTelemetryReport {
  productionDomain: string;
  activeEnvironment: string;
  schedulerCronStatus: "CRON_CONFIGURED" | "CRON_RUNTIME_VERIFIED" | "CRON_RUNTIME_NOT_VERIFIED";
  workerRuntimeStatus: "WORKER_CONFIGURED" | "WORKER_RUNTIME_VERIFIED" | "WORKER_CONFIGURED_NOT_RUNTIME_VERIFIED";
  routes: LiveRouteVerificationResult[];
  codeReadiness: CodeReadinessState;
  runtimeReadiness: RuntimeReadinessState;
  releaseGateVerdict: ReleaseGateVerdict;
  generatedAt: string;
}

export interface ReleaseGateReport {
  codeReadiness: CodeReadinessState;
  runtimeReadiness: RuntimeReadinessState;
  verdict: ReleaseGateVerdict;
  coreCapabilities: {
    freeAudit: "OPERATIONAL";
    freeBypassPrevention: "ENFORCED";
    paidEntitlements: "OPERATIONAL";
    nativeCmsExecution: "OPERATIONAL";
    wordpressRestExecution: "OPERATIONAL";
    liveDomVerification: "OPERATIONAL";
    automatedRollback: "OPERATIONAL";
    gscTelemetry: "OPERATIONAL";
    ga4Telemetry: "OPERATIONAL";
    schedulerCron: "CONFIGURED_IN_VERCEL_JSON";
    workers: "CONFIGURED_IN_VERCEL_JSON";
  };
  optionalEnhancements: {
    serpTracker: "ADAPTER_READY_NOT_CONFIGURED";
    perplexityAi: "ADAPTER_READY_NOT_CONFIGURED";
    whatsappReviews: "ADAPTER_READY_NOT_CONFIGURED";
  };
  summary: string;
}
