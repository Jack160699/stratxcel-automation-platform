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
  | "technical_quality"
  | "evidence_quality"
  | "compliance";

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

/**
 * Hard gates cannot be averaged away. Failure → REJECT (BLOCK).
 * Soft thresholds still yield REVISE when overall/dimension mins fail.
 */
export interface QualityHardGates {
  /** Score below this for a listed dimension → REJECT */
  blockBelow: Partial<Record<QualityDimension, number>>;
  blockOnProhibitedClaim?: boolean;
  blockOnCrossTenant?: boolean;
  blockOnMissingEvidence?: boolean;
  blockOnPolicyViolation?: boolean;
}

export interface QualityPolicy {
  id: string;
  thresholds: QualityThresholds;
  maxRevisionCount: number;
  requireIndependentCritic: boolean;
  blockOnMissingEvidence: boolean;
  /** Optional hard gates; when omitted, only legacy soft rules apply. */
  hardGates?: QualityHardGates;
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
  hardGates: {
    blockBelow: {
      factuality: 60,
      compliance: 60,
      evidence_quality: 50,
    },
    blockOnProhibitedClaim: true,
    blockOnCrossTenant: true,
    blockOnMissingEvidence: true,
    blockOnPolicyViolation: true,
  },
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
  hardGateFailures?: readonly string[];
}
