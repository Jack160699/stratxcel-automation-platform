/**
 * Real measured-outcome derivation for the Learning loop (engine:learning_loop).
 * Closes the specific, precise blocker Update 56 recorded: "no real
 * measured-outcome capture pipeline feeds MeasuredPerformanceSignal data."
 *
 * Deliberately narrow and honest about what it does NOT do: this computes
 * real observed metric deltas from search_measurement_snapshots (the same
 * real GA4/Search Console data check_growth_status already surfaces,
 * captured by resolveGoogleProviderStates on every real run_growth_analysis
 * run) -- it does NOT attempt attribution (which real bottleneck caused
 * which change), does NOT compute a confidence-scored
 * OptimizationRecommendation, and does NOT auto-decide what a plan's patch
 * should be. Those require real causal judgment this module has no
 * principled, non-fabricated way to automate yet (packages/workforce-core's
 * own OptimizationRecommendation/AttributionLink types exist for that, but
 * building a real, evidence-based classifier for THEM is a distinct, larger
 * task -- see the honest capability_registry note this ships alongside).
 * What this DOES give a human (or the model reasoning on their behalf,
 * confirm-gated before any write): real numbers, a real source, and an
 * explicit "no baseline available yet" signal rather than ever inventing
 * one -- matching packages/workforce-core/src/performance/types.ts's own
 * "Do not invent values when sources are missing -- omit the observation."
 * discipline.
 */

export interface PlanOutcomeObservation {
  /** CanonicalMetricKey values from packages/workforce-core -- kept as a
   *  plain string here so this module stays free of a workforce-core
   *  import (matches business-growth-input.ts's own "supabase: unknown"
   *  looseness for standalone testability). */
  metric: string;
  source: "ga4" | "search_console";
  unit: "count";
  current: { value: number; snapshotId: string; capturedAt: string };
  baseline: { missing: true } | { missing: false; value: number; snapshotId: string; capturedAt: string; changePercent: number | null };
}

interface SnapshotRow {
  id: string;
  source: string;
  values: unknown;
  captured_at: string;
}

type MinimalSupabase = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): { order(column: string, opts: { ascending: boolean }): Promise<{ data: SnapshotRow[] | null; error: { message: string } | null }> };
      };
    };
  };
};

function sumGa4(values: unknown): { website_sessions: number; key_events: number } | null {
  if (!values || typeof values !== "object") return null;
  const landingPages = (values as { landingPages?: unknown }).landingPages;
  if (!Array.isArray(landingPages)) return null;
  let sessions = 0;
  let events = 0;
  for (const row of landingPages) {
    if (!row || typeof row !== "object") continue;
    const r = row as { organicVisits?: number; conversions?: number };
    if (typeof r.organicVisits === "number") sessions += r.organicVisits;
    if (typeof r.conversions === "number") events += r.conversions;
  }
  return { website_sessions: sessions, key_events: events };
}

function sumGsc(values: unknown): { search_clicks: number; organic_impressions: number } | null {
  if (!values || typeof values !== "object") return null;
  const rows = (values as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return null;
  let clicks = 0;
  let impressions = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as { clicks?: number; impressions?: number };
    if (typeof r.clicks === "number") clicks += r.clicks;
    if (typeof r.impressions === "number") impressions += r.impressions;
  }
  return { search_clicks: clicks, organic_impressions: impressions };
}

function pctChange(from: number, to: number): number | null {
  if (from === 0) return null; // avoid a fabricated/undefined "infinite%" swing
  return Math.round(((to - from) / from) * 1000) / 10;
}

/**
 * Real observations since a plan was committed. Compares the LATEST
 * snapshot captured at/after the plan's createdAtIso ("current") against
 * the latest snapshot captured strictly BEFORE it ("baseline") -- never
 * invents a baseline when none exists. Returns an empty array (not an
 * error) when no snapshot has been captured since the plan was committed --
 * "nothing measurable has happened yet" is itself a real, honest answer.
 */
export async function computePlanOutcomeObservations(
  supabase: unknown,
  tenantId: string,
  planCreatedAtIso: string,
): Promise<PlanOutcomeObservation[]> {
  const client = supabase as MinimalSupabase;
  // "connected" -- NOT "available" -- is the real value the write path uses
  // for a successful GA4/Search Console capture (runtime.ts's
  // saveMeasurementSnapshot call: availabilityState: provider.state, and
  // resolveGoogleProviderStates only ever sets state: "connected" on a real
  // successful read). Confirmed directly against the live availability_state
  // CHECK constraint before shipping -- "available" isn't even a legal value
  // for this column (connected|not_connected|permission_required|
  // configuration_required|waiting_for_data|error), so filtering on it
  // would have silently matched zero rows forever.
  const { data, error } = await client
    .from("search_measurement_snapshots")
    .select("id, source, values, captured_at")
    .eq("tenant_id", tenantId)
    .eq("availability_state", "connected")
    .order("captured_at", { ascending: true });
  if (error) throw new Error(`PLAN_OUTCOME_SNAPSHOT_READ_FAILED: ${error.message}`);
  const rows = data ?? [];

  const observations: PlanOutcomeObservation[] = [];

  for (const source of ["ga4", "search_console"] as const) {
    const forSource = rows.filter((r) => r.source === source);
    const before = forSource.filter((r) => r.captured_at < planCreatedAtIso);
    const since = forSource.filter((r) => r.captured_at >= planCreatedAtIso);
    if (since.length === 0) continue; // nothing measurable yet for this source

    const currentRow = since[since.length - 1]!;
    const baselineRow = before.length > 0 ? before[before.length - 1]! : null;

    const currentSums = source === "ga4" ? sumGa4(currentRow.values) : sumGsc(currentRow.values);
    if (!currentSums) continue; // real row, but not the expected shape -- omit rather than guess

    const baselineSums = baselineRow ? (source === "ga4" ? sumGa4(baselineRow.values) : sumGsc(baselineRow.values)) : null;

    for (const [metric, value] of Object.entries(currentSums)) {
      const baselineValue = baselineSums ? (baselineSums as Record<string, number>)[metric] : undefined;
      observations.push({
        metric,
        source,
        unit: "count",
        current: { value, snapshotId: currentRow.id, capturedAt: currentRow.captured_at },
        baseline:
          baselineRow && typeof baselineValue === "number"
            ? { missing: false, value: baselineValue, snapshotId: baselineRow.id, capturedAt: baselineRow.captured_at, changePercent: pctChange(baselineValue, value) }
            : { missing: true },
      });
    }
  }

  return observations;
}
