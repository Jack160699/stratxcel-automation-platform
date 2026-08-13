export interface EvidenceCoverage {
  website: boolean;
  google: boolean;
  instagram: boolean;
  facebook: boolean;
  reviews: boolean;
  analytics: boolean;
}

export function countEvidenceCoverage(coverage: EvidenceCoverage): { present: number; total: number; ratio: number } {
  const keys = Object.keys(coverage) as Array<keyof EvidenceCoverage>;
  const present = keys.filter((key) => coverage[key]).length;
  return { present, total: keys.length, ratio: present / keys.length };
}

export function overallScoreFromCategories(
  scores: Array<number | null>,
  coverageRatio: number,
): { score: number | null; readinessOnly: boolean } {
  const numeric = scores.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (coverageRatio < 0.34 || numeric.length < 3) {
    return { score: null, readinessOnly: true };
  }
  const mean = numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
  return { score: Math.round(mean), readinessOnly: false };
}

export function categoryScoreOrInsufficient(value: unknown, hasEvidence: boolean): number | null {
  if (!hasEvidence) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}
