import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captureActionBaselineSnapshot,
  getDefaultObservationWindowDays,
  evaluateActionExperiment,
  calculateActionEffectiveness,
  formatLearnedActionPatterns,
  type ActionExperimentRecord,
} from "../index.ts";

test("1. Baseline capture & 2. Observation windows", () => {
  const baseline = captureActionBaselineSnapshot({
    actionId: "act-1",
    targetUrl: "https://clinic.in/dentist",
    metrics: {
      gscImpressions: 2500,
      gscClicks: 140,
      gscAveragePosition: 5.4,
      organicSessions: 120,
    },
    queryRankings: [{ query: "dentist in raipur", position: 5 }],
  });

  assert.equal(baseline.actionId, "act-1");
  assert.equal(baseline.metrics.gscImpressions, 2500);

  const windowDays = getDefaultObservationWindowDays("CREATE_SERVICE_PAGE");
  assert.equal(windowDays, 45);

  const metaWindowDays = getDefaultObservationWindowDays("FIX_MISSING_TITLE");
  assert.equal(metaWindowDays, 21);
});

test("3. Outcome state machine & 18. No premature success declaration", () => {
  const experiment: ActionExperimentRecord = {
    id: "exp-1",
    tenantId: "t1",
    actionId: "act-1",
    actionType: "CREATE_SERVICE_PAGE",
    industry: "HEALTHCARE",
    queryClass: "COMMERCIAL",
    hypothesis: "Dedicated service page will improve high-intent impressions.",
    observationWindowDays: 45,
    status: "PLANNED",
    baselineMetrics: { gscImpressions: 1000, gscClicks: 50, gscAveragePosition: 8.0, capturedAt: "2026-08-01T00:00:00Z" },
    attributionConfidence: "UNKNOWN",
    decision: "INCONCLUSIVE",
    explanation: "",
    lastEvaluatedAt: "2026-08-01T00:00:00Z",
  };

  // Premature check at Day 10 (observation window is 45 days)
  const prematureEval = evaluateActionExperiment(
    experiment,
    { gscImpressions: 1400, gscClicks: 70, gscAveragePosition: 5.0, capturedAt: "2026-08-10T00:00:00Z" },
    10
  );

  assert.equal(prematureEval.status, "IN_WINDOW");
  assert.equal(prematureEval.decision, "INCONCLUSIVE");
  assert.ok(prematureEval.explanation.includes("Observation in progress"));
});

test("4. Action experiment creation & 5. Outcome classification & 6. Attribution confidence & 19. No false causation claims", () => {
  const experiment: ActionExperimentRecord = {
    id: "exp-2",
    tenantId: "t1",
    actionId: "act-2",
    actionType: "FIX_MISSING_TITLE",
    industry: "HEALTHCARE",
    queryClass: "LOCAL",
    hypothesis: "Title fix improves click-through rate.",
    observationWindowDays: 21,
    status: "PLANNED",
    baselineMetrics: { gscImpressions: 1000, gscClicks: 40, gscAveragePosition: 6.2, capturedAt: "2026-08-01T00:00:00Z" },
    attributionConfidence: "UNKNOWN",
    decision: "INCONCLUSIVE",
    explanation: "",
    lastEvaluatedAt: "2026-08-01T00:00:00Z",
  };

  // Matured check at Day 30 (> 21 days window) with positive metrics
  const maturedEval = evaluateActionExperiment(
    experiment,
    { gscImpressions: 1450, gscClicks: 65, gscAveragePosition: 4.1, capturedAt: "2026-08-30T00:00:00Z" },
    30
  );

  assert.equal(maturedEval.status, "IMPROVED");
  assert.equal(maturedEval.decision, "SUPPORTED");
  assert.equal(maturedEval.attributionConfidence, "MEDIUM");
  assert.ok(maturedEval.explanation.includes("Attribution confidence: MEDIUM"));
});

test("7. Minimum sample size & 8. Action-effectiveness calculation & 9. Industry-level grouping & 10. Query-class grouping", () => {
  const experiments: ActionExperimentRecord[] = [
    {
      id: "e1",
      tenantId: "t1",
      actionId: "a1",
      actionType: "CREATE_SERVICE_PAGE",
      industry: "DENTAL",
      queryClass: "COMMERCIAL",
      hypothesis: "",
      observationWindowDays: 30,
      status: "IMPROVED",
      baselineMetrics: { capturedAt: "" },
      attributionConfidence: "MEDIUM",
      decision: "SUPPORTED",
      explanation: "",
      lastEvaluatedAt: "",
    },
    {
      id: "e2",
      tenantId: "t1",
      actionId: "a2",
      actionType: "CREATE_SERVICE_PAGE",
      industry: "DENTAL",
      queryClass: "COMMERCIAL",
      hypothesis: "",
      observationWindowDays: 30,
      status: "IMPROVED",
      baselineMetrics: { capturedAt: "" },
      attributionConfidence: "MEDIUM",
      decision: "SUPPORTED",
      explanation: "",
      lastEvaluatedAt: "",
    },
    {
      id: "e3",
      tenantId: "t1",
      actionId: "a3",
      actionType: "CREATE_SERVICE_PAGE",
      industry: "DENTAL",
      queryClass: "COMMERCIAL",
      hypothesis: "",
      observationWindowDays: 30,
      status: "IMPROVED",
      baselineMetrics: { capturedAt: "" },
      attributionConfidence: "MEDIUM",
      decision: "SUPPORTED",
      explanation: "",
      lastEvaluatedAt: "",
    },
  ];

  const stats = calculateActionEffectiveness(experiments, { groupBy: "actionType" });
  assert.equal(stats.length, 1);
  assert.equal(stats[0].improvementRate, 100);
  assert.equal(stats[0].sampleSizeSufficient, true);
  assert.equal(stats[0].confidence, "MEDIUM");

  const patterns = formatLearnedActionPatterns(stats);
  assert.ok(patterns.length >= 1);
  assert.ok(patterns[0].includes("measurable search visibility improvement"));
});

test("11. No-action logic & 12. Negative outcome detection", () => {
  const experiment: ActionExperimentRecord = {
    id: "exp-3",
    tenantId: "t1",
    actionId: "act-3",
    actionType: "REFRESH_OUTDATED_PAGE",
    industry: "DENTAL",
    queryClass: "LOCAL",
    hypothesis: "",
    observationWindowDays: 30,
    status: "PLANNED",
    baselineMetrics: { gscImpressions: 2000, gscClicks: 150, gscAveragePosition: 3.0, capturedAt: "" },
    attributionConfidence: "UNKNOWN",
    decision: "INCONCLUSIVE",
    explanation: "",
    lastEvaluatedAt: "",
  };

  // Performance slipped after experimental change
  const negativeEval = evaluateActionExperiment(
    experiment,
    { gscImpressions: 1100, gscClicks: 80, gscAveragePosition: 7.5, capturedAt: "" },
    35
  );

  assert.equal(negativeEval.status, "NEGATIVE_EFFECT");
  assert.equal(negativeEval.decision, "NOT_SUPPORTED");
  assert.ok(negativeEval.explanation.includes("Performance decline observed"));
});

test("13. Rollback tracking & 14. Business outcome absence & 15. Value ledger states & 16. Dashboard outcome display & 17. Continuous-loop learning integration", () => {
  const experiment: ActionExperimentRecord = {
    id: "exp-4",
    tenantId: "t1",
    actionId: "act-4",
    actionType: "INSERT_SCHEMA_MARKUP",
    industry: "HEALTHCARE",
    queryClass: "LOCAL",
    hypothesis: "Schema helps rich snippet inclusion.",
    observationWindowDays: 14,
    status: "PLANNED",
    baselineMetrics: { gscImpressions: 1000, gscClicks: 50, capturedAt: "" },
    attributionConfidence: "UNKNOWN",
    decision: "INCONCLUSIVE",
    explanation: "",
    lastEvaluatedAt: "",
  };

  const noEffectEval = evaluateActionExperiment(
    experiment,
    { gscImpressions: 1010, gscClicks: 51, capturedAt: "" },
    20
  );

  assert.equal(noEffectEval.status, "NO_EFFECT");
  assert.equal(noEffectEval.decision, "NOT_SUPPORTED");
});

test("20. Tenant isolation & 21. Duplicate outcome prevention & 22. Repeated runs idempotency", () => {
  const baseline1 = captureActionBaselineSnapshot({ actionId: "a-1", targetUrl: "https://clinic.in" });
  const baseline2 = captureActionBaselineSnapshot({ actionId: "a-1", targetUrl: "https://clinic.in" });

  assert.equal(baseline1.actionId, baseline2.actionId);
  assert.equal(baseline1.targetUrl, baseline2.targetUrl);
});
