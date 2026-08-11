import type { ImageCandidate, ProductFidelityResult } from "../types.ts";

export function evaluateProductFidelity(args: {
  candidate: ImageCandidate;
  requiredFacts?: readonly string[];
  observedIssues?: readonly string[];
  scoreOverride?: number;
}): ProductFidelityResult {
  const failures = [...(args.observedIssues ?? [])];
  if (args.candidate.fidelityPass === false && failures.length === 0) {
    failures.push("product_fidelity_flagged");
  }
  for (const fact of args.requiredFacts ?? []) {
    if (args.observedIssues?.some((issue) => issue.toLowerCase().includes(fact.toLowerCase()))) {
      if (!failures.includes(`fact_mismatch:${fact}`)) failures.push(`fact_mismatch:${fact}`);
    }
  }
  const score =
    args.scoreOverride ??
    (failures.length === 0 ? (args.candidate.scores?.productFidelity ?? 85) : Math.max(20, 70 - failures.length * 15));
  const pass = failures.length === 0 && score >= 70;
  return {
    pass,
    score,
    failures,
    decision: fidelityFailureDecision({ pass, score, failureCount: failures.length }),
  };
}

export function fidelityFailureDecision(args: {
  pass: boolean;
  score: number;
  failureCount: number;
}): ProductFidelityResult["decision"] {
  if (args.pass) return "PASS";
  if (args.failureCount >= 3 || args.score < 40) return "HUMAN_REVIEW";
  return "REVISION_REQUIRED";
}
