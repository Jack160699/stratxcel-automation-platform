import { getServiceContext } from "../db-context";
import { ingestEvent } from "../repositories/events";
import type { SyncFn } from "./types";

/**
 * Action-prefix denylist — belt-and-suspenders on top of
 * packages/audit's own sanitizeAuditMetadata() (which already redacts any
 * credential-shaped metadata key). This additionally excludes whole
 * categories of action that are money-movement or message-content, not
 * "how the owner works" signal — even sanitized metadata from those is
 * out of scope for a personal operating-brain source.
 */
const EXCLUDED_ACTION_PREFIXES = ["payment", "wallet", "razorpay", "whatsapp.message", "byok", "secret", "subscription.checkout"];

function isAllowedAction(action: string): boolean {
  return !EXCLUDED_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix));
}

/**
 * Reads the platform-wide audit_events table (packages/audit) — agency
 * operational signal (missions, approvals, project status changes), not
 * per-tenant customer content. No OAuth: this is server-to-server against
 * Stratxcel's own database via the service client, so this source is
 * CONNECTED as soon as it's enabled, no connect flow needed.
 */
export const syncStratxcelInternal: SyncFn = async ({ ownerId, sourceId, cursor }) => {
  const service = getServiceContext().supabase;
  const sinceIso = typeof cursor.sinceIso === "string" ? cursor.sinceIso : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await service
    .from("audit_events")
    .select("id, action, target_type, target_id, actor_kind, created_at")
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`stratxcel_internal sync failed: ${error.message}`);

  let ingested = 0;
  let latest = sinceIso;
  for (const row of data ?? []) {
    if (!isAllowedAction(row.action)) continue;
    const { inserted } = await ingestEvent({
      ownerId,
      sourceId,
      externalId: row.id,
      eventType: "admin_action",
      occurredAt: row.created_at,
      payload: { action: row.action, targetType: row.target_type, actorKind: row.actor_kind },
    });
    if (inserted) ingested += 1;
    if (row.created_at > latest) latest = row.created_at;
  }

  return { eventsIngested: ingested, nextCursor: { sinceIso: latest } };
};

/**
 * The owner's own Social Autopilot admin-UI actions (social_audit_events,
 * actor_type='USER') — a distinct, narrower slice from stratxcel_internal
 * (which is agency-wide mission/approval activity).
 */
export const syncStratxcelAdminUi: SyncFn = async ({ ownerId, sourceId, cursor }) => {
  const service = getServiceContext().supabase;
  const sinceIso = typeof cursor.sinceIso === "string" ? cursor.sinceIso : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await service
    .from("social_audit_events")
    .select("id, action, target_type, summary, created_at")
    .eq("actor_type", "USER")
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`stratxcel_admin_ui sync failed: ${error.message}`);

  let ingested = 0;
  let latest = sinceIso;
  for (const row of data ?? []) {
    const { inserted } = await ingestEvent({
      ownerId,
      sourceId,
      externalId: row.id,
      eventType: "admin_action",
      occurredAt: row.created_at,
      payload: { action: row.action, targetType: row.target_type, summaryLength: row.summary?.length ?? 0 },
    });
    if (inserted) ingested += 1;
    if (row.created_at > latest) latest = row.created_at;
  }

  return { eventsIngested: ingested, nextCursor: { sinceIso: latest } };
};
