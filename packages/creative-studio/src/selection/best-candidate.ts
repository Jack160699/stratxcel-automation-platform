import type { ImageCandidate, ImageCandidateScores } from "../types.ts";
import { scoreOverall } from "../image/quality.ts";

const DEFAULT_WEIGHTS: Partial<Record<keyof ImageCandidateScores, number>> = {
  productFidelity: 1.5,
  brandFit: 1.3,
  composition: 1.1,
  realism: 1,
  visualHierarchy: 1,
  platformCropSafety: 0.9,
  originality: 0.7,
};

function weightedScore(
  candidate: ImageCandidate,
  weights: Partial<Record<keyof ImageCandidateScores, number>>,
): number {
  if (!candidate.scores) return candidate.overallScore ?? 0;
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights) as [keyof ImageCandidateScores, number][]) {
    total += (candidate.scores[key] ?? 0) * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return scoreOverall(candidate.scores);
  return total / weightSum;
}

export function compareCandidates(
  a: ImageCandidate,
  b: ImageCandidate,
  weights: Partial<Record<keyof ImageCandidateScores, number>> = DEFAULT_WEIGHTS,
): number {
  return weightedScore(a, weights) - weightedScore(b, weights);
}

export function selectBestImageCandidate(
  candidates: readonly ImageCandidate[],
  weights: Partial<Record<keyof ImageCandidateScores, number>> = DEFAULT_WEIGHTS,
): ImageCandidate | undefined {
  const eligible = candidates.filter(
    (c) => c.status !== "rejected" && c.status !== "blocked" && c.fidelityPass !== false,
  );
  if (eligible.length === 0) return undefined;
  return eligible.reduce((best, current) =>
    compareCandidates(current, best, weights) > 0 ? current : best,
  );
}
