import { getServiceContext, type OwnerContext } from "../db-context";

export async function createRecommendation(input: {
  ownerId: string;
  kind: string;
  statement: string;
  evidence: unknown[];
  confidence: number;
  relatedMemoryId?: string;
}): Promise<string> {
  const service = getServiceContext().supabase;
  const { data, error } = await service
    .from("owner_recommendations")
    .insert({
      owner_id: input.ownerId,
      kind: input.kind,
      statement: input.statement,
      evidence: input.evidence,
      confidence: input.confidence,
      related_memory_id: input.relatedMemoryId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createRecommendation failed: ${error.message}`);
  return data.id as string;
}

export async function listRecommendations(ctx: OwnerContext, status: "PENDING" | "ALL" = "PENDING") {
  let query = ctx.supabase.from("owner_recommendations").select("*").eq("owner_id", ctx.ownerId).order("created_at", { ascending: false });
  if (status !== "ALL") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(`listRecommendations failed: ${error.message}`);
  return data ?? [];
}

export async function resolveRecommendation(
  ctx: OwnerContext,
  input: { recommendationId: string; status: "ACCEPTED" | "REJECTED" | "CORRECTED" }
): Promise<void> {
  const { error } = await ctx.supabase
    .from("owner_recommendations")
    .update({ status: input.status, resolved_at: new Date().toISOString() })
    .eq("id", input.recommendationId)
    .eq("owner_id", ctx.ownerId);
  if (error) throw new Error(`resolveRecommendation failed: ${error.message}`);
}
