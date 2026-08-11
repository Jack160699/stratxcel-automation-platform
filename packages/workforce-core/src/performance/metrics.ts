/**
 * MetricObservation builders — refuse fabricated metrics.
 */

import type { EvidenceReference } from "../evidence/types.ts";
import type {
  BaselineReference,
  CanonicalMetricKey,
  MetricObservation,
  MetricPeriod,
  MetricSourceKind,
  MetricUnit,
} from "./types.ts";

export class MetricFabricationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricFabricationError";
  }
}

export interface CreateMetricObservationInput {
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

export function createMetricObservation(input: CreateMetricObservationInput): MetricObservation {
  if (!input.tenantId) throw new MetricFabricationError("tenant_required");
  if (!Number.isFinite(input.value)) throw new MetricFabricationError("metric_value_not_finite");
  if (!input.evidence || input.evidence.length === 0) {
    throw new MetricFabricationError("metric_requires_evidence");
  }
  if (!input.source) throw new MetricFabricationError("metric_source_required");
  if (!input.period?.startIso || !input.period?.endIso) {
    throw new MetricFabricationError("metric_period_required");
  }

  for (const ev of input.evidence) {
    const evTenant = (ev as EvidenceReference & { tenantId?: string }).tenantId;
    if (evTenant && evTenant !== input.tenantId) {
      throw new MetricFabricationError("cross_tenant_evidence_rejected");
    }
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    metric: input.metric,
    value: input.value,
    unit: input.unit,
    period: input.period,
    source: input.source,
    sourceDetail: input.sourceDetail,
    retrievedAt: input.retrievedAt,
    missionId: input.missionId,
    campaignId: input.campaignId,
    planId: input.planId,
    evidence: input.evidence,
    confidence: input.confidence,
    baselineRef: input.baselineRef,
    receiptId: input.receiptId,
  };
}

export interface MissingMetric {
  tenantId: string;
  metric: CanonicalMetricKey;
  reason: "source_unavailable" | "no_data" | "permission_required" | "not_configured" | "tracking_loss";
  source: MetricSourceKind;
  period: MetricPeriod;
  retrievedAt: string;
}

export function recordMissingMetric(args: MissingMetric): MissingMetric {
  return { ...args };
}

export function assertTenantOwnsObservation(tenantId: string, observation: MetricObservation): void {
  if (observation.tenantId !== tenantId) {
    throw new MetricFabricationError("cross_tenant_observation_rejected");
  }
}

export function filterObservationsForTenant(
  tenantId: string,
  observations: readonly MetricObservation[],
): MetricObservation[] {
  return observations.filter((o) => o.tenantId === tenantId);
}
