export type QualityDecision = "PASS" | "REVISE" | "REJECT" | "HUMAN_REVIEW";

export type QualityDimension =
  | "strategic_fit"
  | "brand_fit"
  | "audience_fit"
  | "originality"
  | "clarity"
  | "factuality"
  | "platform_fit"
  | "conversion_strength"
  | "visual_quality"
  | "technical_quality";

export interface QualityScore {
  dimension: QualityDimension;
  score: number;
  notes?: string;
}

export interface QualityThresholds {
  minimumOverall: number;
  minimumByDimension: Partial<Record<QualityDimension, number>>;
  mandatoryDimensions: readonly QualityDimension[];
}

export interface QualityPolicy {
  id: string;
  thresholds: QualityThresholds;
  maxRevisionCount: number;
  requireIndependentCritic: boolean;
  blockOnMissingEvidence: boolean;
}

export const defaultQualityPolicy: QualityPolicy = {
  id: "default",
  thresholds: {
    minimumOverall: 70,
    minimumByDimension: {
      brand_fit: 75,
      factuality: 80,
    },
    mandatoryDimensions: ["brand_fit", "clarity"],
  },
  maxRevisionCount: 3,
  requireIndependentCritic: true,
  blockOnMissingEvidence: true,
};

export interface QualityCandidateArtifact {
  id: string;
  kind: string;
  createdByDepartment: string;
  createdByRole: string;
  content: string;
  evidenceIds?: readonly string[];
  provenance?: Record<string, unknown>;
}

export interface QualityCritiqueResult {
  decision: QualityDecision;
  scores: QualityScore[];
  overallScore: number;
  weaknesses: readonly string[];
  requiredChanges: readonly string[];
  reviewerDepartment: string;
  reviewerRole: string;
}
