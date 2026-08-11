// Run with: node --experimental-strip-types packages/trust-department/src/__tests__/trust-department.test.ts
import assert from "node:assert/strict";
import { CapabilityEscalationError, narrowCapabilityClasses } from "@stratxcel/workforce-core";

import {
  assertApprovalCannotBypassCompliance,
  assertIndependentReviewer,
  assessReleaseReadiness,
  auditGenericUnsupportedClaims,
  buildComplianceOutcome,
  checkCreativeMediocrity,
  checkTechnicalQuality,
  checkVisualQuality,
  createRevisionRequest,
  enforceRevisionCap,
  evaluateCustomerApproval,
  evaluateTrustArtifact,
  getArtifactTrustPolicy,
  isStructuredRevisionRequest,
  rejectMediocreCreative,
  captionSetPolicy,
} from "../index.ts";

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    id: "art-1",
    kind: "caption_set",
    tenantId: "tenant-a",
    missionId: "mission-1",
    version: 1,
    createdByDepartment: "content",
    createdByRole: "copywriter",
    content: "Draft caption for launch",
    evidenceIds: ["ev-1"],
    modelConfidence: 0.99,
    ...overrides,
  };
}

function baseEvalInput(overrides: Record<string, unknown> = {}) {
  return {
    artifact: artifact(),
    tenantId: "tenant-a",
    creatorDepartment: "content",
    creatorRole: "copywriter",
    reviewerDepartment: "quality",
    reviewerRole: "creative_critic",
    reviewedVersion: 1,
    ...overrides,
  };
}

function run() {
  // high creativity + low factuality blocks
  const highCreativity = evaluateTrustArtifact(
    baseEvalInput({
      artifact: artifact({
        content: "Bold innovative unique campaign. Studies show 99% improvement.",
        evidenceIds: [],
      }),
      scoreOverrides: { originality: 95, factuality: 40, brand_fit: 90, clarity: 90 },
    }),
  );
  assert.equal(highCreativity.quality.decision, "REJECT");
  assert.ok(
    highCreativity.compliance.reasonCodes.includes("high_creativity_low_factuality") ||
      highCreativity.compliance.reasonCodes.includes("missing_evidence") ||
      highCreativity.compliance.reasonCodes.includes("factuality_hard_gate"),
  );

  // prohibited claim blocks
  const prohibited = evaluateTrustArtifact(
    baseEvalInput({
      artifact: artifact({ content: "Our product delivers guaranteed results for everyone." }),
      reviewerDepartment: "compliance",
      reviewerRole: "claim_checker",
    }),
  );
  assert.equal(prohibited.compliance.decision, "BLOCK");
  assert.ok(prohibited.compliance.reasonCodes.includes("prohibited_claim"));

  // missing evidence blocks
  const missingEvidence = evaluateTrustArtifact(
    baseEvalInput({
      artifact: artifact({
        content: "Studies show our approach increases revenue by 40%.",
        evidenceIds: [],
      }),
      reviewerDepartment: "compliance",
      reviewerRole: "claim_checker",
    }),
  );
  assert.equal(missingEvidence.compliance.decision, "BLOCK");
  assert.ok(missingEvidence.compliance.reasonCodes.includes("missing_evidence"));

  // brand violation revises
  const brandViolation = evaluateTrustArtifact(
    baseEvalInput({
      artifact: artifact({ content: "Competitors are the worst trash in the market." }),
      reviewerDepartment: "compliance",
      reviewerRole: "brand_rule_checker",
      scoreOverrides: { brand_fit: 62, clarity: 88, factuality: 85 },
    }),
  );
  assert.equal(brandViolation.compliance.decision, "REVISE");
  assert.ok(brandViolation.compliance.reasonCodes.includes("brand_violation"));

  // creator != sole reviewer
  assert.throws(
    () =>
      assertIndependentReviewer("content", "copywriter", "content", "copywriter"),
    /creator_cannot_be_sole_reviewer/,
  );

  // revision request structured
  const revision = createRevisionRequest({
    artifactId: "art-1",
    artifactVersion: 2,
    requestedByDepartment: "quality",
    requestedByRole: "creative_critic",
    reasonCodes: ["brand_violation"],
    requiredChanges: ["Remove competitor bashing"],
    revisionNumber: 1,
  });
  assert.ok(isStructuredRevisionRequest(revision));
  assert.equal(revision.artifactVersion, 2);

  // revision cap integrates
  assert.throws(
    () => enforceRevisionCap({ ...captionSetPolicy, maxRevisionCount: 2 }, 3),
    /revision_cap_exceeded/,
  );

  // visual defect blocks
  const visual = evaluateTrustArtifact(
    baseEvalInput({
      artifact: artifact({
        kind: "image_final",
        content: "Hero image with text cutoff and logo distortion",
      }),
      reviewerDepartment: "quality",
      reviewerRole: "visual_qa",
      scoreOverrides: { visual_quality: 40, brand_fit: 85, clarity: 85 },
    }),
  );
  assert.equal(visual.compliance.decision, "BLOCK");
  assert.ok(visual.compliance.reasonCodes.includes("visual_defect"));

  // exact artifact version reviewed
  const versionMismatch = evaluateTrustArtifact(
    baseEvalInput({ reviewedVersion: 2 }),
  );
  assert.ok(versionMismatch.compliance.reasonCodes.includes("version_mismatch"));

  // approval cannot bypass compliance hard block
  assert.throws(
    () => assertApprovalCannotBypassCompliance("BLOCK", true),
    /approval_cannot_bypass_compliance_block/,
  );

  const blockedApproval = evaluateCustomerApproval({
    tenantId: "tenant-a",
    artifact: artifact(),
    parentCapabilities: ["content.shortform"],
    requestedCapabilities: ["content.shortform"],
    compliance: prohibited.compliance,
    qualityDecision: "PASS",
  });
  assert.equal(blockedApproval.approved, false);
  assert.equal(blockedApproval.publishAuthorized, false);
  assert.ok(blockedApproval.blockers.includes("approval_cannot_bypass_compliance_block"));

  // quality pass cannot publish
  const passingQuality = evaluateTrustArtifact(
    baseEvalInput({
      scoreOverrides: {
        brand_fit: 90,
        clarity: 90,
        factuality: 90,
        evidence_quality: 90,
        compliance: 90,
        originality: 75,
      },
    }),
  );
  assert.equal(passingQuality.quality.decision, "PASS");
  const qualityPassApproval = evaluateCustomerApproval({
    tenantId: "tenant-a",
    artifact: artifact(),
    parentCapabilities: ["content.shortform"],
    requestedCapabilities: ["content.shortform"],
    compliance: passingQuality.compliance,
    qualityDecision: "PASS",
  });
  assert.equal(qualityPassApproval.publishAuthorized, false);
  assert.ok(qualityPassApproval.blockers.includes("quality_pass_does_not_authorize_publish"));

  // customer approval cannot widen capability
  assert.throws(
    () => narrowCapabilityClasses(["content.shortform"], ["content.shortform", "crm.write"]),
    CapabilityEscalationError,
  );
  const widenAttempt = evaluateCustomerApproval({
    tenantId: "tenant-a",
    artifact: artifact(),
    parentCapabilities: ["content.shortform"],
    requestedCapabilities: ["content.shortform", "crm.write"],
    compliance: passingQuality.compliance,
    qualityDecision: "REVISE",
  });
  assert.ok(widenAttempt.blockers.includes("customer_approval_cannot_widen_capabilities"));

  // cross-tenant artifact rejected
  const crossTenant = evaluateTrustArtifact(
    baseEvalInput({
      artifact: artifact({ tenantId: "tenant-b" }),
    }),
  );
  assert.equal(crossTenant.compliance.decision, "BLOCK");
  assert.ok(crossTenant.compliance.reasonCodes.includes("cross_tenant_artifact"));

  // audit generic unsupported claim rejected
  const unsupported = auditGenericUnsupportedClaims({
    content: "Studies show we are the best option.",
    evidenceIds: [],
  });
  assert.equal(unsupported.rejected, true);
  assert.equal(unsupported.reasonCode, "unsupported_claim");

  // final release readiness accurate
  const readyEval = evaluateTrustArtifact(
    baseEvalInput({
      reviewerDepartment: "quality",
      reviewerRole: "final_reviewer",
      reviewedVersion: 1,
      scoreOverrides: {
        brand_fit: 92,
        clarity: 91,
        factuality: 90,
        evidence_quality: 88,
        compliance: 90,
        originality: 78,
        strategic_fit: 80,
      },
      artifact: artifact({ content: "Launch caption with clear value proposition." }),
    }),
  );
  const readiness = assessReleaseReadiness({
    evaluation: readyEval,
    reviewedVersion: 1,
    reviewerDepartment: "quality",
    reviewerRole: "final_reviewer",
    finalReviewComplete: true,
  });
  assert.equal(readiness.readyToRelease, true);
  assert.equal(readiness.publishAuthorized, false);
  assert.equal(readiness.versionMatchesReview, true);

  const notReady = assessReleaseReadiness({
    evaluation: prohibited,
    reviewedVersion: 1,
    reviewerDepartment: "compliance",
    reviewerRole: "claim_checker",
    finalReviewComplete: true,
  });
  assert.equal(notReady.readyToRelease, false);
  assert.ok(notReady.blockers.includes("compliance_hard_block"));

  // technical QA
  const technical = checkTechnicalQuality({
    artifact: artifact({
      kind: "solution_design",
      content: "Design with missing error handling and no retry policy",
    }),
  });
  assert.equal(technical.suggestedDecision, "BLOCK");
  assert.ok(technical.findings.some((f) => f.reasonCode === "technical_defect"));

  const technicalEval = evaluateTrustArtifact(
    baseEvalInput({
      artifact: artifact({
        kind: "solution_design",
        content: "Architecture with missing observability hooks",
      }),
      reviewerDepartment: "engineering",
      reviewerRole: "reliability_reviewer",
    }),
  );
  assert.equal(technicalEval.compliance.decision, "BLOCK");

  // creative mediocrity rejection
  const mediocre = checkCreativeMediocrity({
    content: "In today's fast-paced world, we are passionate about best in class synergy.",
    originalityScore: 50,
    clarityScore: 55,
    strategicFitScore: 52,
  });
  assert.equal(mediocre.suggestedDecision, "BLOCK");
  assert.throws(
    () =>
      rejectMediocreCreative({
        content: "Look no further for a game changer to take your business to the next level.",
        originalityScore: 48,
        clarityScore: 50,
        strategicFitScore: 49,
      }),
    /mediocre_creative_rejected/,
  );

  // legal certification always false
  const compliance = buildComplianceOutcome({
    qaResults: [],
    reviewerDepartment: "compliance",
    reviewerRole: "policy_checker",
  });
  assert.equal(compliance.legalCertification, false);

  // model confidence ignored
  assert.equal(highCreativity.modelConfidenceIgnored, true);
  assert.equal(getArtifactTrustPolicy("caption_set").requiresClaimCheck, true);

  // visual-only helper
  const visualOnly = checkVisualQuality({
    artifact: artifact({ content: "image with low resolution artifact" }),
    visualQualityScore: 30,
  });
  assert.equal(visualOnly.suggestedDecision, "BLOCK");

  console.log("trust-department.test.ts (@stratxcel/trust-department): ALL PASS");
}

run();
