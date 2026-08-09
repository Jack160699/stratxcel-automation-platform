import { getServiceContext, type OwnerContext } from "../db-context";

export interface OpenLoopInput {
  item: string;
  loopOwner?: string;
  dueDate?: string | null;
  sourceId?: string | null;
  eventId?: string | null;
  nextStep?: string;
}

export async function createOpenLoop(ownerId: string, input: OpenLoopInput): Promise<string> {
  const service = getServiceContext().supabase;
  const { data, error } = await service
    .from("owner_open_loops")
    .insert({
      owner_id: ownerId,
      item: input.item,
      loop_owner: input.loopOwner ?? null,
      due_date: input.dueDate ?? null,
      source_id: input.sourceId ?? null,
      event_id: input.eventId ?? null,
      next_step: input.nextStep ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createOpenLoop failed: ${error.message}`);
  return data.id as string;
}

export async function listOpenLoops(ctx: OwnerContext, status: "OPEN" | "DONE" | "DROPPED" | "ALL" = "OPEN") {
  return listOpenLoopsForOwner(ctx.supabase, ctx.ownerId, status);
}

/** Service-role variant for background jobs (night-review draft, morning planner) that have an ownerId but no browser session. */
export async function listOpenLoopsForOwner(
  supabase: ReturnType<typeof getServiceContext>["supabase"],
  ownerId: string,
  status: "OPEN" | "DONE" | "DROPPED" | "ALL" = "OPEN"
) {
  let query = supabase
    .from("owner_open_loops")
    .select("*, owner_sources(display_name)")
    .eq("owner_id", ownerId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (status !== "ALL") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(`listOpenLoops failed: ${error.message}`);
  return data ?? [];
}

export async function setOpenLoopStatus(ctx: OwnerContext, loopId: string, status: "OPEN" | "DONE" | "DROPPED"): Promise<void> {
  const { error } = await ctx.supabase
    .from("owner_open_loops")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", loopId)
    .eq("owner_id", ctx.ownerId);
  if (error) throw new Error(`setOpenLoopStatus failed: ${error.message}`);
}
