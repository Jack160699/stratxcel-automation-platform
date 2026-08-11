/**
 * Baseline comparisons — missing stays missing.
 */

import type { BaselineReference, MetricObservation, MetricPeriod, MetricUnit } from "./types.ts";

export function createBaselineReference(args: {
  kind: BaselineReference["kind"];
  observationId?: string;
  value?: number;
  unit?: MetricUnit;
  period?: MetricPeriod;
  missing?: boolean;
}): BaselineReference {
  if (args.missing === true) {
    return {
      kind: args.kind,
      missing: true,
      observationId: args.observationId,
      period: args.period,
    };
  }

  if (args.value === undefined || !Number.isFinite(args.value)) {
    return {
      kind: args.kind,
      missing: true,
      observationId: args.observationId,
      period: args.period,
    };
  }

  return {
    kind: args.kind,
    missing: false,
    observationId: args.observationId,
    value: args.value,
    unit: args.unit,
    period: args.period,
  };
}

export interface BaselineComparison {
  current: MetricObservation;
  baseline: BaselineReference;
  delta: number | null;
  deltaPercent: number | null;
  comparable: boolean;
}

export function compareToBaseline(
  current: MetricObservation,
  baseline: BaselineReference,
): BaselineComparison {
  if (baseline.missing || baseline.value === undefined || !Number.isFinite(baseline.value)) {
    return {
      current,
      baseline: { ...baseline, missing: true },
      delta: null,
      deltaPercent: null,
      comparable: false,
    };
  }

  const delta = current.value - baseline.value;
  const deltaPercent = baseline.value === 0 ? null : (delta / Math.abs(baseline.value)) * 100;

  return {
    current,
    baseline,
    delta,
    deltaPercent,
    comparable: true,
  };
}

export function attachBaseline(
  observation: MetricObservation,
  baseline: BaselineReference,
): MetricObservation {
  return { ...observation, baselineRef: baseline };
}
