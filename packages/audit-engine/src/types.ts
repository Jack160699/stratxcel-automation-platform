import type { BrandBrainContent } from "@stratxcel/brand-brain";
import type { ResearchResult } from "@stratxcel/search-discovery";

export const AUDIT_GENERATION_JOB_TYPE = "audit.generate_v1";

export type AuditOrderStatus =
  | "pending_payment"
  | "paid"
  | "in_review"
  | "completed"
  | "refunded"
  | "cancelled";

export type AuditRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "NEEDS_REVIEW"
  | "COMPLETED"
  | "STOPPED"
  | "FAILED";

export type AuditGenerationStage =
  | "QUEUED"
  | "RESEARCH"
  | "ANALYSIS"
  | "QUALITY_GATE"
  | "DELIVERY"
  | "COMPLETE"
  | "REVIEW"
  | "STOPPED";

export type AuditQualityOutcome =
  | "PASS"
  | "LOW_CONFIDENCE"
  | "INSUFFICIENT_EVIDENCE"
  | "GENERATION_FAILED"
  | "RESEARCH_FAILED";

export interface AuditOrderSnapshot {
  id: string;
  tenant_id: string;
  status: AuditOrderStatus;
  business_name: string;
  industry: string | null;
  website_url: string | null;
  social_links: unknown;
  deep_dive_answers: unknown;
  goals_answers: unknown;
  audit_fee_cents: number;
  payment_link_id: string | null;
}

export interface AuditGenerationRunSnapshot {
  id: string;
  audit_order_id: string;
  tenant_id: string;
  brand_brain_version: number;
  status: AuditRunStatus;
  stage: AuditGenerationStage;
  attempt_count: number;
  max_attempts: number;
  research_data: unknown;
  report_data: unknown;
  evidence_artifact_refs: unknown;
  ai_receipts: unknown;
  estimated_cost_usd: number;
  budget_limit_usd: number;
  quality_outcome?: AuditQualityOutcome | null;
  quality_score?: number | null;
  confidence_band?: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | null;
  failure_code?: string | null;
  failure_message_safe?: string | null;
  heartbeat_at?: string | null;
}

export interface AuditGenerationContext {
  run: AuditGenerationRunSnapshot;
  order: AuditOrderSnapshot;
  brandBrain: BrandBrainContent;
}

export interface AuditReportFinding {
  id: string;
  title: string;
  summary: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  evidenceSourceIds: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface AuditReportOpportunity {
  title: string;
  rationale: string;
  nextStep: string;
  evidenceSourceIds: string[];
}

export interface AuditScoreDimension {
  score: number | null;
  explanation: string;
  evidenceSourceIds: string[];
}

export interface LaunchPlanDetail {
  currentStage: string;
  missingItems: string[];
  buildSequence: string[];
  priorities: string[];
  recommendedPackage: string;
  needsBreakdown: Record<string, string>;
}

export interface AuditReportV1 {
  reportVersion: "automatic_audit_v1";
  reportKind?: "AUDIT" | "LAUNCH_PLAN";
  businessStage?: string;
  launchPlan?: LaunchPlanDetail;
  generatedAt: string;
  businessName: string;
  executiveSummary: string;
  /** Backward-compatible flat scores. Prefer overallHealth for explanation. */
  scores: {
    overall: number;
    digitalPresence: number | null;
    brandClarity: number | null;
    growthReadiness: number | null;
    conversionReadiness: number | null;
  };
  /** overallScore contract: 0–100 plus explanation. */
  overallHealth: { score: number; explanation: string };
  categoryScores: {
    brandPositioning: AuditScoreDimension;
    websiteConversion: AuditScoreDimension;
    discoverabilitySeo: AuditScoreDimension;
    socialContent: AuditScoreDimension;
    leadGeneration: AuditScoreDimension;
    trustReputation: AuditScoreDimension;
    customerJourney: AuditScoreDimension;
    automationOperations: AuditScoreDimension;
  };
  strengths: string[];
  growthProblems: string[];
  priorityRisks: string[];
  findings: AuditReportFinding[];
  opportunities: AuditReportOpportunity[];
  actionPlan: string[];
  quickWins30Days: string[];
  plan: {
    days30: string[];
    days60: string[];
    days90: string[];
  };
  nextActions: string[];
  ownerActions: string[];
  stratxcelSupport: Array<{ recommendation: string; capability: string; why: string }>;
  sources: Array<{
    id: string;
    url: string;
    title?: string;
    provider: string;
    retrievedAt: string;
  }>;
  /** Truthful per-connector state for this audit run — what was actually used,
   * vs. connected-but-no-data, vs. not connected, vs. failed. Never omitted;
   * never lets the UI imply a source was analyzed when it wasn't. */
  connectorAvailability: Array<{
    provider: string;
    state: "available" | "unavailable" | "not_connected" | "permission_required" | "provider_error" | "no_data";
    reason: string | null;
    retrievedAt: string | null;
    timeWindow: string | null;
  }>;
  limitations: string[];
  /** Alias of limitations for the customer-facing researchLimitations contract. */
  researchLimitations: string[];
  generation: {
    method: "automatic_audit_v1";
    brandBrainVersion: number;
  };
}

export interface AuditAIReceipt {
  step: "research" | "report_generation";
  requestId: string;
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  fallbackUsed: boolean;
  selection: Record<string, unknown>;
}

export interface AuditRunPatch {
  status?: AuditRunStatus;
  stage?: AuditGenerationStage;
  attempt_count?: number;
  research_data?: unknown;
  report_data?: unknown;
  evidence_artifact_refs?: string[];
  ai_receipts?: AuditAIReceipt[];
  quality_outcome?: AuditQualityOutcome;
  quality_score?: number;
  confidence_band?: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  estimated_cost_usd?: number;
  failure_code?: string | null;
  failure_message_safe?: string | null;
  started_at?: string;
  stage_updated_at?: string;
  review_required_at?: string;
  stopped_at?: string;
  heartbeat_at?: string;
  idempotency_key?: string | null;
}

export interface AuditGenerationStore {
  loadContext(runId: string): Promise<AuditGenerationContext>;
  updateRun(runId: string, patch: AuditRunPatch): Promise<void>;
  complete(input: {
    runId: string;
    tenantId: string;
    auditOrderId: string;
    report: AuditReportV1;
    research: ResearchResult;
    evidenceArtifactRefs: string[];
    receipts: AuditAIReceipt[];
    qualityScore: number;
  }): Promise<{ success: boolean; reason?: string; alreadyCompleted?: boolean }>;
}

export interface AuditResearchProvider {
  research(context: AuditGenerationContext, attemptNumber: number): Promise<{
    result: ResearchResult;
    receipt: AuditAIReceipt | null;
  }>;
}

export interface AuditReportProvider {
  generate(input: {
    context: AuditGenerationContext;
    research: ResearchResult;
    attemptNumber: number;
    spentUsd: number;
  }): Promise<{ report: AuditReportV1 | null; receipt: AuditAIReceipt; errorCode?: string }>;
}

export type AuditWorkerOutcome =
  | { kind: "COMPLETED" | "NEEDS_REVIEW" | "STOPPED" }
  | { kind: "RETRY"; code: string; message: string };
