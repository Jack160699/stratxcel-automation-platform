import type { CanonicalPublishReceipt, SocialPublicationStatus, SocialReleaseArtifact } from "./types.ts";

export interface BuildPublishReceiptInput {
  release: SocialReleaseArtifact;
  scheduleJobId?: string | null;
  providerPublishId?: string | null;
  publishedAtIso?: string | null;
  liveUrl?: string | null;
  usageAccountingRef?: string | null;
  errorState?: string | null;
  status: SocialPublicationStatus;
  shadow?: boolean;
}

export function buildCanonicalPublishReceipt(input: BuildPublishReceiptInput): CanonicalPublishReceipt {
  const { release } = input;
  return {
    tenantId: release.tenantId,
    missionId: release.missionId,
    artifactId: release.id,
    platform: release.platform,
    accountId: release.accountId,
    providerPublishId: input.providerPublishId ?? null,
    publishedAtIso: input.publishedAtIso ?? null,
    liveUrl: input.shadow ? null : (input.liveUrl ?? null),
    scheduleJobId: input.scheduleJobId ?? null,
    usageAccountingRef: input.usageAccountingRef ?? null,
    errorState: input.errorState ?? null,
    status: input.status,
    shadow: Boolean(input.shadow),
    payloadFingerprint: release.payloadFingerprint,
  };
}

/** Workforce execution artifact wrapper for handoff back to Hermes/CEO. */
export function receiptToWorkforceExecutionArtifact(receipt: CanonicalPublishReceipt): {
  kind: "publish_receipt";
  tenantId: string;
  missionId: string;
  artifactId: string;
  data: CanonicalPublishReceipt;
} {
  return {
    kind: "publish_receipt",
    tenantId: receipt.tenantId,
    missionId: receipt.missionId,
    artifactId: receipt.artifactId,
    data: receipt,
  };
}
