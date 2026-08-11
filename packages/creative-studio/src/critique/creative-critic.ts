import {
  critiqueCandidate,
  defaultQualityPolicy,
  type QualityCandidateArtifact,
  type QualityPolicy,
} from "@stratxcel/workforce-core";
import { assertClaimsAllowed } from "../brief/creative-director.ts";
import type { CreativeBrief, CreativeCritiqueDecision, CreativeCritiqueResult } from "../types.ts";

function mapDecision(decision: string): CreativeCritiqueDecision {
  switch (decision) {
    case "PASS":
      return "PASS";
    case "REVISE":
      return "REVISION_REQUIRED";
    case "REJECT":
      return "REJECTED";
    case "HUMAN_REVIEW":
      return "HUMAN_REVIEW";
    default:
      return "NEEDS_ATTENTION";
  }
}

export function createCreativeRevisionLoop(args: {
  creatorDepartment: string;
  creatorRole: string;
  criticDepartment: string;
  criticRole: string;
  policy?: QualityPolicy;
}): {
  creatorDepartment: string;
  creatorRole: string;
  criticDepartment: string;
  criticRole: string;
  policy: QualityPolicy;
} {
  if (args.creatorDepartment === args.criticDepartment && args.creatorRole === args.criticRole) {
    throw new Error("creator_critic_must_differ");
  }
  return {
    creatorDepartment: args.creatorDepartment,
    creatorRole: args.creatorRole,
    criticDepartment: args.criticDepartment,
    criticRole: args.criticRole,
    policy: args.policy ?? {
      ...defaultQualityPolicy,
      id: "creative-studio",
      maxRevisionCount: 3,
      requireIndependentCritic: true,
    },
  };
}

/** Blocked claims → REJECTED (returned, never thrown). Creator must differ from critic. */
export function critiqueCreativeWork(args: {
  brief: CreativeBrief;
  content: string;
  candidateId?: string;
  creatorDepartment: string;
  creatorRole: string;
  criticDepartment?: string;
  criticRole?: string;
  policy?: QualityPolicy;
  scoreOverrides?: Parameters<typeof critiqueCandidate>[0]["scoreOverrides"];
  missingEvidence?: boolean;
}): CreativeCritiqueResult {
  const criticDepartment = args.criticDepartment ?? "quality";
  const criticRole = args.criticRole ?? "creative_critic";

  if (args.creatorDepartment === criticDepartment && args.creatorRole === criticRole) {
    throw new Error("creator_critic_must_differ");
  }

  let blockedClaim = false;
  let blockedReason = "";
  try {
    assertClaimsAllowed({
      text: args.content,
      approvedClaims: args.brief.approvedClaims,
      prohibitedClaims: args.brief.prohibitedClaims,
    });
  } catch (err) {
    blockedClaim = true;
    blockedReason = err instanceof Error ? err.message : "blocked_claim";
  }

  if (blockedClaim) {
    return {
      decision: "REJECTED",
      strengths: [],
      weaknesses: [blockedReason],
      strategicProblems: ["contains_blocked_claims"],
      brandProblems: ["claim_policy_violation"],
      visualProblems: [],
      copyProblems: [blockedReason],
      factualConcerns: [blockedReason],
      requiredRevisions: ["Remove blocked/prohibited claims before resubmitting"],
      scores: [
        { dimension: "factuality", score: 0 },
        { dimension: "brand_fit", score: 20 },
      ],
      overallScore: 10,
      reviewerDepartment: criticDepartment,
      reviewerRole: criticRole,
      creatorDepartment: args.creatorDepartment,
      creatorRole: args.creatorRole,
    };
  }

  const candidate: QualityCandidateArtifact = {
    id: args.candidateId ?? `cand_${args.brief.id}`,
    kind: "creative_work",
    createdByDepartment: args.creatorDepartment,
    createdByRole: args.creatorRole,
    content: args.content,
  };

  const policy = args.policy ?? defaultQualityPolicy;
  const raw = critiqueCandidate({
    candidate,
    policy,
    reviewerDepartment: criticDepartment,
    reviewerRole: criticRole,
    scoreOverrides: args.scoreOverrides,
    missingEvidence: args.missingEvidence,
  });

  return {
    decision: mapDecision(raw.decision),
    strengths: raw.decision === "PASS" ? ["meets_quality_thresholds"] : [],
    weaknesses: raw.weaknesses,
    strategicProblems: [],
    brandProblems: raw.scores.some((s) => s.dimension === "brand_fit" && s.score < 75)
      ? ["brand_fit_below_threshold"]
      : [],
    visualProblems: [],
    copyProblems: raw.decision === "PASS" ? [] : ["copy_needs_revision"],
    factualConcerns: [],
    requiredRevisions: raw.requiredChanges,
    scores: raw.scores.map((s) => ({ dimension: s.dimension, score: s.score })),
    overallScore: raw.overallScore,
    reviewerDepartment: criticDepartment,
    reviewerRole: criticRole,
    creatorDepartment: args.creatorDepartment,
    creatorRole: args.creatorRole,
  };
}
