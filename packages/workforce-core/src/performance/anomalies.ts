/**
 * Anomaly detection — evidence-backed, sample-size aware.
 */

import type { AnomalyFlag, AnomalyKind, MetricObservation } from "./types.ts";

const MIN_SAMPLE = {
  traffic: 50,
  leads: 5,
  publishing: 3,
} as const;

export interface DetectAnomaliesInput {
  tenantId: string;
  observations: readonly MetricObservation[];
  priorObservations?: readonly MetricObservation[];
  integrationFlags?: readonly {
    source: string;
    kind: "zero_data_integration" | "tracking_loss";
    evidenceId: string;
  }[];
  nowIso: string;
}

function findMetric(obs: readonly MetricObservation[], metric: string): MetricObservation | undefined {
  return obs.find((o) => o.metric === metric && Number.isFinite(o.value));
}

function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export function detectAnomalies(input: DetectAnomaliesInput): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  const prior = input.priorObservations ?? [];
  let seq = 0;
  const id = (kind: AnomalyKind) => `anomaly-${input.tenantId}-${kind}-${++seq}`;

  const traffic =
    findMetric(input.observations, "website_sessions") ?? findMetric(input.observations, "qualified_traffic");
  const priorTraffic = findMetric(prior, "website_sessions") ?? findMetric(prior, "qualified_traffic");
  if (traffic && priorTraffic) {
    const change = pctChange(traffic.value, priorTraffic.value);
    const adequate = priorTraffic.value >= MIN_SAMPLE.traffic;
    if (change !== null && change <= -40) {
      flags.push({
        id: id("sudden_traffic_drop"),
        tenantId: input.tenantId,
        kind: "sudden_traffic_drop",
        metric: traffic.metric,
        severity: adequate ? "high" : "low",
        evidenceIds: traffic.evidence.map((e) => e.id),
        observationIds: [traffic.id, priorTraffic.id],
        summary: adequate
          ? `Traffic dropped ${Math.abs(Math.round(change))}% vs prior period`
          : `Traffic drop signal present but sample size insufficient for high severity`,
        sampleSizeAdequate: adequate,
        detectedAtIso: input.nowIso,
      });
    }
  }

  const leads = findMetric(input.observations, "leads");
  const priorLeads = findMetric(prior, "leads");
  if (leads && priorLeads) {
    const change = pctChange(leads.value, priorLeads.value);
    const adequate = priorLeads.value >= MIN_SAMPLE.leads;
    if (change !== null && change >= 100) {
      flags.push({
        id: id("lead_volume_spike"),
        tenantId: input.tenantId,
        kind: "lead_volume_spike",
        metric: "leads",
        severity: adequate ? "medium" : "low",
        evidenceIds: leads.evidence.map((e) => e.id),
        observationIds: [leads.id, priorLeads.id],
        summary: `Lead volume spiked ${Math.round(change)}%`,
        sampleSizeAdequate: adequate,
        detectedAtIso: input.nowIso,
      });
    }
    if (change !== null && change <= -50) {
      flags.push({
        id: id("lead_volume_drop"),
        tenantId: input.tenantId,
        kind: "lead_volume_drop",
        metric: "leads",
        severity: adequate ? "high" : "low",
        evidenceIds: leads.evidence.map((e) => e.id),
        observationIds: [leads.id, priorLeads.id],
        summary: `Lead volume dropped ${Math.abs(Math.round(change))}%`,
        sampleSizeAdequate: adequate,
        detectedAtIso: input.nowIso,
      });
    }
  }

  const rt = findMetric(input.observations, "response_time_hours");
  const priorRt = findMetric(prior, "response_time_hours");
  if (rt && priorRt && priorRt.value > 0) {
    const change = pctChange(rt.value, priorRt.value);
    if (change !== null && change >= 50) {
      flags.push({
        id: id("response_time_increase"),
        tenantId: input.tenantId,
        kind: "response_time_increase",
        metric: "response_time_hours",
        severity: rt.value >= 24 ? "high" : "medium",
        evidenceIds: rt.evidence.map((e) => e.id),
        observationIds: [rt.id, priorRt.id],
        summary: `Response time increased ${Math.round(change)}%`,
        sampleSizeAdequate: true,
        detectedAtIso: input.nowIso,
      });
    }
  }

  const failures = findMetric(input.observations, "publishing_failures");
  if (failures && failures.value >= MIN_SAMPLE.publishing) {
    flags.push({
      id: id("publishing_failures"),
      tenantId: input.tenantId,
      kind: "publishing_failures",
      metric: "publishing_failures",
      severity: failures.value >= 10 ? "high" : "medium",
      evidenceIds: failures.evidence.map((e) => e.id),
      observationIds: [failures.id],
      summary: `${failures.value} publishing failures observed`,
      sampleSizeAdequate: true,
      detectedAtIso: input.nowIso,
    });
  }

  for (const flag of input.integrationFlags ?? []) {
    flags.push({
      id: id(flag.kind),
      tenantId: input.tenantId,
      kind: flag.kind,
      severity: "high",
      evidenceIds: [flag.evidenceId],
      observationIds: [],
      summary: `${flag.kind} for source ${flag.source}`,
      sampleSizeAdequate: true,
      detectedAtIso: input.nowIso,
    });
  }

  return flags.filter((f) => f.tenantId === input.tenantId);
}
