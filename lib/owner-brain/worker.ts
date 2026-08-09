import { getServiceContext } from "./db-context";
import { SYNCABLE_CONNECTORS, NO_OAUTH_SOURCES } from "./connectors";
import { startSyncRun, completeSyncRun, updateSourceStatus } from "./repositories/sources";
import { deleteExpiredMemories } from "./repositories/memories";
import type { SourceKey } from "./types";

export interface WorkerBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  details: Array<{ ownerId: string; sourceKey: string; status: string; eventsIngested?: number; error?: string }>;
}

/**
 * One pass over every enabled, syncable owner_sources row across every
 * owner (in practice exactly one — Shriyansh — but this doesn't hardcode
 * that). Idempotent and retry-safe: each source's cursor only advances
 * past what actually got ingested, and ingestEvent's (source_id,
 * external_id) unique constraint makes re-processing a page a safe no-op.
 */
export async function runOwnerBrainSyncBatch(): Promise<WorkerBatchResult> {
  const service = getServiceContext().supabase;
  const result: WorkerBatchResult = { processed: 0, succeeded: 0, failed: 0, details: [] };

  const { data: sources, error } = await service
    .from("owner_sources")
    .select("id, owner_id, source_key, status, enabled, sync_cursor")
    .eq("enabled", true);
  if (error) throw new Error(`runOwnerBrainSyncBatch list failed: ${error.message}`);

  for (const source of sources ?? []) {
    const sourceKey = source.source_key as SourceKey;
    const syncFn = SYNCABLE_CONNECTORS[sourceKey];
    if (!syncFn) continue;
    if (source.status === "PAUSED") continue;

    result.processed += 1;
    let connectionId: string | undefined;

    if (!NO_OAUTH_SOURCES.includes(sourceKey)) {
      const { data: connection } = await service
        .from("owner_source_connections")
        .select("id")
        .eq("source_id", source.id)
        .eq("status", "CONNECTED")
        .maybeSingle();
      if (!connection) {
        result.failed += 1;
        result.details.push({ ownerId: source.owner_id, sourceKey, status: "AUTH_REQUIRED" });
        continue;
      }
      connectionId = connection.id as string;
    }

    const runId = await startSyncRun({
      ownerId: source.owner_id,
      sourceId: source.id,
      trigger: "cron",
      cursorBefore: source.sync_cursor ?? {},
    });

    try {
      const { eventsIngested, nextCursor } = await syncFn({
        ownerId: source.owner_id,
        sourceId: source.id,
        connectionId,
        cursor: source.sync_cursor ?? {},
      });
      await completeSyncRun({ runId, status: "SUCCEEDED", eventsIngested, cursorAfter: nextCursor });
      await updateSourceStatus(source.owner_id, source.id, {
        status: "CONNECTED",
        last_sync_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        sync_cursor: nextCursor,
        last_error: null,
      });
      result.succeeded += 1;
      result.details.push({ ownerId: source.owner_id, sourceKey, status: "SUCCEEDED", eventsIngested });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await completeSyncRun({ runId, status: "FAILED", eventsIngested: 0, error: { message } });
      await updateSourceStatus(source.owner_id, source.id, { status: "ERROR", last_sync_at: new Date().toISOString(), last_error: message });
      result.failed += 1;
      result.details.push({ ownerId: source.owner_id, sourceKey, status: "FAILED", error: message });
    }
  }

  return result;
}

export async function runOwnerBrainRetentionCleanup(): Promise<{ memoriesDeleted: number; eventsDeleted: number }> {
  const memoriesDeleted = await deleteExpiredMemories();

  const service = getServiceContext().supabase;
  const { data: sources, error } = await service.from("owner_sources").select("id, owner_id, retention_days");
  if (error) throw new Error(`runOwnerBrainRetentionCleanup list failed: ${error.message}`);

  let eventsDeleted = 0;
  for (const source of sources ?? []) {
    const cutoff = new Date(Date.now() - source.retention_days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error: deleteError } = await service
      .from("owner_events")
      .delete()
      .eq("source_id", source.id)
      .lt("occurred_at", cutoff)
      .select("id");
    if (deleteError) throw new Error(`retention cleanup delete failed: ${deleteError.message}`);
    eventsDeleted += data?.length ?? 0;
  }

  return { memoriesDeleted, eventsDeleted };
}
