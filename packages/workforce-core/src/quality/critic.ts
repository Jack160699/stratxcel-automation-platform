import type {
  QualityCandidateArtifact,
  QualityCritiqueResult,
  QualityDecision,
  QualityPolicy,
  QualityScore,
} from "./types.ts";

export interface CritiqueInput {
  candidate: QualityCandidateArtifact;
  policy: QualityPolicy;
  reviewerDepartment: string;
  reviewerRole: string;
  scoreOverrides?: Partial<Record<QualityScore["dimension"], number>>;
  missingEvidence?: boolean;
  prohibitedClaim?: boolean;
  policyViolation?: boolean;
  crossTenant?: boolean;
}

function averageScore(scores: QualityScore[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
}

export function evaluateHardGates(
  policy: QualityPolicy,
  scores: QualityScore[],
  opts: {
    missingEvidence?: boolean;
    prohibitedClaim?: boolean;
    policyViolation?: boolean;
    crossTenant?: boolean;
  } = {},
): readonly string[] {
  const failures: string[] = [];
  const gates = policy.hardGates;

  if (opts.crossTenant && (gates?.blockOnCrossTenant ?? true)) {
    failures.push("cross_tenant_artifact");
  }
  if (opts.prohibitedClaim && (gates?.blockOnProhibitedClaim ?? true)) {
    failures.push("prohibited_claim");
  }
  if (opts.policyViolation && (gates?.blockOnPolicyViolation ?? true)) {
    failures.push("policy_violation");
  }
  if (opts.missingEvidence && (gates?.blockOnMissingEvidence ?? policy.blockOnMissingEvidence)) {
    failures.push("missing_required_evidence");
  }

  const blockBelow = gates?.blockBelow ?? {};
  for (const [dimension, min] of Object.entries(blockBelow)) {
    const score = scores.find((s) => s.dimension === dimension)?.score;
    if (score !== undefined && min !== undefined && score < min) {
      failures.push(`hard_gate:${dimension}`);
    }
  }

  return failures;
}

export function decideFromScore(
  policy: QualityPolicy,
  scores: QualityScore[],
  opts: {
    missingEvidence?: boolean;
    brandGateFailed?: boolean;
    prohibitedClaim?: boolean;
    policyViolation?: boolean;
    crossTenant?: boolean;
  } = {},
): QualityDecision {
  const hardFailures = evaluateHardGates(policy, scores, opts);
  if (hardFailures.length > 0) return "REJECT";

  if (opts.missingEvidence && policy.blockOnMissingEvidence) return "REJECT";

  const brandScore = scores.find((s) => s.dimension === "brand_fit")?.score;
  const brandMin = policy.thresholds.minimumByDimension.brand_fit ?? 75;
  if (brandScore !== undefined && brandScore <= brandMin - 25) return "REJECT";

  const overall = averageScore(scores);
  if (overall < policy.thresholds.minimumOverall) return "REVISE";

  for (const [dimension, min] of Object.entries(policy.thresholds.minimumByDimension)) {
    const score = scores.find((s) => s.dimension === dimension)?.score ?? 0;
    if (score < (min ?? 0)) return "REVISE";
  }

  const factuality = scores.find((s) => s.dimension === "factuality")?.score ?? 100;
  const originality = scores.find((s) => s.dimension === "originality")?.score ?? 0;
  if (factuality < 60 && originality > 90) {
    return policy.hardGates ? "REJECT" : "REVISE";
  }

  if (opts.brandGateFailed) return "REVISE";

  return "PASS";
}

export function critiqueCandidate(input: CritiqueInput): QualityCritiqueResult {
  const scores: QualityScore[] = input.policy.thresholds.mandatoryDimensions.map((dimension) => ({
    dimension,
    score: input.scoreOverrides?.[dimension] ?? 80,
  }));

  if (input.scoreOverrides) {
    for (const [dimension, score] of Object.entries(input.scoreOverrides)) {
      if (!scores.some((s) => s.dimension === dimension)) {
        scores.push({ dimension: dimension as QualityScore["dimension"], score });
      }
    }
  }

  const brandGateFailed =
    (input.scoreOverrides?.brand_fit ?? 80) < (input.policy.thresholds.minimumByDimension.brand_fit ?? 75);
  const hardGateFailures = evaluateHardGates(input.policy, scores, {
    missingEvidence: input.missingEvidence,
    prohibitedClaim: input.prohibitedClaim,
    policyViolation: input.policyViolation,
    crossTenant: input.crossTenant,
  });
  const decision = decideFromScore(input.policy, scores, {
    missingEvidence: input.missingEvidence,
    brandGateFailed,
    prohibitedClaim: input.prohibitedClaim,
    policyViolation: input.policyViolation,
    crossTenant: input.crossTenant,
  });

  return {
    decision,
    scores,
    overallScore: averageScore(scores),
    weaknesses:
      decision === "PASS"
        ? []
        : hardGateFailures.length > 0
          ? hardGateFailures.map((f) => `Hard gate failed: ${f}`)
          : ["Quality threshold not met"],
    requiredChanges:
      decision === "PASS"
        ? []
        : hardGateFailures.length > 0
          ? hardGateFailures.map((f) => `Resolve hard gate: ${f}`)
          : ["Address scored weaknesses before finalization"],
    reviewerDepartment: input.reviewerDepartment,
    reviewerRole: input.reviewerRole,
    hardGateFailures: hardGateFailures.length > 0 ? hardGateFailures : undefined,
  };
}
