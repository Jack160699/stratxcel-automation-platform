/**
 * Performance Intelligence — canonical measurement & learning types.
 * Measured signals only. No fabricated metrics. Unknown stays unknown.
 */

import type { EvidenceReference } from "../evidence/types.ts";

export type CanonicalMetricKey =
  | "qualified_traffic"
  | "organic_impressions"
  | "search_clicks"
  | "inquiry_rate"
  | "leads"
  | "response_time_hours"
  | "qualification_rate"
  | "meetings"
  | "proposals"
  | "close_rate"
  | "social_reach"
  | "social_engagement"
  | "ad_impressions"
  | "ad_clicks"
  | "ad_spend"
  | "content_performance"
  | "revenue"
  | "publishing_failures"
  | "website_sessions"
  | "key_events"
  | string;

export type MetricUnit =
  | "count"
  | "rate"
  | "hours"
  | "currency"
  | "percent"
  | "score"
  | "unknown";

export type MetricSourceKind =
  | "ga4"
  | "gsc"
  | "social"
  | "crm"
  | "ads"
  | "whatsapp"
  | "website"
  | "seo"
  | "billing"
  | "mission_event"
  | "execution_receipt"
  | "other";

export type PeriodGranularity = "day" | "week" | "month" | "custom";

export interface MetricPeriod {
  granularity: PeriodGranularity;
  startIso: string;
  endIso: string;
  label?: string;
}

/**
 * Canonical measured observation. Must cite provenance.
 * Do not invent values when sources are missing — omit the observation.
 */
export interface MetricObservation {
  id: string;
  tenantId: string;
  metric: CanonicalMetricKey;
  value: number;
  unit: MetricUnit;
  period: MetricPeriod;
  source: MetricSourceKind;
  sourceDetail?: string;
  retrievedAt: string;
  missionId?: string;
  campaignId?: string;
  planId?: string;
  evidence: readonly EvidenceReference[];
  confidence: "low" | "medium" | "high";
  baselineRef?: BaselineReference;
  receiptId?: string;
}

export interface BaselineReference {
  kind: "pre_execution" | "previous_period" | "target" | "custom";
  observationId?: string;
  value?: number;
  unit?: MetricUnit;
  period?: MetricPeriod;
  /** When true, the baseline was explicitly unavailable — do not invent. */
  missing: boolean;
}

export type AttributionConfidence = "DIRECT" | "LIKELY" | "ASSISTED" | "UNKNOWN";

export interface AttributionLink {
  id: string;
  tenantId: string;
  causeRef: string;
  effectObservationId: string;
  confidence: AttributionConfidence;
  evidenceIds: readonly string[];
  rationale: string;
  createdAtIso: string;
}

export type ReceiptDomain =
  | "social"
  | "website"
  | "seo"
  | "ads"
  | "crm"
  | "whatsapp"
  | "mission"
  | "other";

export interface ExecutionReceipt {
  id: string;
  tenantId: string;
  missionId?: string;
  planId?: string;
  domain: ReceiptDomain;
  action: string;
  occurredAtIso: string;
  success: boolean;
  externalRefs?: Readonly<Record<string, string>>;
  evidenceIds: readonly string[];
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export type BusinessContextKind =
  | "audit_only"
  | "new_business"
  | "existing_business"
  | "active_package"
  | "seo_focused"
  | "social_focused"
  | "crm_conversion"
  | "paid_acquisition"
  | "mixed";

export interface KpiSelection {
  tenantId: string;
  context: BusinessContextKind;
  primaryKpis: readonly CanonicalMetricKey[];
  secondaryKpis: readonly CanonicalMetricKey[];
  rationale: string;
}

export type AnomalyKind =
  | "sudden_traffic_drop"
  | "lead_volume_spike"
  | "lead_volume_drop"
  | "response_time_increase"
  | "publishing_failures"
  | "zero_data_integration"
  | "tracking_loss";

export interface AnomalyFlag {
  id: string;
  tenantId: string;
  kind: AnomalyKind;
  metric?: CanonicalMetricKey;
  severity: "low" | "medium" | "high";
  evidenceIds: readonly string[];
  observationIds: readonly string[];
  summary: string;
  sampleSizeAdequate: boolean;
  detectedAtIso: string;
}

export type OptimizationAction =
  | "CONTINUE"
  | "SCALE"
  | "REDUCE"
  | "PAUSE"
  | "REVISE"
  | "RESEARCH_MORE"
  | "CHANGE_SEQUENCE";

/** NEVER mutates spend, publish, or external systems by itself. */
export interface OptimizationRecommendation {
  id: string;
  tenantId: string;
  planId: string;
  missionId?: string;
  action: OptimizationAction;
  target: string;
  rationale: string;
  evidenceIds: readonly string[];
  observationIds: readonly string[];
  attributionIds: readonly string[];
  anomalyIds: readonly string[];
  shouldRevisePlan: boolean;
  mutatesExternalSystems: false;
  createdAtIso: string;
  confidence: "low" | "medium" | "high";
}

export interface WeeklyPerformanceReview {
  id: string;
  tenantId: string;
  planId?: string;
  missionId?: string;
  weekStartIso: string;
  weekEndIso: string;
  whatExecuted: readonly string[];
  whatWorked: readonly string[];
  whatUnderperformed: readonly string[];
  evidenceIds: readonly string[];
  observationIds: readonly string[];
  anomalies: readonly AnomalyFlag[];
  blockers: readonly string[];
  recommendation: OptimizationRecommendation | null;
  shouldChangePlan: boolean;
  audience: "customer" | "admin";
  createdAtIso: string;
}

export interface MonthlyGrowthReview {
  id: string;
  tenantId: string;
  planId: string;
  missionId?: string;
  monthStartIso: string;
  monthEndIso: string;
  originalDiagnosis: string;
  originalPriorities: readonly string[];
  executedWork: readonly string[];
  results: readonly string[];
  changedBottlenecks: readonly string[];
  strongestGains: readonly string[];
  failures: readonly string[];
  unusedEntitlements: readonly UsageAccountingRow[];
  nextMonthRecommendation: OptimizationRecommendation | null;
  evidenceIds: readonly string[];
  observationIds: readonly string[];
  audience: "customer" | "admin";
  createdAtIso: string;
}

export interface UsageAccountingRow {
  metric: string;
  included: number;
  used: number;
  remaining: number;
  blocked: boolean;
  source: "billing_usage_entitlements";
}

export interface CostObservation {
  id: string;
  tenantId: string;
  provider?: string;
  amount: number | null;
  currency?: string;
  unknown: boolean;
  period: MetricPeriod;
  evidenceIds: readonly string[];
  retrievedAt: string;
}

export interface CustomerPerformanceReport {
  tenantId: string;
  planId?: string;
  period: MetricPeriod;
  businessOutcomes: readonly string[];
  workCompleted: readonly string[];
  nextPriorities: readonly string[];
  observationIds: readonly string[];
  evidenceIds: readonly string[];
  audience: "customer";
}

export interface AdminPerformanceReport {
  tenantId: string;
  planId?: string;
  period: MetricPeriod;
  businessOutcomes: readonly string[];
  workCompleted: readonly string[];
  nextPriorities: readonly string[];
  executionDetails: readonly string[];
  costDetails: readonly CostObservation[];
  errorsAndAnomalies: readonly AnomalyFlag[];
  departmentBreakdown: Readonly<Record<string, readonly string[]>>;
  usage: readonly UsageAccountingRow[];
  observationIds: readonly string[];
  evidenceIds: readonly string[];
  audience: "admin";
}

export interface PlanRevisionRecord {
  planId: string;
  tenantId: string;
  fromVersion: number;
  toVersion: number;
  previousPlanArtifactId: string;
  revisionReason: string;
  evidenceIds: readonly string[];
  recommendationId?: string;
  preservedCommercialContext: true;
  createdAtIso: string;
}
