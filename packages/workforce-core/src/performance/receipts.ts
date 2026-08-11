/**
 * Execution receipts → measurement anchors.
 */

import type { EvidenceReference } from "../evidence/types.ts";
import { createMetricObservation } from "./metrics.ts";
import type {
  CanonicalMetricKey,
  ExecutionReceipt,
  MetricObservation,
  MetricPeriod,
  MetricSourceKind,
  MetricUnit,
} from "./types.ts";

export class ReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptError";
  }
}

const DOMAIN_SOURCE: Record<ExecutionReceipt["domain"], MetricSourceKind> = {
  social: "social",
  website: "website",
  seo: "seo",
  ads: "ads",
  crm: "crm",
  whatsapp: "whatsapp",
  mission: "mission_event",
  other: "execution_receipt",
};

export function assertReceiptTenant(tenantId: string, receipt: ExecutionReceipt): void {
  if (receipt.tenantId !== tenantId) {
    throw new ReceiptError("cross_tenant_receipt_rejected");
  }
}

export interface LinkReceiptToMetricInput {
  receipt: ExecutionReceipt;
  observationId: string;
  metric: CanonicalMetricKey;
  value: number;
  unit: MetricUnit;
  period: MetricPeriod;
  evidence: readonly EvidenceReference[];
  confidence: "low" | "medium" | "high";
  retrievedAt: string;
}

export function linkReceiptToMetric(input: LinkReceiptToMetricInput): MetricObservation {
  assertReceiptTenant(input.receipt.tenantId, input.receipt);
  if (!input.receipt.evidenceIds.length && input.evidence.length === 0) {
    throw new ReceiptError("receipt_metric_requires_evidence");
  }

  const evidence =
    input.evidence.length > 0
      ? input.evidence
      : input.receipt.evidenceIds.map(
          (id): EvidenceReference => ({
            id,
            source: `receipt:${input.receipt.domain}`,
            retrievedAtIso: input.retrievedAt,
            summary: `Execution receipt ${input.receipt.id} (${input.receipt.action})`,
            supportedClaims: [input.metric],
            confidence: input.confidence,
          }),
        );

  return createMetricObservation({
    id: input.observationId,
    tenantId: input.receipt.tenantId,
    metric: input.metric,
    value: input.value,
    unit: input.unit,
    period: input.period,
    source: DOMAIN_SOURCE[input.receipt.domain],
    sourceDetail: `receipt:${input.receipt.id}`,
    retrievedAt: input.retrievedAt,
    missionId: input.receipt.missionId,
    planId: input.receipt.planId,
    evidence,
    confidence: input.confidence,
    receiptId: input.receipt.id,
  });
}

export function summarizeExecutedFromReceipts(receipts: readonly ExecutionReceipt[]): string[] {
  return receipts
    .filter((r) => r.success)
    .map((r) => `${r.domain}:${r.action}@${r.occurredAtIso}`);
}
