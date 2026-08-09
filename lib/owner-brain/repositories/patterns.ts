import { getServiceContext, type OwnerContext } from "../db-context";

export async function upsertCommunicationPattern(input: {
  ownerId: string;
  patternType: string;
  description: string;
  evidence: unknown[];
  confidence: number;
  sampleCount: number;
}): Promise<void> {
  const service = getServiceContext().supabase;
  const { data: existing } = await service
    .from("owner_communication_patterns")
    .select("id")
    .eq("owner_id", input.ownerId)
    .eq("pattern_type", input.patternType)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (existing) {
    await service
      .from("owner_communication_patterns")
      .update({
        description: input.description,
        evidence: input.evidence,
        confidence: input.confidence,
        sample_count: input.sampleCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return;
  }

  await service.from("owner_communication_patterns").insert({
    owner_id: input.ownerId,
    pattern_type: input.patternType,
    description: input.description,
    evidence: input.evidence,
    confidence: input.confidence,
    sample_count: input.sampleCount,
  });
}

export async function listCommunicationPatterns(ctx: OwnerContext) {
  const { data, error } = await ctx.supabase
    .from("owner_communication_patterns")
    .select("*")
    .eq("owner_id", ctx.ownerId)
    .eq("status", "ACTIVE")
    .order("confidence", { ascending: false });
  if (error) throw new Error(`listCommunicationPatterns failed: ${error.message}`);
  return data ?? [];
}

export async function setCommunicationPatternStatus(
  ctx: OwnerContext,
  input: { patternId: string; status: "ACTIVE" | "CORRECTED" | "FORGOTTEN" }
): Promise<void> {
  const { error } = await ctx.supabase
    .from("owner_communication_patterns")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("id", input.patternId)
    .eq("owner_id", ctx.ownerId);
  if (error) throw new Error(`setCommunicationPatternStatus failed: ${error.message}`);
}

export async function recordWorkPattern(input: {
  ownerId: string;
  patternType: string;
  description: string;
  evidence: unknown[];
  confidence: number;
  periodStart: string;
  periodEnd: string;
}): Promise<void> {
  const service = getServiceContext().supabase;
  const { error } = await service.from("owner_work_patterns").insert({
    owner_id: input.ownerId,
    pattern_type: input.patternType,
    description: input.description,
    evidence: input.evidence,
    confidence: input.confidence,
    period_start: input.periodStart,
    period_end: input.periodEnd,
  });
  if (error) throw new Error(`recordWorkPattern failed: ${error.message}`);
}

export async function listWorkPatterns(ctx: OwnerContext, limit = 20) {
  const { data, error } = await ctx.supabase
    .from("owner_work_patterns")
    .select("*")
    .eq("owner_id", ctx.ownerId)
    .order("period_end", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listWorkPatterns failed: ${error.message}`);
  return data ?? [];
}
