import { getServiceContext, type OwnerContext } from "../db-context";
import type { ConfirmationState, MemoryFeedbackAction, MemoryType } from "../types";

export interface OwnerMemoryRow {
  id: string;
  owner_id: string;
  category: string;
  statement: string;
  memory_type: MemoryType;
  confidence: number;
  first_observed_at: string;
  last_observed_at: string;
  confirmation_state: ConfirmationState;
  superseded_by: string | null;
  correction_history: Array<{ at: string; from: string; to: string; action: MemoryFeedbackAction }>;
  retention_policy: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMemoryInput {
  ownerId: string;
  category: string;
  statement: string;
  memoryType: MemoryType;
  confidence: number;
  confirmationState: ConfirmationState;
  expiresAt?: string | null;
  provenance: { eventId?: string; sourceId?: string; note?: string };
}

/** Always writes with the service client — memory candidates are produced by background jobs, not by the owner's own browser session. */
export async function createMemory(input: CreateMemoryInput): Promise<string> {
  const service = getServiceContext().supabase;
  const { data, error } = await service
    .from("owner_memories")
    .insert({
      owner_id: input.ownerId,
      category: input.category,
      statement: input.statement,
      memory_type: input.memoryType,
      confidence: input.confidence,
      confirmation_state: input.confirmationState,
      expires_at: input.expiresAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createMemory failed: ${error.message}`);
  const memoryId = data.id as string;

  await service.from("owner_memory_sources").insert({
    memory_id: memoryId,
    event_id: input.provenance.eventId ?? null,
    source_id: input.provenance.sourceId ?? null,
    note: input.provenance.note ?? null,
  });

  return memoryId;
}

/** Bumps last_observed_at + optionally nudges confidence upward — used when a dedupe match finds repeated corroborating evidence rather than creating a duplicate memory. */
export async function reinforceMemory(memoryId: string, confidenceDelta: number): Promise<void> {
  const service = getServiceContext().supabase;
  const { data: row, error: readError } = await service.from("owner_memories").select("confidence").eq("id", memoryId).single();
  if (readError) throw new Error(`reinforceMemory read failed: ${readError.message}`);
  const nextConfidence = Math.min(1, Number(row.confidence) + confidenceDelta);
  const { error } = await service
    .from("owner_memories")
    .update({ last_observed_at: new Date().toISOString(), confidence: nextConfidence, updated_at: new Date().toISOString() })
    .eq("id", memoryId);
  if (error) throw new Error(`reinforceMemory failed: ${error.message}`);
}

export interface ListMemoriesFilter {
  category?: string;
  memoryType?: MemoryType;
  confirmationState?: ConfirmationState;
  search?: string;
  limit?: number;
}

export async function listMemories(ctx: OwnerContext, filter: ListMemoriesFilter = {}): Promise<OwnerMemoryRow[]> {
  return listMemoriesForOwner(ctx.supabase, ctx.ownerId, filter);
}

/** Service-role variant for background jobs (memory dedupe, Hermes retrieval) that have an ownerId but no browser session/OwnerContext. */
export async function listMemoriesForOwner(
  supabase: ReturnType<typeof getServiceContext>["supabase"],
  ownerId: string,
  filter: ListMemoriesFilter = {}
): Promise<OwnerMemoryRow[]> {
  let query = supabase
    .from("owner_memories")
    .select("*")
    .eq("owner_id", ownerId)
    .is("superseded_by", null)
    .order("last_observed_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.category) query = query.eq("category", filter.category);
  if (filter.memoryType) query = query.eq("memory_type", filter.memoryType);
  if (filter.confirmationState) query = query.eq("confirmation_state", filter.confirmationState);
  if (filter.search) query = query.ilike("statement", `%${filter.search}%`);
  const { data, error } = await query;
  if (error) throw new Error(`listMemories failed: ${error.message}`);
  return (data ?? []) as OwnerMemoryRow[];
}

export async function getMemoryProvenance(ctx: OwnerContext, memoryId: string) {
  const { data, error } = await ctx.supabase
    .from("owner_memory_sources")
    .select("id, event_id, source_id, note, created_at, owner_sources(display_name, source_key)")
    .eq("memory_id", memoryId);
  if (error) throw new Error(`getMemoryProvenance failed: ${error.message}`);
  return data ?? [];
}

/**
 * The one write path for Accept / Correct / Forget / Mark temporary /
 * Mark wrong. FORGET does a real delete (cascades to owner_memory_sources
 * and owner_memory_feedback via FK) rather than a soft flag — "Forget"
 * has to actually mean forget. Every other action keeps the row and
 * appends to correction_history so a later review can see how a memory
 * evolved.
 */
export async function applyMemoryFeedback(
  ctx: OwnerContext,
  input: { memoryId: string; action: MemoryFeedbackAction; newStatement?: string }
): Promise<void> {
  const { data: existing, error: readError } = await ctx.supabase
    .from("owner_memories")
    .select("statement, correction_history")
    .eq("id", input.memoryId)
    .eq("owner_id", ctx.ownerId)
    .single();
  if (readError) throw new Error(`applyMemoryFeedback read failed: ${readError.message}`);

  await ctx.supabase.from("owner_memory_feedback").insert({
    memory_id: input.memoryId,
    owner_id: ctx.ownerId,
    action: input.action,
    previous_statement: existing.statement,
    new_statement: input.newStatement ?? null,
  });

  if (input.action === "FORGET") {
    const { error } = await ctx.supabase.from("owner_memories").delete().eq("id", input.memoryId).eq("owner_id", ctx.ownerId);
    if (error) throw new Error(`applyMemoryFeedback forget failed: ${error.message}`);
    return;
  }

  const history = [
    ...((existing.correction_history as Array<Record<string, unknown>>) ?? []),
    { at: new Date().toISOString(), from: existing.statement, to: input.newStatement ?? existing.statement, action: input.action },
  ];

  const patch: Record<string, unknown> = { correction_history: history, updated_at: new Date().toISOString() };
  if (input.action === "ACCEPT") patch.confirmation_state = "CONFIRMED";
  if (input.action === "MARK_WRONG") patch.confirmation_state = "REJECTED";
  if (input.action === "CORRECT" && input.newStatement) patch.statement = input.newStatement;
  if (input.action === "MARK_TEMPORARY") patch.expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await ctx.supabase.from("owner_memories").update(patch).eq("id", input.memoryId).eq("owner_id", ctx.ownerId);
  if (error) throw new Error(`applyMemoryFeedback failed: ${error.message}`);
}

/** Run by the retention-cleanup job: expired TEMPORARY_CONTEXT memories are deleted outright (they were never meant to persist), everything else is left untouched — decay is opt-in per memory type, never a blanket TTL. */
export async function deleteExpiredMemories(): Promise<number> {
  const service = getServiceContext().supabase;
  const { data, error } = await service
    .from("owner_memories")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .not("expires_at", "is", null)
    .select("id");
  if (error) throw new Error(`deleteExpiredMemories failed: ${error.message}`);
  return data?.length ?? 0;
}
