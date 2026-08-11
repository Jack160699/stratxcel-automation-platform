import { createArtifactMetadata } from "../artifacts/provenance.ts";
import { critiqueCandidate } from "./critic.ts";
import type {
  QualityCandidateArtifact,
  QualityCritiqueResult,
  QualityPolicy,
} from "./types.ts";

export interface QualityLoopState {
  policy: QualityPolicy;
  creatorDepartment: string;
  creatorRole: string;
  criticDepartment: string;
  criticRole: string;
  candidates: QualityCandidateArtifact[];
  critiques: QualityCritiqueResult[];
  revisionCount: number;
  selectedFinalId?: string;
}

export function createQualityLoop(args: {
  policy: QualityPolicy;
  creatorDepartment: string;
  creatorRole: string;
  criticDepartment: string;
  criticRole: string;
}): QualityLoopState {
  if (args.policy.requireIndependentCritic && args.creatorDepartment === args.criticDepartment && args.creatorRole === args.criticRole) {
    throw new Error("creator_critic_must_differ");
  }
  return {
    policy: args.policy,
    creatorDepartment: args.creatorDepartment,
    creatorRole: args.creatorRole,
    criticDepartment: args.criticDepartment,
    criticRole: args.criticRole,
    candidates: [],
    critiques: [],
    revisionCount: 0,
  };
}

export function submitCandidate(
  state: QualityLoopState,
  candidate: Omit<QualityCandidateArtifact, "createdByDepartment" | "createdByRole">,
): QualityLoopState {
  return {
    ...state,
    candidates: [
      ...state.candidates,
      {
        ...candidate,
        createdByDepartment: state.creatorDepartment,
        createdByRole: state.creatorRole,
        provenance: createArtifactMetadata({
          tenantId: "tenant-local",
          missionId: "mission-local",
          department: state.creatorDepartment,
          role: state.creatorRole,
          kind: candidate.kind,
        }),
      },
    ],
  };
}

export function runCritiqueCycle(
  state: QualityLoopState,
  candidateId: string,
  opts: {
    scoreOverrides?: Parameters<typeof critiqueCandidate>[0]["scoreOverrides"];
    missingEvidence?: boolean;
  } = {},
): QualityLoopState {
  const candidate = state.candidates.find((c) => c.id === candidateId);
  if (!candidate) throw new Error("candidate_not_found");

  const critique = critiqueCandidate({
    candidate,
    policy: state.policy,
    reviewerDepartment: state.criticDepartment,
    reviewerRole: state.criticRole,
    scoreOverrides: opts.scoreOverrides,
    missingEvidence: opts.missingEvidence,
  });

  let revisionCount = state.revisionCount;
  if (critique.decision === "REVISE") revisionCount += 1;
  if (revisionCount > state.policy.maxRevisionCount) {
    throw new Error("revision_cap_exceeded");
  }

  let selectedFinalId = state.selectedFinalId;
  if (critique.decision === "PASS") {
    selectedFinalId = candidate.id;
  }

  return {
    ...state,
    critiques: [...state.critiques, critique],
    revisionCount,
    selectedFinalId,
  };
}

export function selectBestCandidate(state: QualityLoopState): QualityCandidateArtifact | undefined {
  if (state.selectedFinalId) {
    return state.candidates.find((c) => c.id === state.selectedFinalId);
  }
  const passing = state.critiques.filter((c) => c.decision === "PASS");
  if (passing.length === 0) return undefined;
  const best = passing.reduce((a, b) => (a.overallScore >= b.overallScore ? a : b));
  const idx = state.critiques.indexOf(best);
  return state.candidates[idx];
}
