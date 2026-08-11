import type { ImageCandidate, ImageCandidateScores } from "../types.ts";

const WEIGHTS: Record<keyof ImageCandidateScores, number> = {
  composition: 1,
  productFidelity: 1.4,
  anatomy: 1.1,
  brandFit: 1.3,
  lighting: 0.9,
  realism: 1,
  visualHierarchy: 1,
  textLogoContamination: 1.2,
  unwantedArtifacts: 1.2,
  platformCropSafety: 1,
  originality: 0.8,
};

export function scoreOverall(scores: ImageCandidateScores): number {
  let total = 0;
  let weightSum = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof ImageCandidateScores)[]) {
    total += scores[key] * WEIGHTS[key];
    weightSum += WEIGHTS[key];
  }
  return Math.round((total / weightSum) * 100) / 100;
}

export function evaluateImageCandidate(
  candidate: ImageCandidate,
  scoreOverrides?: Partial<ImageCandidateScores>,
): ImageCandidateScores {
  return {
    composition: 78,
    productFidelity: candidate.fidelityPass === false ? 40 : 82,
    anatomy: 80,
    brandFit: 80,
    lighting: 76,
    realism: 78,
    visualHierarchy: 79,
    textLogoContamination: 85,
    unwantedArtifacts: 84,
    platformCropSafety: 82,
    originality: 74,
    ...scoreOverrides,
  };
}

export function applyImageEvaluation(
  candidate: ImageCandidate,
  scoreOverrides?: Partial<ImageCandidateScores>,
): ImageCandidate {
  const scores = evaluateImageCandidate(candidate, scoreOverrides);
  const overallScore = scoreOverall(scores);
  const fidelityPass = scores.productFidelity >= 70 && candidate.fidelityPass !== false;
  return { ...candidate, status: "evaluated", scores, overallScore, fidelityPass };
}
