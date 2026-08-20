import type {
  ActionExperimentRecord,
  ActionBaselineMetrics,
  ActionOutcomeState,
  ExperimentDecision,
  AttributionConfidence,
} from "./types.ts";

export function evaluateActionExperiment(
  experiment: ActionExperimentRecord,
  currentMetrics: ActionBaselineMetrics,
  daysElapsed: number
): {
  status: ActionOutcomeState;
  decision: ExperimentDecision;
  attributionConfidence: AttributionConfidence;
  deltaMetrics: ActionExperimentRecord["deltaMetrics"];
  explanation: string;
} {
  // 1. Check if observation window has elapsed
  if (daysElapsed < experiment.observationWindowDays) {
    return {
      status: "IN_WINDOW",
      decision: "INCONCLUSIVE",
      attributionConfidence: "UNKNOWN",
      deltaMetrics: {},
      explanation: `Observation in progress (${daysElapsed}/${experiment.observationWindowDays} days elapsed). Growth outcomes require full measurement window.`,
    };
  }

  // 2. Calculate Metric Deltas
  const baseImpr = experiment.baselineMetrics.gscImpressions || 0;
  const currImpr = currentMetrics.gscImpressions || 0;
  const impressionChangePct = baseImpr > 0 ? ((currImpr - baseImpr) / baseImpr) * 100 : 0;

  const baseClicks = experiment.baselineMetrics.gscClicks || 0;
  const currClicks = currentMetrics.gscClicks || 0;
  const clickChangePct = baseClicks > 0 ? ((currClicks - baseClicks) / baseClicks) * 100 : 0;

  const basePos = experiment.baselineMetrics.gscAveragePosition || 0;
  const currPos = currentMetrics.gscAveragePosition || 0;
  const positionImprovement = basePos > 0 && currPos > 0 ? Number((basePos - currPos).toFixed(1)) : 0; // Positive means rank got better (e.g. 5.0 -> 2.0 = +3.0)

  const aiCitationGained = Boolean(!experiment.baselineMetrics.aiClientCited && currentMetrics.aiClientCited);

  const deltaMetrics = {
    impressionChangePct: Number(impressionChangePct.toFixed(1)),
    clickChangePct: Number(clickChangePct.toFixed(1)),
    positionImprovement,
    aiCitationGained,
  };

  // 3. Classify Outcome State
  let status: ActionOutcomeState = "NO_EFFECT";
  let decision: ExperimentDecision = "NOT_SUPPORTED";
  let attributionConfidence: AttributionConfidence = "MEDIUM";
  let explanation = "";

  if (impressionChangePct >= 15 || clickChangePct >= 10 || positionImprovement >= 1.5 || aiCitationGained) {
    status = "IMPROVED";
    decision = "SUPPORTED";
    attributionConfidence = "MEDIUM";
    explanation = `Measurable improvement observed: Impressions ${impressionChangePct > 0 ? "+" : ""}${deltaMetrics.impressionChangePct}%, Clicks ${clickChangePct > 0 ? "+" : ""}${deltaMetrics.clickChangePct}%, Position improvement +${positionImprovement} positions. Attribution confidence: ${attributionConfidence}.`;
  } else if (positionImprovement <= -2.0 || clickChangePct <= -20) {
    status = "NEGATIVE_EFFECT";
    decision = "NOT_SUPPORTED";
    attributionConfidence = "LOW";
    explanation = `Performance decline observed: Position shifted by ${positionImprovement} positions, clicks ${clickChangePct}%. Action flagged for review or recovery.`;
  } else {
    status = "NO_EFFECT";
    decision = "NOT_SUPPORTED";
    attributionConfidence = "LOW";
    explanation = `Metrics remained within normal historical variance (${deltaMetrics.impressionChangePct}% impressions). No statistically significant change detected.`;
  }

  return {
    status,
    decision,
    attributionConfidence,
    deltaMetrics,
    explanation,
  };
}
