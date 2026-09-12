/**
 * Employee Performance Evaluator — Workforce Performance Engine
 *
 * Computes objective performance ratings for AI workforce employees based on:
 * - Lead throughput & qualification rates
 * - Revenue influence (INR)
 * - Mission completion rate & error handling
 * - Commercial conversion efficiency
 */

import type { AgentKpi } from "./kpi-tracker.ts";

export type PerformanceTier = "TOP_PERFORMER" | "CORE_CONTRIBUTOR" | "NEEDS_OPTIMIZATION" | "UNPROVEN";

export interface PerformanceRating {
  agentId: string;
  overallScore: number; // 0 - 100
  tier: PerformanceTier;
  metrics: {
    throughputScore: number; // 0 - 100
    qualityScore: number; // 0 - 100
    commercialScore: number; // 0 - 100
    reliabilityScore: number; // 0 - 100
  };
  recommendations: string[];
}

export interface WorkforceAuditReport {
  timestamp: string;
  totalAgentsAudited: number;
  averageScore: number;
  topPerformers: string[];
  underperformers: string[];
  ratings: PerformanceRating[];
}

/**
 * Evaluates an individual agent's performance given their KPI metrics.
 */
export function evaluateAgentPerformance(kpi: AgentKpi): PerformanceRating {
  // 1. Throughput score (Leads discovered + missions completed)
  const activityVolume = kpi.leadsDiscovered + kpi.missionsCompleted * 5;
  const throughputScore = Math.min(100, Math.round((activityVolume / 50) * 100));

  // 2. Quality score (Lead qualification & deal win rate)
  const qualRate = kpi.leadsDiscovered > 0 ? kpi.leadsQualified / kpi.leadsDiscovered : 0;
  const qualityScore = Math.min(100, Math.round((qualRate * 0.6 + kpi.successRate * 0.4) * 100));

  // 3. Commercial score (Revenue influenced in INR)
  // Benchmark: 10,00,000 INR (10 Lakhs) = 100 score
  const commercialScore = Math.min(100, Math.round((kpi.revenueInfluencedCents / (1000000 * 100)) * 100));

  // 4. Reliability score
  const reliabilityScore = kpi.missionsCompleted > 0 ? Math.min(100, 75 + kpi.missionsCompleted * 5) : 50;

  // Weighted overall score
  const overallScore = Math.round(
    throughputScore * 0.25 +
    qualityScore * 0.35 +
    commercialScore * 0.30 +
    reliabilityScore * 0.10
  );

  let tier: PerformanceTier = "CORE_CONTRIBUTOR";
  const recommendations: string[] = [];

  if (overallScore >= 80) {
    tier = "TOP_PERFORMER";
    recommendations.push("Promote to lead mission coordinator or increase autonomy limits.");
  } else if (overallScore >= 50) {
    tier = "CORE_CONTRIBUTOR";
    recommendations.push("Continue active production cadence; monitor conversion rates.");
  } else if (activityVolume > 0) {
    tier = "NEEDS_OPTIMIZATION";
    recommendations.push("Review prompt instructions and verification criteria to improve lead quality.");
  } else {
    tier = "UNPROVEN";
    recommendations.push("Agent has not logged sufficient production operations yet.");
  }

  return {
    agentId: kpi.agentId,
    overallScore,
    tier,
    metrics: {
      throughputScore,
      qualityScore,
      commercialScore,
      reliabilityScore,
    },
    recommendations,
  };
}

/**
 * Conduct a full fleet audit across an array of agent KPIs.
 */
export function auditAgentFleet(kpis: AgentKpi[]): WorkforceAuditReport {
  const ratings = kpis.map(evaluateAgentPerformance);
  const totalScore = ratings.reduce((sum, r) => sum + r.overallScore, 0);
  const averageScore = ratings.length > 0 ? Math.round(totalScore / ratings.length) : 0;

  return {
    timestamp: new Date().toISOString(),
    totalAgentsAudited: ratings.length,
    averageScore,
    topPerformers: ratings.filter((r) => r.tier === "TOP_PERFORMER").map((r) => r.agentId),
    underperformers: ratings.filter((r) => r.tier === "NEEDS_OPTIMIZATION").map((r) => r.agentId),
    ratings,
  };
}
