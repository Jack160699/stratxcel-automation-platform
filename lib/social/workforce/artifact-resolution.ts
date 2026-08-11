/**
 * Deterministic artifact / media resolution for Social missions.
 * Current mission/session outranks old sessions. No silent cross-session reuse.
 */

export interface SessionMediaRef {
  mediaAssetId: string;
  sessionId: string;
  missionId: string;
  createdAtIso: string;
}

export interface ArtifactResolutionContext {
  tenantId: string;
  missionId: string;
  sessionId: string;
  explicitlySelectedMediaIds?: readonly string[];
  currentSessionMedia: readonly SessionMediaRef[];
  candidateMedia?: readonly SessionMediaRef[];
}

export class ArtifactResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactResolutionError";
  }
}

/**
 * Resolution order (deterministic):
 * 1. Explicitly selected media IDs
 * 2. Current session attachments (newest first)
 * 3. Never fall back to other sessions unless explicitly selected
 */
export function resolveMediaAssetIds(ctx: ArtifactResolutionContext): string[] {
  const explicit = [...(ctx.explicitlySelectedMediaIds ?? [])];
  if (explicit.length > 0) {
    return [...new Set(explicit)];
  }

  const current = ctx.currentSessionMedia
    .filter((m) => m.sessionId === ctx.sessionId && m.missionId === ctx.missionId)
    .sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1));

  if (current.length > 0) {
    return [...new Set(current.map((m) => m.mediaAssetId))];
  }

  const stale = (ctx.candidateMedia ?? []).filter(
    (m) => m.sessionId !== ctx.sessionId || m.missionId !== ctx.missionId,
  );
  if (stale.length > 0) {
    throw new ArtifactResolutionError("stale_cross_session_media_rejected");
  }

  return [];
}

export function assertNoStaleMediaSubstitution(input: {
  resolvedIds: readonly string[];
  currentSessionMediaIds: readonly string[];
  explicitlySelectedMediaIds?: readonly string[];
}): void {
  const allowed = new Set([
    ...input.currentSessionMediaIds,
    ...(input.explicitlySelectedMediaIds ?? []),
  ]);
  for (const id of input.resolvedIds) {
    if (!allowed.has(id)) {
      throw new ArtifactResolutionError("stale_media_substitution_rejected");
    }
  }
}
