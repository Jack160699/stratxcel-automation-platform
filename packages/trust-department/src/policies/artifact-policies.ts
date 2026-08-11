import { defaultQualityPolicy, type QualityPolicy } from "@stratxcel/workforce-core";

export interface ArtifactTrustPolicy {
  artifactKind: string;
  policy: QualityPolicy;
  requiresEvidence: boolean;
  requiresVisualQa: boolean;
  requiresTechnicalQa: boolean;
  requiresBrandQa: boolean;
  requiresClaimCheck: boolean;
}

const TRUST_EXTENSIONS = {
  hardGates: {
    blockBelow: {
      factuality: 60,
      compliance: 60,
      evidence_quality: 50,
      visual_quality: 55,
      technical_quality: 55,
    },
    blockOnProhibitedClaim: true,
    blockOnCrossTenant: true,
    blockOnMissingEvidence: true,
    blockOnPolicyViolation: true,
  },
  thresholds: {
    minimumOverall: 70,
    minimumByDimension: {
      brand_fit: 75,
      factuality: 80,
      evidence_quality: 70,
      compliance: 75,
      visual_quality: 70,
      technical_quality: 70,
      originality: 65,
    },
    mandatoryDimensions: [
      "brand_fit",
      "clarity",
      "factuality",
      "evidence_quality",
      "compliance",
    ] as const,
  },
};

function extendPolicy(id: string, overrides: Partial<QualityPolicy> = {}): QualityPolicy {
  return {
    ...defaultQualityPolicy,
    id,
    ...overrides,
    thresholds: {
      ...defaultQualityPolicy.thresholds,
      ...overrides.thresholds,
      minimumByDimension: {
        ...defaultQualityPolicy.thresholds.minimumByDimension,
        ...TRUST_EXTENSIONS.thresholds.minimumByDimension,
        ...overrides.thresholds?.minimumByDimension,
      },
      mandatoryDimensions:
        overrides.thresholds?.mandatoryDimensions ??
        [...TRUST_EXTENSIONS.thresholds.mandatoryDimensions],
    },
    hardGates: {
      ...defaultQualityPolicy.hardGates,
      ...TRUST_EXTENSIONS.hardGates,
      ...overrides.hardGates,
      blockBelow: {
        ...defaultQualityPolicy.hardGates?.blockBelow,
        ...TRUST_EXTENSIONS.hardGates.blockBelow,
        ...overrides.hardGates?.blockBelow,
      },
    },
  };
}

export const captionSetPolicy = extendPolicy("trust.caption_set");
export const imageFinalPolicy = extendPolicy("trust.image_final", {
  thresholds: {
    ...TRUST_EXTENSIONS.thresholds,
    mandatoryDimensions: ["brand_fit", "clarity", "visual_quality", "compliance"],
  },
});
export const researchSummaryPolicy = extendPolicy("trust.research_summary", {
  blockOnMissingEvidence: true,
  thresholds: {
    ...TRUST_EXTENSIONS.thresholds,
    mandatoryDimensions: ["factuality", "evidence_quality", "compliance", "clarity"],
  },
});
export const solutionDesignPolicy = extendPolicy("trust.solution_design", {
  thresholds: {
    ...TRUST_EXTENSIONS.thresholds,
    mandatoryDimensions: ["technical_quality", "clarity", "compliance", "factuality"],
  },
});
export const socialFinalPolicy = extendPolicy("trust.social_final");

const ARTIFACT_POLICIES: Record<string, ArtifactTrustPolicy> = {
  caption_set: {
    artifactKind: "caption_set",
    policy: captionSetPolicy,
    requiresEvidence: true,
    requiresVisualQa: false,
    requiresTechnicalQa: false,
    requiresBrandQa: true,
    requiresClaimCheck: true,
  },
  shortform_copy: {
    artifactKind: "shortform_copy",
    policy: captionSetPolicy,
    requiresEvidence: true,
    requiresVisualQa: false,
    requiresTechnicalQa: false,
    requiresBrandQa: true,
    requiresClaimCheck: true,
  },
  image_final: {
    artifactKind: "image_final",
    policy: imageFinalPolicy,
    requiresEvidence: false,
    requiresVisualQa: true,
    requiresTechnicalQa: false,
    requiresBrandQa: true,
    requiresClaimCheck: false,
  },
  image_candidate: {
    artifactKind: "image_candidate",
    policy: imageFinalPolicy,
    requiresEvidence: false,
    requiresVisualQa: true,
    requiresTechnicalQa: false,
    requiresBrandQa: true,
    requiresClaimCheck: false,
  },
  carousel_candidate: {
    artifactKind: "carousel_candidate",
    policy: imageFinalPolicy,
    requiresEvidence: false,
    requiresVisualQa: true,
    requiresTechnicalQa: false,
    requiresBrandQa: true,
    requiresClaimCheck: false,
  },
  research_summary: {
    artifactKind: "research_summary",
    policy: researchSummaryPolicy,
    requiresEvidence: true,
    requiresVisualQa: false,
    requiresTechnicalQa: false,
    requiresBrandQa: false,
    requiresClaimCheck: true,
  },
  longform_draft: {
    artifactKind: "longform_draft",
    policy: researchSummaryPolicy,
    requiresEvidence: true,
    requiresVisualQa: false,
    requiresTechnicalQa: false,
    requiresBrandQa: true,
    requiresClaimCheck: true,
  },
  solution_design: {
    artifactKind: "solution_design",
    policy: solutionDesignPolicy,
    requiresEvidence: true,
    requiresVisualQa: false,
    requiresTechnicalQa: true,
    requiresBrandQa: false,
    requiresClaimCheck: true,
  },
  social_final: {
    artifactKind: "social_final",
    policy: socialFinalPolicy,
    requiresEvidence: true,
    requiresVisualQa: true,
    requiresTechnicalQa: false,
    requiresBrandQa: true,
    requiresClaimCheck: true,
  },
};

export const defaultArtifactTrustPolicy: ArtifactTrustPolicy = {
  artifactKind: "default",
  policy: extendPolicy("trust.default"),
  requiresEvidence: true,
  requiresVisualQa: false,
  requiresTechnicalQa: false,
  requiresBrandQa: true,
  requiresClaimCheck: true,
};

export function getArtifactTrustPolicy(kind: string): ArtifactTrustPolicy {
  return ARTIFACT_POLICIES[kind] ?? { ...defaultArtifactTrustPolicy, artifactKind: kind };
}

export function listArtifactTrustPolicies(): readonly ArtifactTrustPolicy[] {
  return Object.values(ARTIFACT_POLICIES);
}
