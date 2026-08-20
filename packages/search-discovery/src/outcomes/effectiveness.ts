import type { ActionExperimentRecord, ActionEffectivenessStats } from "./types.ts";

/**
 * Calculates empirical action effectiveness stats across historical experiments.
 * Enforces minimum sample size guardrail to avoid prematurely over-indexing on small samples.
 */
export function calculateActionEffectiveness(
  experiments: ActionExperimentRecord[],
  options?: {
    groupBy?: "actionType" | "industry" | "queryClass";
  }
): ActionEffectivenessStats[] {
  const groups: Record<string, ActionExperimentRecord[]> = {};

  for (const exp of experiments) {
    const key = options?.groupBy === "industry"
      ? exp.industry
      : options?.groupBy === "queryClass"
      ? exp.queryClass
      : exp.actionType;

    if (!groups[key]) groups[key] = [];
    groups[key].push(exp);
  }

  const results: ActionEffectivenessStats[] = [];

  for (const [key, list] of Object.entries(groups)) {
    const total = list.length;
    const matured = list.filter((e) => e.status !== "IN_WINDOW" && e.status !== "PLANNED");
    const improved = matured.filter((e) => e.status === "IMPROVED").length;
    const noEffect = matured.filter((e) => e.status === "NO_EFFECT").length;
    const negative = matured.filter((e) => e.status === "NEGATIVE_EFFECT").length;

    const sampleSizeSufficient = matured.length >= 3;
    const improvementRate = matured.length > 0 ? Math.round((improved / matured.length) * 100) : 0;
    const noEffectRate = matured.length > 0 ? Math.round((noEffect / matured.length) * 100) : 0;
    const negativeEffectRate = matured.length > 0 ? Math.round((negative / matured.length) * 100) : 0;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sampleSizeSufficient && matured.length >= 5 ? "HIGH" : sampleSizeSufficient ? "MEDIUM" : "LOW";

    results.push({
      actionType: key,
      industry: options?.groupBy === "industry" ? key : undefined,
      queryClass: options?.groupBy === "queryClass" ? (key as any) : undefined,
      totalActionsCount: total,
      verifiedRate: 100, // Pre-condition of launching experiment
      improvementRate,
      noEffectRate,
      negativeEffectRate,
      medianDaysToEffect: 28,
      confidence,
      sampleSizeSufficient,
    });
  }

  return results;
}

export function formatLearnedActionPatterns(stats: ActionEffectivenessStats[]): string[] {
  const patterns: string[] = [];

  for (const s of stats) {
    if (s.sampleSizeSufficient && s.improvementRate >= 60) {
      patterns.push(
        `${s.actionType.replace(/_/g, " ")} has produced measurable search visibility improvement in ${s.improvementRate}% of completed observation cycles (Confidence: ${s.confidence}).`
      );
    }
  }

  return patterns;
}
