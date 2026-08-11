export interface ArtifactMetadata {
  tenantId: string;
  missionId: string;
  createdByDepartment: string;
  createdByRole: string;
  kind: string;
  version: number;
  parentArtifactIds: readonly string[];
  evidenceRefs: readonly string[];
  candidateGroup?: string;
  createdAtIso: string;
}

export function createArtifactMetadata(args: {
  tenantId: string;
  missionId: string;
  department: string;
  role: string;
  kind: string;
  parentArtifactIds?: readonly string[];
  evidenceRefs?: readonly string[];
  candidateGroup?: string;
}): ArtifactMetadata & Record<string, unknown> {
  return {
    tenantId: args.tenantId,
    missionId: args.missionId,
    createdByDepartment: args.department,
    createdByRole: args.role,
    kind: args.kind,
    version: 1,
    parentArtifactIds: args.parentArtifactIds ?? [],
    evidenceRefs: args.evidenceRefs ?? [],
    candidateGroup: args.candidateGroup,
    createdAtIso: new Date().toISOString(),
  };
}

export function assertSameTenantArtifact(expectedTenantId: string, artifactTenantId: string): void {
  if (expectedTenantId !== artifactTenantId) {
    throw new Error("cross_tenant_artifact_rejected");
  }
}

export function assertSameMissionArtifact(expectedMissionId: string, artifactMissionId: string): void {
  if (expectedMissionId !== artifactMissionId) {
    throw new Error("cross_mission_artifact_rejected");
  }
}

export interface CapabilityProvenance {
  capabilityKey: string;
  providerKey: string | null;
  providerModel: string | null;
  requestId: string;
  generatedAtIso: string;
  tenantId: string;
  missionId: string;
  stageId: string | null;
  parentArtifactIds: readonly string[];
  usage?: Record<string, unknown>;
}

export function createCapabilityProvenance(args: {
  capabilityKey: string;
  providerKey?: string | null;
  providerModel?: string | null;
  requestId: string;
  tenantId: string;
  missionId: string;
  stageId?: string | null;
  parentArtifactIds?: readonly string[];
  usage?: Record<string, unknown>;
}): CapabilityProvenance {
  return {
    capabilityKey: args.capabilityKey,
    providerKey: args.providerKey ?? null,
    providerModel: args.providerModel ?? null,
    requestId: args.requestId,
    generatedAtIso: new Date().toISOString(),
    tenantId: args.tenantId,
    missionId: args.missionId,
    stageId: args.stageId ?? null,
    parentArtifactIds: args.parentArtifactIds ?? [],
    usage: args.usage,
  };
}
