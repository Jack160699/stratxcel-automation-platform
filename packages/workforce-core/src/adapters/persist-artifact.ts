/**
 * Persist helpers for capability adapters — only via host.persistMissionArtifact.
 */
import { getCapabilityHost } from "./host.ts";

export async function persistCapabilityArtifact(args: {
  tenantId: string;
  missionId: string;
  requestId: string;
  capability: string;
  providerKey: string;
  kind: string;
  metadata: Record<string, unknown>;
}): Promise<{ ok: true; id: string } | { ok: false; errorMessage: string }> {
  const persist = getCapabilityHost().persistMissionArtifact;
  if (!persist) {
    return { ok: false, errorMessage: "persistMissionArtifact_host_unbound" };
  }
  return persist({
    tenantId: args.tenantId,
    missionId: args.missionId,
    kind: args.kind,
    storageRef: `workforce://${args.capability}/${args.requestId}`,
    providerKey: args.providerKey,
    capability: args.capability,
    requestId: args.requestId,
    metadata: args.metadata,
  });
}
