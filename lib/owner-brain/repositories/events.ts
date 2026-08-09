import { getServiceContext, type OwnerContext } from "../db-context";
import type { OwnerEventType } from "../types";

export interface NormalizedEventInput {
  ownerId: string;
  sourceId: string;
  externalId: string;
  eventType: OwnerEventType;
  occurredAt: string;
  /** Bounded, redacted projection only — the adapter must strip bodies/secrets before this is called. */
  payload: Record<string, unknown>;
  rawRef?: string;
}

/**
 * Idempotent by (source_id, external_id) — re-running a sync over an
 * already-ingested page of results is always safe. Returns false (no
 * throw) on a duplicate so callers can count "new vs already-seen"
 * without treating the conflict as a failure.
 */
export async function ingestEvent(input: NormalizedEventInput): Promise<{ inserted: boolean; eventId: string | null }> {
  const service = getServiceContext().supabase;
  const { data, error } = await service
    .from("owner_events")
    .upsert(
      {
        owner_id: input.ownerId,
        source_id: input.sourceId,
        external_id: input.externalId,
        event_type: input.eventType,
        occurred_at: input.occurredAt,
        payload: input.payload,
        raw_ref: input.rawRef ?? null,
      },
      { onConflict: "source_id,external_id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`ingestEvent failed: ${error.message}`);
  return { inserted: Boolean(data), eventId: (data?.id as string) ?? null };
}

export async function addEventEntity(input: {
  eventId: string;
  entityType: "person" | "project" | "decision" | "task" | "mood" | "topic" | "tool";
  entityValue: string;
  confidence?: number;
}): Promise<void> {
  const service = getServiceContext().supabase;
  const { error } = await service.from("owner_event_entities").insert({
    event_id: input.eventId,
    entity_type: input.entityType,
    entity_value: input.entityValue,
    confidence: input.confidence ?? 0.5,
  });
  if (error) throw new Error(`addEventEntity failed: ${error.message}`);
}

export async function listRecentEvents(
  ctx: OwnerContext,
  opts: { eventType?: OwnerEventType; sinceIso?: string; limit?: number } = {}
) {
  let query = ctx.supabase
    .from("owner_events")
    .select("*")
    .eq("owner_id", ctx.ownerId)
    .order("occurred_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.eventType) query = query.eq("event_type", opts.eventType);
  if (opts.sinceIso) query = query.gte("occurred_at", opts.sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(`listRecentEvents failed: ${error.message}`);
  return data ?? [];
}
