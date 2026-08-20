import type { AIVisibilityResult, AIVisibilityScore } from "./types.ts";

export function calculateAIVisibilityScore(
  results: AIVisibilityResult[]
): AIVisibilityScore {
  const measured = results.filter((r) => r.providerStatus === "available");

  if (measured.length === 0) {
    return {
      overallScore: null,
      mentionCoverage: null,
      citationCoverage: null,
      competitorShare: null,
      confidence: "LOW",
      dataCoveragePercentage: 0,
      unmeasuredReasons: ["Live AI search probe provider is not configured."],
    };
  }

  const totalQueries = measured.length;
  const mentionsCount = measured.filter((r) => r.brandMentioned).length;
  const citationsCount = measured.filter((r) => r.clientCited).length;

  const totalCompetitorCitations = measured.reduce(
    (acc, r) => acc + r.competitorCitations.filter((c) => c.cited).length,
    0
  );

  const mentionCoverage = Math.round((mentionsCount / totalQueries) * 100);
  const citationCoverage = Math.round((citationsCount / totalQueries) * 100);

  const totalCitationsCombined = citationsCount + totalCompetitorCitations;
  const competitorShare =
    totalCitationsCombined > 0
      ? Math.round((totalCompetitorCitations / totalCitationsCombined) * 100)
      : 0;

  // Weighted score: 40% mention coverage + 60% citation coverage
  const overallScore = Math.round(mentionCoverage * 0.4 + citationCoverage * 0.6);

  const confidence = totalQueries >= 5 ? "HIGH" : totalQueries >= 2 ? "MEDIUM" : "LOW";
  const dataCoveragePercentage = Math.min(100, Math.round((totalQueries / 5) * 100));

  return {
    overallScore,
    mentionCoverage,
    citationCoverage,
    competitorShare,
    confidence,
    dataCoveragePercentage,
  };
}
