// Run with: node --experimental-strip-types lib/agent-core/__tests__/growth-analysis-outcome.test.ts
import assert from "node:assert/strict";
import { interpretGrowthAnalysisOutcome } from "../growth-analysis-outcome.ts";

// VERIFICATION INTEGRITY regression for run_growth_analysis (autonomous-
// convergence-loop mission, section 14 -- "the agent must be able to use
// the actual engines, not only read dashboard summaries"). runSearchAnalysis
// (@stratxcel/search-discovery) never throws to its caller -- it catches
// its own errors and records a real FAILED/RETRY_WAIT search_analysis_runs
// row instead -- so this classifier, applied from day one rather than
// retrofitted after a live incident, is what keeps a non-throwing "the
// analysis run didn't actually complete" result from ever being reported
// as a bare success.

function run() {
  // Genuinely completed -- no verification note.
  assert.equal(interpretGrowthAnalysisOutcome({ run: { state: "COMPLETED" } }), null);
  assert.equal(interpretGrowthAnalysisOutcome({ duplicate: false, run: { state: "COMPLETED" } }), null);

  // Real, live-observed-class defects: a non-throwing result that did NOT
  // actually complete must never be reported as success.
  const partial = interpretGrowthAnalysisOutcome({ run: { state: "PARTIAL" } });
  assert.equal(partial?.status, "partial");

  const failed = interpretGrowthAnalysisOutcome({ run: { state: "FAILED", failure_reason: "SEARCH_OPPORTUNITY_LOOKUP_FAILED: x" } });
  assert.equal(failed?.status, "failed");
  assert.match(failed?.detail ?? "", /SEARCH_OPPORTUNITY_LOOKUP_FAILED/);

  for (const state of ["RUNNING", "RETRY_WAIT", "QUEUED"]) {
    const outcome = interpretGrowthAnalysisOutcome({ run: { state } });
    assert.equal(outcome?.status, "pending", `${state} must be pending, not silently success`);
  }

  // A duplicate call (an identical analysis already in flight) must never
  // be reported as this call having completed one.
  const duplicateInFlight = interpretGrowthAnalysisOutcome({ duplicate: true, run: { state: "RUNNING" } });
  assert.equal(duplicateInFlight?.status, "pending");

  // Pre-runSearchAnalysis failures (invalid propertyUrl, no tenant resolved,
  // rate-limited) short-circuit via the top-level outcome field, never a
  // run object at all.
  assert.equal(interpretGrowthAnalysisOutcome({ outcome: "FAILED", reason: "no_tenant_resolved" })?.status, "failed");
  assert.equal(interpretGrowthAnalysisOutcome({ outcome: "RATE_LIMITED", reason: "3 runs already started..." })?.status, "failed");

  // Additive-safety / no-crash guarantees.
  assert.equal(interpretGrowthAnalysisOutcome(null), null);
  assert.equal(interpretGrowthAnalysisOutcome({}), null);
  assert.equal(interpretGrowthAnalysisOutcome({ run: {} }), null);

  console.log("growth-analysis-outcome.test.ts (@stratxcel/agent-core lib): ALL PASS");
}

run();
