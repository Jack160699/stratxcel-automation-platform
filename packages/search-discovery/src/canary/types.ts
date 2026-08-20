/**
 * Controlled Production Canary & Real Provider Verification Types
 */

export interface CanaryTenantContext {
  tenantId: string;
  businessName: string;
  domain: string;
  industry: string;
  location: string;
  isPaid: boolean;
  planTier: "free" | "starter" | "growth" | "business";
  subscriptionStatus: "active" | "cancelled" | "expired";
}

export interface CanaryAuditExecutionResult {
  runId: string;
  tenantId: string;
  status: "COMPLETED" | "FAILED";
  sourcesCount: number;
  evidencePacketValid: boolean;
  competitorsFound: number;
  opportunitiesGenerated: number;
  lockedActionsCount: number;
  mutationsAttempted: number; // Strictly 0
  generatedAt: string;
}

export interface CanaryActionExecutionResult {
  actionId: string;
  actionType: string;
  targetUrl: string;
  status: "VERIFIED" | "FAILED" | "BLOCKED";
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  rollbackExecuted: boolean;
  rollbackSuccessful?: boolean;
  valueLedgerRecorded: boolean;
  executedAt: string;
}

export interface CanarySchedulerInvocationResult {
  tenantId: string;
  isEligible: boolean;
  planCadence: string;
  analysisRunId: string;
  modeSelected: "TAKE" | "DEFEND" | "EXPAND" | "RECOVER";
  idempotentKey: string;
  executedAt: string;
}

export interface ControlledCanaryReport {
  generatedAt: string;
  certification:
    | "PRODUCTION_VERIFIED"
    | "PRODUCTION_VERIFIED_WITH_OPTIONAL_PROVIDERS_MISSING"
    | "CONFIGURED_BUT_NOT_RUNTIME_VERIFIED"
    | "CANARY_FAILED"
    | "BLOCKED";
  canaryTenant: {
    tenantId: string;
    businessName: string;
    domain: string;
  };
  freeAudit: {
    passed: boolean;
    evidenceCount: number;
    lockedActionsCount: number;
    mutationsPrevented: boolean;
  };
  freeBypassAttempt: {
    blocked: boolean;
    statusCode: number;
    blockerCode: string;
  };
  paidExecution: {
    passed: boolean;
    actionType: string;
    liveDomVerified: boolean;
    valueLedgerDelivered: boolean;
  };
  rollbackTest: {
    passed: boolean;
    originalStateRestored: boolean;
  };
  schedulerWorkerCycle: {
    passed: boolean;
    mode: string;
    cadenceRespected: boolean;
  };
  truthfulProviderStates: {
    googleSearchConsole: string;
    googleAnalytics4: string;
    wordpressRest: string;
    stratxcelNativeCms: string;
    serpTracker: string;
    perplexityAi: string;
  };
  customerDashboardIntegrity: {
    passed: boolean;
    noStaleState: boolean;
    noFakeMetrics: boolean;
  };
  allAcceptanceCriteriaMet: boolean;
  summary: string;
}
