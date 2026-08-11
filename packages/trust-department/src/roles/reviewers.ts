import { getRole, roleRegistryKey } from "@stratxcel/workforce-core";

export const TRUST_REVIEWER_ROLES = {
  creativeCritic: roleRegistryKey("quality", "creative_critic"),
  finalReviewer: roleRegistryKey("quality", "final_reviewer"),
  visualQa: roleRegistryKey("quality", "visual_qa"),
  claimChecker: roleRegistryKey("compliance", "claim_checker"),
  policyChecker: roleRegistryKey("compliance", "policy_checker"),
  brandRuleChecker: roleRegistryKey("compliance", "brand_rule_checker"),
  reliabilityReviewer: roleRegistryKey("engineering", "reliability_reviewer"),
} as const;

export type TrustReviewerRoleKey = (typeof TRUST_REVIEWER_ROLES)[keyof typeof TRUST_REVIEWER_ROLES];

export interface ReviewerAssignment {
  department: string;
  role: string;
  registryKey: string;
}

function assignment(department: string, role: string): ReviewerAssignment {
  return { department, role, registryKey: roleRegistryKey(department, role) };
}

export const REVIEWER_ASSIGNMENTS = {
  creativeCritic: assignment("quality", "creative_critic"),
  finalReviewer: assignment("quality", "final_reviewer"),
  visualQa: assignment("quality", "visual_qa"),
  claimChecker: assignment("compliance", "claim_checker"),
  policyChecker: assignment("compliance", "policy_checker"),
  brandRuleChecker: assignment("compliance", "brand_rule_checker"),
  reliabilityReviewer: assignment("engineering", "reliability_reviewer"),
} as const;

export function assertRegisteredReviewer(department: string, role: string): ReviewerAssignment {
  const registryKey = roleRegistryKey(department, role);
  const known = Object.values(TRUST_REVIEWER_ROLES);
  if (!known.includes(registryKey as TrustReviewerRoleKey)) {
    throw new Error(`unknown_trust_reviewer:${registryKey}`);
  }
  const definition = getRole(department, role);
  if (!definition) {
    throw new Error(`unknown_role:${registryKey}`);
  }
  return { department, role, registryKey };
}

export function assertIndependentReviewer(
  creatorDepartment: string,
  creatorRole: string,
  reviewerDepartment: string,
  reviewerRole: string,
): void {
  if (creatorDepartment === reviewerDepartment && creatorRole === reviewerRole) {
    throw new Error("creator_cannot_be_sole_reviewer");
  }
}

export function resolveReviewersForArtifactKind(kind: string): readonly ReviewerAssignment[] {
  switch (kind) {
    case "image_final":
    case "image_candidate":
    case "carousel_candidate":
      return [
        REVIEWER_ASSIGNMENTS.visualQa,
        REVIEWER_ASSIGNMENTS.brandRuleChecker,
        REVIEWER_ASSIGNMENTS.finalReviewer,
      ];
    case "research_summary":
    case "longform_draft":
      return [REVIEWER_ASSIGNMENTS.claimChecker, REVIEWER_ASSIGNMENTS.policyChecker];
    case "solution_design":
      return [REVIEWER_ASSIGNMENTS.reliabilityReviewer, REVIEWER_ASSIGNMENTS.claimChecker];
    case "social_final":
      return [
        REVIEWER_ASSIGNMENTS.creativeCritic,
        REVIEWER_ASSIGNMENTS.visualQa,
        REVIEWER_ASSIGNMENTS.brandRuleChecker,
        REVIEWER_ASSIGNMENTS.finalReviewer,
      ];
    default:
      return [
        REVIEWER_ASSIGNMENTS.creativeCritic,
        REVIEWER_ASSIGNMENTS.brandRuleChecker,
        REVIEWER_ASSIGNMENTS.claimChecker,
      ];
  }
}

export function isFinalReviewer(department: string, role: string): boolean {
  return roleRegistryKey(department, role) === TRUST_REVIEWER_ROLES.finalReviewer;
}
