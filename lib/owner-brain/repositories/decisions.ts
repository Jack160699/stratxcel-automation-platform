import type { OwnerContext } from "../db-context";

export interface CreateDecisionInput {
  title: string;
  projectDomain?: string;
  decisionDate?: string;
  alternatives?: Array<{ label: string; pros?: string; cons?: string }>;
  statedReason?: string;
  expectedResult?: string;
  confidence?: number;
  relatedEvidence?: Array<{ label: string; eventId?: string; url?: string }>;
}

export async function createDecision(ctx: OwnerContext, input: CreateDecisionInput): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("owner_decisions")
    .insert({
      owner_id: ctx.ownerId,
      title: input.title,
      project_domain: input.projectDomain ?? null,
      decision_date: input.decisionDate ?? new Date().toISOString().slice(0, 10),
      alternatives: input.alternatives ?? [],
      stated_reason: input.statedReason ?? null,
      expected_result: input.expectedResult ?? null,
      confidence: input.confidence ?? null,
      related_evidence: input.relatedEvidence ?? [],
    })
    .select("id")
    .single();
  if (error) throw new Error(`createDecision failed: ${error.message}`);

  if (input.alternatives?.length) {
    await ctx.supabase.from("owner_decision_options").insert(
      input.alternatives.map((alt) => ({
        decision_id: data.id,
        label: alt.label,
        pros: alt.pros ?? null,
        cons: alt.cons ?? null,
      }))
    );
  }

  return data.id as string;
}

export async function listDecisions(ctx: OwnerContext, opts: { limit?: number; status?: string } = {}) {
  let query = ctx.supabase
    .from("owner_decisions")
    .select("*, owner_decision_options(*), owner_decision_outcomes(*)")
    .eq("owner_id", ctx.ownerId)
    .order("decision_date", { ascending: false })
    .limit(opts.limit ?? 25);
  if (opts.status) query = query.eq("status", opts.status);
  const { data, error } = await query;
  if (error) throw new Error(`listDecisions failed: ${error.message}`);
  return data ?? [];
}

export async function recordDecisionOutcome(
  ctx: OwnerContext,
  input: { decisionId: string; outcomeSummary: string; successRating?: number; notes?: string }
): Promise<void> {
  const { error } = await ctx.supabase.from("owner_decision_outcomes").insert({
    decision_id: input.decisionId,
    outcome_summary: input.outcomeSummary,
    success_rating: input.successRating ?? null,
    notes: input.notes ?? null,
  });
  if (error) throw new Error(`recordDecisionOutcome failed: ${error.message}`);
}

export async function reverseDecision(ctx: OwnerContext, input: { decisionId: string; reason: string; lesson?: string }): Promise<void> {
  const { error } = await ctx.supabase
    .from("owner_decisions")
    .update({
      status: "REVERSED",
      reversed_at: new Date().toISOString(),
      reversed_reason: input.reason,
      lesson: input.lesson ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.decisionId)
    .eq("owner_id", ctx.ownerId);
  if (error) throw new Error(`reverseDecision failed: ${error.message}`);
}

/**
 * Repeated-trade-off / recurring-mistake analytics computed on read
 * (no separate materialized table) — cheap at this data volume (one
 * owner, hundreds not millions of decisions) and always fresh.
 */
export async function computeDecisionAnalytics(ctx: OwnerContext) {
  const { data, error } = await ctx.supabase
    .from("owner_decisions")
    .select("id, project_domain, status, confidence, decision_date, owner_decision_outcomes(success_rating)")
    .eq("owner_id", ctx.ownerId);
  if (error) throw new Error(`computeDecisionAnalytics failed: ${error.message}`);
  const rows = data ?? [];
  const reversedCount = rows.filter((r) => r.status === "REVERSED").length;
  const byDomain = new Map<string, number>();
  for (const r of rows) {
    const key = r.project_domain ?? "unspecified";
    byDomain.set(key, (byDomain.get(key) ?? 0) + 1);
  }
  return {
    totalDecisions: rows.length,
    reversedCount,
    reversedRate: rows.length ? reversedCount / rows.length : 0,
    byDomain: Object.fromEntries(byDomain),
  };
}
