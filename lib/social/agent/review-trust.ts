/**
 * Aggregate Trust decisions across review variants — never fabricate PASS.
 */

import {
  evaluateBrandTrustHardGate,
  canShowApprovalControl,
  trustDecisionToReviewStatus,
  type TrustGateDecision,
  type TrustHardGateResult,
} from "./trust-hard-gate.ts";
import type { ProductCapabilityEvidence } from "./capability-evidence.ts";
import type { ReviewDisplayStatus } from "./review-artifact.ts";

export interface ReviewTrustAggregate {
  trustStatus: "PASS" | "REVISE" | "BLOCK" | "PENDING";
  displayStatus: ReviewDisplayStatus;
  approvalAllowed: boolean;
  reasons: string[];
  variantResults: Array<{ variantId: string; decision: TrustGateDecision; reasons: string[] }>;
}

export function aggregateVariantTrust(input: {
  variants: Array<{ variantId: string; caption: string }>;
  blockedPhrases?: readonly string[];
  forbiddenClaims?: readonly string[];
  capabilityEvidence?: ProductCapabilityEvidence | null;
}): ReviewTrustAggregate {
  const variantResults: ReviewTrustAggregate["variantResults"] = [];
  let worst: TrustGateDecision = "PASS";

  for (const variant of input.variants) {
    const result: TrustHardGateResult = evaluateBrandTrustHardGate({
      caption: variant.caption,
      blockedPhrases: input.blockedPhrases,
      forbiddenClaims: input.forbiddenClaims,
      capabilityEvidence: input.capabilityEvidence,
      isSelfMarketing: /\bstratxcel\b/i.test(variant.caption),
    });
    variantResults.push({
      variantId: variant.variantId,
      decision: result.decision,
      reasons: result.reasons,
    });
    if (result.decision === "BLOCK") worst = "BLOCK";
    else if ((result.decision === "REVISE" || result.decision === "HUMAN_REVIEW") && worst === "PASS") {
      worst = result.decision;
    } else if (result.decision === "REVISE" && worst === "HUMAN_REVIEW") {
      // keep HUMAN_REVIEW as revise-class
    } else if (result.decision === "HUMAN_REVIEW" && worst === "REVISE") {
      worst = "HUMAN_REVIEW";
    }
  }

  const trustStatus = trustDecisionToReviewStatus(worst === "HUMAN_REVIEW" ? "REVISE" : worst);
  const approvalAllowed = canShowApprovalControl(worst === "HUMAN_REVIEW" ? "REVISE" : worst);
  const displayStatus: ReviewDisplayStatus = approvalAllowed ? "READY_FOR_APPROVAL" : "NEEDS_REVIEW";
  const reasons = [...new Set(variantResults.flatMap((v) => v.reasons))];

  return { trustStatus, displayStatus, approvalAllowed, reasons, variantResults };
}
