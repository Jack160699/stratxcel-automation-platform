/**
 * Audience-tailored reports — outcomes over chart dumps; no secrets.
 */

import type {
  AdminPerformanceReport,
  AnomalyFlag,
  CostObservation,
  CustomerPerformanceReport,
  MetricObservation,
  MetricPeriod,
  UsageAccountingRow,
} from "./types.ts";

const SECRET_PATTERNS = [/api[_-]?key/i, /secret/i, /token/i, /password/i, /bearer\s/i];

export function stripSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}

export interface BuildCustomerReportInput {
  tenantId: string;
  planId?: string;
  period: MetricPeriod;
  businessOutcomes: readonly string[];
  workCompleted: readonly string[];
  nextPriorities: readonly string[];
  observations: readonly MetricObservation[];
}

export function buildCustomerPerformanceReport(input: BuildCustomerReportInput): CustomerPerformanceReport {
  for (const o of input.observations) {
    if (o.tenantId !== input.tenantId) throw new Error("cross_tenant_observation_rejected");
  }

  return {
    tenantId: input.tenantId,
    planId: input.planId,
    period: input.period,
    businessOutcomes: input.businessOutcomes.map(stripSecrets),
    workCompleted: input.workCompleted.map(stripSecrets),
    nextPriorities: input.nextPriorities.map(stripSecrets),
    observationIds: input.observations.map((o) => o.id),
    evidenceIds: [...new Set(input.observations.flatMap((o) => o.evidence.map((e) => e.id)))],
    audience: "customer",
  };
}

export interface BuildAdminReportInput {
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
  observations: readonly MetricObservation[];
}

export function buildAdminPerformanceReport(input: BuildAdminReportInput): AdminPerformanceReport {
  for (const o of input.observations) {
    if (o.tenantId !== input.tenantId) throw new Error("cross_tenant_observation_rejected");
  }
  for (const c of input.costDetails) {
    if (c.tenantId !== input.tenantId) throw new Error("cross_tenant_cost_rejected");
  }

  const sanitizedDepartments: Record<string, string[]> = {};
  for (const [dept, items] of Object.entries(input.departmentBreakdown)) {
    sanitizedDepartments[dept] = items.map(stripSecrets);
  }

  return {
    tenantId: input.tenantId,
    planId: input.planId,
    period: input.period,
    businessOutcomes: input.businessOutcomes.map(stripSecrets),
    workCompleted: input.workCompleted.map(stripSecrets),
    nextPriorities: input.nextPriorities.map(stripSecrets),
    executionDetails: input.executionDetails.map(stripSecrets),
    costDetails: input.costDetails,
    errorsAndAnomalies: input.errorsAndAnomalies,
    departmentBreakdown: sanitizedDepartments,
    usage: input.usage,
    observationIds: input.observations.map((o) => o.id),
    evidenceIds: [...new Set(input.observations.flatMap((o) => o.evidence.map((e) => e.id)))],
    audience: "admin",
  };
}
