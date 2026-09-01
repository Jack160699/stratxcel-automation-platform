/**
 * Pure, dependency-free classifier for run_growth_analysis's result --
 * kept separate from growth-media-tools.ts (whose module graph has
 * extension-less relative imports elsewhere that `node
 * --experimental-strip-types` cannot resolve standalone) so this logic can
 * be unit tested directly, same reason lib/social/agent/publish-outcome-
 * classify.ts exists as its own file.
 *
 * runSearchAnalysis (@stratxcel/search-discovery) never throws to its
 * caller -- it catches its own errors and records a real FAILED/
 * RETRY_WAIT search_analysis_runs row instead -- so a non-throwing result
 * here is not automatically a completed analysis. Same verification-
 * integrity discipline as every other interpretOutcome in this codebase,
 * applied from day one rather than retrofitted after a live incident.
 */
export function interpretGrowthAnalysisOutcome(result: unknown) {
  const r = result as { outcome?: string; reason?: string; run?: { state?: string; failure_reason?: string | null } } | null;
  if (r?.outcome && r.outcome !== "OK") return { status: "failed" as const, detail: r.reason };
  const state = r?.run?.state;
  if (!state || state === "COMPLETED") return null;
  if (state === "PARTIAL") return { status: "partial" as const, detail: "the crawl or some measurements did not fully complete -- opportunities found so far were still saved" };
  if (state === "FAILED") return { status: "failed" as const, detail: r?.run?.failure_reason ?? undefined };
  // RUNNING/RETRY_WAIT/QUEUED (including the "duplicate: true" case, where
  // an identical run was already in flight) -- genuinely still in
  // progress, not yet a result to report as done.
  return { status: "pending" as const, detail: `analysis run is ${state.toLowerCase().replaceAll("_", " ")} -- check back shortly with check_growth_status` };
}
