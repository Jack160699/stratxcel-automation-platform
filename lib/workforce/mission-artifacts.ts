/**
 * Persist / resolve mission artifacts for Workforce capability outputs.
 * Reuses mission_artifacts — no competing artifact system.
 */
import { createSupabaseServiceClient } from "../supabase/service.ts";
import type {
  PersistMissionArtifactInput,
  PersistMissionArtifactResult,
} from "@stratxcel/workforce-core";
import type { ArtifactRecord } from "@stratxcel/workforce-core";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export async function findResearchArtifactByIdempotencyKey(
  input: { tenantId: string; missionId: string; key: string },
  service: ServiceClient = createSupabaseServiceClient(),
): Promise<{ id: string; metadata?: Record<string, unknown> } | null> {
  const { data: mission, error: missionError } = await service
    .from("missions")
    .select("id, tenant_id")
    .eq("id", input.missionId)
    .maybeSingle();
  if (missionError || !mission || mission.tenant_id !== input.tenantId) return null;

  const { data, error } = await service
    .from("mission_artifacts")
    .select("id, metadata")
    .eq("mission_id", input.missionId)
    .in("kind", ["research_evidence", "research_summary"])
    .contains("metadata", { idempotencyKey: input.key })
    .maybeSingle();
  if (error || !data?.id) return null;
  return {
    id: String(data.id),
    metadata:
      data.metadata && typeof data.metadata === "object"
        ? (data.metadata as Record<string, unknown>)
        : undefined,
  };
}

export async function persistMissionArtifact(
  input: PersistMissionArtifactInput,
  service: ServiceClient = createSupabaseServiceClient(),
): Promise<PersistMissionArtifactResult> {
  try {
    const { data: mission, error: missionError } = await service
      .from("missions")
      .select("id, tenant_id")
      .eq("id", input.missionId)
      .maybeSingle();
    if (missionError) {
      return { ok: false, errorMessage: missionError.message.slice(0, 500) };
    }
    if (!mission || mission.tenant_id !== input.tenantId) {
      return { ok: false, errorMessage: "TENANT_FORBIDDEN" };
    }

    const metadata: Record<string, unknown> = {
      ...input.metadata,
      tenantId: input.tenantId,
      missionId: input.missionId,
      requestId: input.requestId ?? null,
      providerKey: input.providerKey ?? null,
      capability: input.capability ?? null,
    };

    const { data, error } = await service
      .from("mission_artifacts")
      .insert({
        mission_id: input.missionId,
        kind: input.kind,
        storage_ref: input.storageRef ?? null,
        metadata,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      const duplicate =
        error?.code === "23505" || /duplicate|unique constraint/i.test(error?.message ?? "");
      const idempotencyKey =
        typeof metadata.idempotencyKey === "string" ? metadata.idempotencyKey : null;
      if (
        duplicate &&
        idempotencyKey &&
        (input.kind === "research_evidence" || input.kind === "research_summary")
      ) {
        const existing = await findResearchArtifactByIdempotencyKey(
          {
            tenantId: input.tenantId,
            missionId: input.missionId,
            key: idempotencyKey,
          },
          service,
        );
        if (existing?.id) return { ok: true, id: existing.id };
      }
      return {
        ok: false,
        errorMessage: (error?.message ?? "artifact_persist_failed").slice(0, 500),
      };
    }
    return { ok: true, id: String(data.id) };
  } catch (err) {
    return {
      ok: false,
      errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
    };
  }
}

export async function resolveMissionArtifactRecord(
  artifactId: string,
  opts: { expectedTenantId: string; service?: ServiceClient } ,
): Promise<ArtifactRecord | null> {
  const service = opts.service ?? createSupabaseServiceClient();
  const { data, error } = await service
    .from("mission_artifacts")
    .select("id, mission_id, kind, metadata, version")
    .eq("id", artifactId)
    .maybeSingle();
  if (error || !data) return null;

  const { data: mission } = await service
    .from("missions")
    .select("id, tenant_id")
    .eq("id", data.mission_id)
    .maybeSingle();
  if (!mission || mission.tenant_id !== opts.expectedTenantId) return null;

  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  return {
    id: String(data.id),
    tenantId: String(mission.tenant_id),
    missionId: String(data.mission_id),
    kind: String(data.kind),
    version:
      typeof data.version === "string" || typeof data.version === "number"
        ? String(data.version)
        : typeof meta.version === "string"
          ? meta.version
          : undefined,
    status: typeof meta.status === "string" ? meta.status : undefined,
  };
}
