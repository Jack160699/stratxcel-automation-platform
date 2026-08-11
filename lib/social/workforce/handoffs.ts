import type { CanonicalPublishReceipt, SocialReleaseArtifact } from "./types.ts";
import { receiptToWorkforceExecutionArtifact } from "./receipt.ts";
import { emitAnalyticsMeasurementTarget, analyticsHandoffEvent } from "./analytics-handoff.ts";

export type SocialHandoffQualityStatus = "PASS" | "REVISE" | "REJECT" | "not_reviewed";

/** Mirrors WorkforceCore DepartmentHandoff without importing the package graph. */
export interface SocialDepartmentHandoff {
  id: string;
  tenantId: string;
  missionId: string;
  planId: string;
  fromStage: string;
  toStage: string;
  objective: string;
  artifactIds: readonly string[];
  evidenceIds: readonly string[];
  decisions: readonly string[];
  unresolvedQuestions: readonly string[];
  constraints: readonly string[];
  qualityStatus: SocialHandoffQualityStatus;
  createdAtIso: string;
}

export interface SocialInboundHandoffInput {
  tenantId: string;
  missionId: string;
  planId: string;
  fromStage: string;
  toStage?: string;
  release: SocialReleaseArtifact;
  evidenceIds?: readonly string[];
  decisions?: readonly string[];
  unresolvedQuestions?: readonly string[];
  constraints?: readonly string[];
}

function createHandoff(input: Omit<SocialDepartmentHandoff, "id" | "createdAtIso">): SocialDepartmentHandoff {
  if (input.fromStage === input.toStage) {
    throw new Error("handoff_same_stage");
  }
  return {
    id: crypto.randomUUID(),
    ...input,
    createdAtIso: new Date().toISOString(),
  };
}

/** Structured handoff: upstream departments → Social. */
export function createSocialInboundHandoff(input: SocialInboundHandoffInput): SocialDepartmentHandoff {
  const qualityStatus = mapQuality(input.release.qualityStatus);
  return createHandoff({
    tenantId: input.tenantId,
    missionId: input.missionId,
    planId: input.planId,
    fromStage: input.fromStage,
    toStage: input.toStage ?? "s_social_schedule",
    objective: `Social release for ${input.release.platform} account ${input.release.accountId}`,
    artifactIds: [input.release.id, ...input.release.upstreamArtifactIds],
    evidenceIds: input.evidenceIds ?? [],
    decisions: input.decisions ?? [`payloadFingerprint=${input.release.payloadFingerprint}`],
    unresolvedQuestions: input.unresolvedQuestions ?? [],
    constraints: [
      ...(input.constraints ?? []),
      "preview_equals_approval_equals_publish",
      "no_creative_regeneration_on_technical_retry",
    ],
    qualityStatus,
  });
}

/** Structured handoff: Social receipt → Workforce execution artifact + analytics target. */
export function createSocialOutboundHandoff(input: {
  tenantId: string;
  missionId: string;
  planId: string;
  fromStage?: string;
  toStage?: string;
  receipt: CanonicalPublishReceipt;
}): {
  handoff: SocialDepartmentHandoff;
  executionArtifact: ReturnType<typeof receiptToWorkforceExecutionArtifact>;
  analyticsEvent: ReturnType<typeof analyticsHandoffEvent>;
} {
  const executionArtifact = receiptToWorkforceExecutionArtifact(input.receipt);
  const analyticsEvent = analyticsHandoffEvent(emitAnalyticsMeasurementTarget(input.receipt));
  const handoff = createHandoff({
    tenantId: input.tenantId,
    missionId: input.missionId,
    planId: input.planId,
    fromStage: input.fromStage ?? "s_social_publish",
    toStage: input.toStage ?? "s_analytics",
    objective: "Publish receipt ready for measurement",
    artifactIds: [input.receipt.artifactId],
    evidenceIds: input.receipt.providerPublishId ? [input.receipt.providerPublishId] : [],
    decisions: [
      `status=${input.receipt.status}`,
      `shadow=${input.receipt.shadow}`,
      `liveUrl=${input.receipt.liveUrl ?? "none"}`,
    ],
    unresolvedQuestions: [],
    constraints: ["no_provider_credentials_in_handoff"],
    qualityStatus: input.receipt.status === "FAILED" ? "REVISE" : "PASS",
  });
  return { handoff, executionArtifact, analyticsEvent };
}

function mapQuality(status: SocialReleaseArtifact["qualityStatus"]): SocialHandoffQualityStatus {
  if (status === "PASS" || status === "REVISE" || status === "REJECT" || status === "not_reviewed") {
    return status;
  }
  return "not_reviewed";
}
