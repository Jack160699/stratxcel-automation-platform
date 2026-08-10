import type { OwnerContext } from "../db-context";
import { getServiceContext } from "../db-context";
import type { SourceKey, SourceStatus, SyncRunStatus } from "../types";
import { SOURCE_REGISTRY, getSourceDefinition } from "../sources/registry";

export interface OwnerSourceRow {
  id: string;
  owner_id: string;
  source_key: SourceKey;
  display_name: string;
  category: string;
  status: SourceStatus;
  enabled: boolean;
  scopes: string[];
  permission_level: string | null;
  data_categories: string[];
  retention_days: number;
  last_sync_at: string | null;
  last_success_at: string | null;
  sync_cursor: Record<string, unknown>;
  health: Record<string, unknown>;
  last_error: string | null;
  paused_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Minimal shape ensureSourceRows/getSourceByKey actually need — deliberately narrower than OwnerContext so service-role callers (the desktop-companion ingest route, which has an ownerId but no browser session) can call them too without a fake OwnerContext cast. */
type OwnerScoped = { ownerId: string; supabase: OwnerContext["supabase"] };

/**
 * Ensures every registry entry has a corresponding owner_sources row for
 * this owner (idempotent — safe to call on every page load). New sources
 * added to the registry appear automatically without a migration.
 */
export async function ensureSourceRows(ctx: OwnerScoped): Promise<void> {
  for (const def of SOURCE_REGISTRY) {
    await ctx.supabase
      .from("owner_sources")
      .upsert(
        {
          owner_id: ctx.ownerId,
          source_key: def.sourceKey,
          display_name: def.displayName,
          category: def.category,
          data_categories: def.dataCategories,
          retention_days: def.defaultRetentionDays,
        },
        { onConflict: "owner_id,source_key", ignoreDuplicates: true }
      );
  }
  await reconcileDirectSources(ctx);
}

const DIRECT_READY_SOURCES: readonly SourceKey[] = ["stratxcel_internal", "stratxcel_admin_ui", "voice_notes"];

/** Bootstraps implemented, credential-free sources while preserving an explicit pause. */
export async function reconcileDirectSources(ctx: OwnerScoped): Promise<void> {
  const service = getServiceContext().supabase;
  const { data, error } = await service
    .from("owner_sources")
    .select("id, source_key, status, paused_at")
    .eq("owner_id", ctx.ownerId)
    .in("source_key", [...DIRECT_READY_SOURCES]);
  if (error) throw new Error(`reconcileDirectSources failed: ${error.message}`);
  for (const source of data ?? []) {
    if (source.status === "PAUSED" || source.paused_at) continue;
    if (source.source_key === "voice_notes" && !process.env.GEMINI_API_KEY) {
      await service.from("owner_sources").update({ status: "UNAVAILABLE", enabled: false, health: { mode: "direct_upload", ready: false, reason: "transcription_runtime_unavailable" }, updated_at: new Date().toISOString() }).eq("id", source.id).eq("owner_id", ctx.ownerId);
      continue;
    }
    const { error: updateError } = await service.from("owner_sources").update({
      status: "CONNECTED",
      enabled: true,
      last_error: null,
      health: { mode: source.source_key === "voice_notes" ? "direct_upload" : "internal", ready: true },
      updated_at: new Date().toISOString(),
    }).eq("id", source.id).eq("owner_id", ctx.ownerId);
    if (updateError) throw new Error(`reconcileDirectSources update failed: ${updateError.message}`);
  }
}

export async function reconcileDesktopSource(ownerId: string): Promise<void> {
  const service = getServiceContext().supabase;
  const { data: source, error: sourceError } = await service.from("owner_sources")
    .select("id, status, paused_at").eq("owner_id", ownerId).eq("source_key", "desktop_companion").maybeSingle();
  if (sourceError) throw new Error(`reconcileDesktopSource source failed: ${sourceError.message}`);
  if (!source) return;
  const { data: devices, error } = await service.from("owner_desktop_devices")
    .select("id, last_seen_at").eq("owner_id", ownerId).eq("status", "PAIRED");
  if (error) throw new Error(`reconcileDesktopSource devices failed: ${error.message}`);
  const latest = (devices ?? []).map((d) => d.last_seen_at as string | null).filter(Boolean).sort().at(-1) ?? null;
  const paused = source.status === "PAUSED" || Boolean(source.paused_at);
  await service.from("owner_sources").update({
    status: paused ? "PAUSED" : devices?.length ? "CONNECTED" : "AUTH_REQUIRED",
    enabled: paused ? false : Boolean(devices?.length),
    last_error: null,
    health: { paired_device_count: devices?.length ?? 0, latest_last_seen_at: latest },
    updated_at: new Date().toISOString(),
  }).eq("id", source.id).eq("owner_id", ownerId);
}

export async function listSources(ctx: OwnerScoped): Promise<OwnerSourceRow[]> {
  await ensureSourceRows(ctx);
  const { data, error } = await ctx.supabase
    .from("owner_sources")
    .select("*")
    .eq("owner_id", ctx.ownerId)
    .order("category", { ascending: true });
  if (error) throw new Error(`listSources failed: ${error.message}`);
  return (data ?? []) as OwnerSourceRow[];
}

export async function getSourceByKey(ctx: OwnerScoped, sourceKey: SourceKey): Promise<OwnerSourceRow | null> {
  const { data, error } = await ctx.supabase
    .from("owner_sources")
    .select("*")
    .eq("owner_id", ctx.ownerId)
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (error) throw new Error(`getSourceByKey failed: ${error.message}`);
  return data as OwnerSourceRow | null;
}

export async function setSourceEnabled(ctx: OwnerContext, sourceKey: SourceKey, enabled: boolean): Promise<void> {
  const { error } = await ctx.supabase
    .from("owner_sources")
    .update({ enabled, status: enabled ? "CONNECTED" : "PAUSED", paused_at: enabled ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("owner_id", ctx.ownerId)
    .eq("source_key", sourceKey);
  if (error) throw new Error(`setSourceEnabled failed: ${error.message}`);
}

/**
 * Deletes every downstream row this source produced (events, its
 * memories' provenance, sync runs) plus the connection, but keeps the
 * owner_sources registry row itself (reset to UNAVAILABLE) so the source
 * still appears in the registry as "disconnected" rather than vanishing.
 * Memories that cite ONLY this source's provenance are left in place with
 * their provenance link removed — deleting a memory outright is a
 * separate, explicit "Forget" action (see memories.ts), not an implicit
 * side effect of a source deletion.
 */
export async function deleteSourceData(ctx: OwnerContext, sourceKey: SourceKey): Promise<void> {
  const source = await getSourceByKey(ctx, sourceKey);
  if (!source) return;

  const service = getServiceContext().supabase;
  await service.from("owner_events").delete().eq("owner_id", ctx.ownerId).eq("source_id", source.id);
  await service.from("owner_source_connections").delete().eq("owner_id", ctx.ownerId).eq("source_id", source.id);
  await service.from("owner_sync_runs").delete().eq("owner_id", ctx.ownerId).eq("source_id", source.id);

  const { error } = await ctx.supabase
    .from("owner_sources")
    .update({
      status: "UNAVAILABLE",
      enabled: false,
      last_sync_at: null,
      last_success_at: null,
      sync_cursor: {},
      health: {},
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ctx.ownerId)
    .eq("source_key", sourceKey);
  if (error) throw new Error(`deleteSourceData failed: ${error.message}`);
}

export async function updateSourceStatus(
  ownerId: string,
  sourceId: string,
  patch: Partial<Pick<OwnerSourceRow, "status" | "last_sync_at" | "last_success_at" | "sync_cursor" | "health" | "last_error">>
): Promise<void> {
  const service = getServiceContext().supabase;
  const { error } = await service
    .from("owner_sources")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("id", sourceId);
  if (error) throw new Error(`updateSourceStatus failed: ${error.message}`);
}

export async function startSyncRun(input: {
  ownerId: string;
  sourceId: string;
  trigger: "cron" | "manual" | "backfill";
  cursorBefore: Record<string, unknown>;
}): Promise<string> {
  const service = getServiceContext().supabase;
  const { data, error } = await service
    .from("owner_sync_runs")
    .insert({
      owner_id: input.ownerId,
      source_id: input.sourceId,
      trigger: input.trigger,
      status: "RUNNING",
      cursor_before: input.cursorBefore,
    })
    .select("id")
    .single();
  if (error) throw new Error(`startSyncRun failed: ${error.message}`);
  return data.id as string;
}

export async function completeSyncRun(input: {
  runId: string;
  status: SyncRunStatus;
  eventsIngested: number;
  cursorAfter?: Record<string, unknown>;
  error?: { message: string };
}): Promise<void> {
  const service = getServiceContext().supabase;
  const { error } = await service
    .from("owner_sync_runs")
    .update({
      status: input.status,
      events_ingested: input.eventsIngested,
      cursor_after: input.cursorAfter ?? null,
      error: input.error ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.runId);
  if (error) throw new Error(`completeSyncRun failed: ${error.message}`);
}

/**
 * Called by every connector's OAuth callback (or Notion/GitHub's secret-
 * entry route) once a credential has been verified as real and working.
 * Vaults the secret ref the caller already stored (never the raw
 * secret), marks both the connection and the parent source CONNECTED +
 * enabled, and clears any prior error.
 */
export async function upsertConnection(input: {
  ownerId: string;
  sourceId: string;
  encryptedTokenRef: string;
  scopes: string[];
  providerAccountLabel?: string;
}): Promise<void> {
  const service = getServiceContext().supabase;
  const { data: existing } = await service
    .from("owner_source_connections")
    .select("id")
    .eq("source_id", input.sourceId)
    .maybeSingle();

  if (existing) {
    const { error } = await service
      .from("owner_source_connections")
      .update({
        encrypted_token_ref: input.encryptedTokenRef,
        scopes: input.scopes,
        provider_account_label: input.providerAccountLabel ?? null,
        status: "CONNECTED",
        connected_at: new Date().toISOString(),
        revoked_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(`upsertConnection update failed: ${error.message}`);
  } else {
    const { error } = await service.from("owner_source_connections").insert({
      owner_id: input.ownerId,
      source_id: input.sourceId,
      encrypted_token_ref: input.encryptedTokenRef,
      scopes: input.scopes,
      provider_account_label: input.providerAccountLabel ?? null,
      status: "CONNECTED",
      connected_at: new Date().toISOString(),
    });
    if (error) throw new Error(`upsertConnection insert failed: ${error.message}`);
  }

  await updateSourceStatus(input.ownerId, input.sourceId, { status: "CONNECTED", last_error: null });
  const { error: enableError } = await service.from("owner_sources").update({ enabled: true }).eq("id", input.sourceId);
  if (enableError) throw new Error(`upsertConnection enable failed: ${enableError.message}`);
}

/** Revokes a connection (vault entry deleted by the caller first) and marks the source AUTH_REQUIRED — used by the Privacy Control Center's "disconnect" action. */
export async function revokeConnection(ownerId: string, sourceId: string): Promise<void> {
  const service = getServiceContext().supabase;
  const { error } = await service
    .from("owner_source_connections")
    .update({ status: "REVOKED", revoked_at: new Date().toISOString(), encrypted_token_ref: null })
    .eq("owner_id", ownerId)
    .eq("source_id", sourceId);
  if (error) throw new Error(`revokeConnection failed: ${error.message}`);
  await updateSourceStatus(ownerId, sourceId, { status: "AUTH_REQUIRED" });
}

/** Resolves the honest connector-implemented status without a live connection — used to seed new rows and to explain why a source can't be enabled yet. */
export function resolveStaticStatus(sourceKey: SourceKey): SourceStatus {
  const def = getSourceDefinition(sourceKey);
  if (!def.implemented) return "UNAVAILABLE";
  return "AUTH_REQUIRED";
}
