import type {
  CreativeCritiqueResult,
  ImageCandidate,
  ImageCandidateScores,
  RevisionState,
} from "../types.ts";
import { applyImageEvaluation } from "../image/quality.ts";

export function createRevisionState(maxRevisions = 3): RevisionState {
  return { maxRevisions, revisionCount: 0, status: "open", history: [] };
}

/** Cap exceeded → HUMAN_REVIEW / NEEDS_ATTENTION. */
export function applyRevisionCycle(
  state: RevisionState,
  critique: CreativeCritiqueResult,
): RevisionState {
  const notes =
    critique.requiredRevisions.join("; ") || critique.weaknesses.join("; ") || critique.decision;

  if (critique.decision === "PASS") {
    return {
      ...state,
      status: "passed",
      lastCritique: critique,
      history: [...state.history, { cycle: state.revisionCount, decision: critique.decision, notes }],
    };
  }

  if (critique.decision === "REJECTED") {
    return {
      ...state,
      status: "NEEDS_ATTENTION",
      lastCritique: critique,
      history: [...state.history, { cycle: state.revisionCount, decision: critique.decision, notes }],
    };
  }

  const nextCount =
    critique.decision === "REVISION_REQUIRED" ? state.revisionCount + 1 : state.revisionCount;

  if (nextCount > state.maxRevisions) {
    return {
      ...state,
      revisionCount: nextCount,
      status: critique.decision === "HUMAN_REVIEW" ? "HUMAN_REVIEW" : "NEEDS_ATTENTION",
      lastCritique: critique,
      history: [
        ...state.history,
        { cycle: nextCount, decision: "HUMAN_REVIEW", notes: `revision_cap_exceeded:${notes}` },
      ],
    };
  }

  if (critique.decision === "HUMAN_REVIEW") {
    return {
      ...state,
      revisionCount: nextCount,
      status: "HUMAN_REVIEW",
      lastCritique: critique,
      history: [...state.history, { cycle: nextCount, decision: critique.decision, notes }],
    };
  }

  return {
    ...state,
    revisionCount: nextCount,
    status: "open",
    lastCritique: critique,
    history: [...state.history, { cycle: nextCount, decision: critique.decision, notes }],
  };
}

export function reviseFailingImageCandidate(
  candidate: ImageCandidate,
  improvements?: Partial<ImageCandidateScores>,
): ImageCandidate {
  const bumped: Partial<ImageCandidateScores> = {
    composition: Math.min(100, (candidate.scores?.composition ?? 60) + 8),
    productFidelity: Math.min(100, (candidate.scores?.productFidelity ?? 50) + 12),
    brandFit: Math.min(100, (candidate.scores?.brandFit ?? 60) + 8),
    realism: Math.min(100, (candidate.scores?.realism ?? 60) + 6),
    anatomy: Math.min(100, (candidate.scores?.anatomy ?? 60) + 6),
    unwantedArtifacts: Math.min(100, (candidate.scores?.unwantedArtifacts ?? 60) + 10),
    ...improvements,
  };
  const revised: ImageCandidate = {
    ...candidate,
    id: `${candidate.id}_r${candidate.revisionNumber + 1}`,
    status: "revised",
    revisionNumber: candidate.revisionNumber + 1,
    fidelityPass: (bumped.productFidelity ?? 70) >= 70 ? true : candidate.fidelityPass,
  };
  return applyImageEvaluation(revised, bumped);
}
