import type { CustomerSafeProvenance, MediaProvenance } from "../types.ts";

export function createMediaProvenance(args: {
  tenantId: string;
  missionId: string;
  stageId?: string;
  department: string;
  role: string;
  capability: string;
  provider: string;
  model?: string;
  promptOrBriefRef: string;
  referenceAssetIds?: readonly string[];
  candidateGroup?: string;
  parentArtifactId?: string;
  revisionNumber?: number;
  finalSelectionReason?: string;
  rawPrompt?: string;
  providerInternals?: Record<string, unknown>;
}): MediaProvenance {
  return {
    id: `prov_${args.tenantId}_${args.missionId}_${Date.now().toString(36)}`,
    tenantId: args.tenantId,
    missionId: args.missionId,
    stageId: args.stageId,
    department: args.department,
    role: args.role,
    capability: args.capability,
    provider: args.provider,
    model: args.model,
    promptOrBriefRef: args.promptOrBriefRef,
    referenceAssetIds: [...(args.referenceAssetIds ?? [])],
    candidateGroup: args.candidateGroup,
    parentArtifactId: args.parentArtifactId,
    generatedAtIso: new Date().toISOString(),
    revisionNumber: args.revisionNumber ?? 0,
    finalSelectionReason: args.finalSelectionReason,
    internalOnly: {
      rawPrompt: args.rawPrompt,
      providerInternals: args.providerInternals,
    },
  };
}

export function toCustomerSafeProvenance(provenance: MediaProvenance): CustomerSafeProvenance {
  return {
    id: provenance.id,
    tenantId: provenance.tenantId,
    missionId: provenance.missionId,
    department: provenance.department,
    role: provenance.role,
    generatedAtIso: provenance.generatedAtIso,
    revisionNumber: provenance.revisionNumber,
    finalSelectionReason: provenance.finalSelectionReason,
  };
}

export function assertTenantIsolation(args: {
  tenantId: string;
  artifacts: readonly { tenantId: string; id?: string }[];
}): void {
  for (const artifact of args.artifacts) {
    if (artifact.tenantId !== args.tenantId) {
      throw new Error(`tenant_isolation_violation:${artifact.id ?? "unknown"}`);
    }
  }
}
