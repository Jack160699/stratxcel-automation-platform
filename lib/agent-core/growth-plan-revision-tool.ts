/**
 * revise_growth_plan: the real, confirm-gated write half of the Learning
 * loop (engine:learning_loop) -- closes the loop commit_growth_plan (Update
 * 56) opened: a real, mission-linked plan can now actually be revised from
 * real measured evidence, not just committed once and left static.
 *
 * Deliberately narrow, matching plan-outcomes.ts's own honesty boundary:
 * this tool does NOT compute what should change on its own (no automated
 * attribution/confidence scoring -- packages/workforce-core's
 * OptimizationRecommendation/AttributionLink types exist for that, but a
 * real, evidence-based classifier for THEM is a distinct, larger task, not
 * attempted here). The human (or the model reasoning from check_plan_outcomes'
 * real numbers, confirm-gated before this ever runs) decides what to patch;
 * this tool's own job is narrower: (1) require at least one REAL measured
 * observation exists since the plan was committed (refuses to revise a plan
 * with zero real evidence -- "Revision requires evidence" per
 * packages/workforce-core/src/performance/learning-loop.ts's own header
 * comment), (2) call the real reviseThirtyDayPlan with real evidenceIds
 * drawn from those real observations' own snapshot ids, (3) persist the
 * result as a new, versioned workforce_plans row (previous_plan_id links
 * it to the one it revises -- the schema was already built for exactly
 * this by commit_growth_plan's own migration).
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { reviseThirtyDayPlan, type BusinessGrowthPlan } from "@stratxcel/workforce-core";
import { computePlanOutcomeObservations } from "./plan-outcomes";

function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? process.env.STRATXCEL_PLATFORM_TENANT_ID ?? null;
}

interface PlanRow {
  id: string;
  tenant_id: string;
  mission_id: string;
  version: number;
  planning_horizon: string;
  entitlement_snapshot: unknown;
  capability_snapshot: unknown;
  strategy_payload: BusinessGrowthPlan;
  budget_envelope: unknown;
  created_at: string;
}

export const GROWTH_PLAN_REVISION_TOOL: AgentTool = {
  schema: {
    name: "revise_growth_plan",
    description:
      "Revises an EXISTING committed growth plan (from commit_growth_plan) based on real measured evidence -- persists a new, versioned plan row linked to the one it revises. Requires at least one real measurement to exist since the plan was committed (call check_plan_outcomes first) -- refuses to revise a plan with zero real evidence behind it. Only change fields the human actually agreed should change; never invent a revision speculatively.",
    parameters: {
      type: "object",
      properties: {
        planId: { type: "string", description: "The real workforce_plans id to revise." },
        revisionReason: { type: "string", description: "Why this plan is being revised, grounded in the real measured outcomes (e.g. 'organic traffic down 30% since commit, per check_plan_outcomes')." },
        primaryObjective: { type: "string", description: "Optional -- new primary objective." },
        businessOutcomeTarget: { type: "string", description: "Optional -- new business outcome target." },
        secondaryObjectives: { type: "array", items: { type: "string" }, description: "Optional -- replaces the plan's secondary objectives list." },
        messagingThemes: { type: "array", items: { type: "string" }, description: "Optional -- replaces the plan's messaging themes list." },
        tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." },
      },
      required: ["planId", "revisionReason"],
    },
  },
  mutating: true,
  risk: "external_mutation",
  requiredPermission: "agent:mutate:missions",
  async execute(ctx, args) {
    const tenantId = resolveTenantId(ctx, args);
    const planId = typeof args.planId === "string" ? args.planId : "";
    const revisionReason = typeof args.revisionReason === "string" ? args.revisionReason.trim() : "";
    if (!tenantId || !planId || !revisionReason) return { outcome: "FAILED", reason: "missing_input" };

    const patch: Partial<Pick<BusinessGrowthPlan, "primaryObjective" | "businessOutcomeTarget" | "secondaryObjectives" | "messagingThemes">> = {};
    if (typeof args.primaryObjective === "string" && args.primaryObjective.trim()) patch.primaryObjective = args.primaryObjective.trim();
    if (typeof args.businessOutcomeTarget === "string" && args.businessOutcomeTarget.trim()) patch.businessOutcomeTarget = args.businessOutcomeTarget.trim();
    if (Array.isArray(args.secondaryObjectives)) patch.secondaryObjectives = args.secondaryObjectives.filter((s): s is string => typeof s === "string");
    if (Array.isArray(args.messagingThemes)) patch.messagingThemes = args.messagingThemes.filter((s): s is string => typeof s === "string");
    if (Object.keys(patch).length === 0) return { outcome: "FAILED", reason: "no_patch_fields_provided" };

    const supabase = ctx.supabase as never as {
      from(table: string): {
        select(columns: string): {
          eq(column: string, value: string): { eq(column: string, value: string): { maybeSingle(): Promise<{ data: PlanRow | null }> } };
        };
        insert(row: Record<string, unknown>): { select(columns: string): { single(): Promise<{ data: unknown; error: { message: string } | null }> } };
      };
    };

    const { data: currentRow } = await supabase.from("workforce_plans").select("*").eq("id", planId).eq("tenant_id", tenantId).maybeSingle();
    if (!currentRow) return { outcome: "FAILED", reason: "plan_not_found" };

    let observations;
    try {
      observations = await computePlanOutcomeObservations(ctx.supabase, tenantId, currentRow.created_at);
    } catch (err) {
      return { outcome: "FAILED", reason: err instanceof Error ? err.message : "outcome_read_failed" };
    }
    if (observations.length === 0) {
      return { outcome: "FAILED", reason: "no_measured_outcomes_yet", detail: "Call check_plan_outcomes first -- nothing has been measured since this plan was committed, so it cannot be revised from evidence yet." };
    }
    const evidenceIds = observations.map((o) => o.current.snapshotId);

    let revised: BusinessGrowthPlan;
    try {
      revised = reviseThirtyDayPlan(currentRow.strategy_payload, {
        revisionReason,
        evidenceIds,
        proposedByDepartment: "growth",
        patch,
      });
    } catch (err) {
      return { outcome: "FAILED", reason: err instanceof Error ? err.message : "revision_computation_failed" };
    }

    try {
      const { data: inserted, error } = await supabase
        .from("workforce_plans")
        .insert({
          tenant_id: tenantId,
          mission_id: currentRow.mission_id,
          version: currentRow.version + 1,
          previous_plan_id: currentRow.id,
          planning_horizon: currentRow.planning_horizon,
          objective: revised.primaryObjective,
          business_outcome: revised.businessOutcomeTarget,
          entitlement_snapshot: currentRow.entitlement_snapshot,
          capability_snapshot: currentRow.capability_snapshot,
          strategy_payload: revised,
          budget_envelope: currentRow.budget_envelope,
        })
        .select("id, tenant_id, mission_id, version, previous_plan_id, status, created_at")
        .single();
      if (error) return { outcome: "FAILED", reason: error.message };
      return {
        outcome: "REVISED",
        plan: inserted,
        primaryObjective: revised.primaryObjective,
        businessOutcomeTarget: revised.businessOutcomeTarget,
        evidenceCount: evidenceIds.length,
      };
    } catch (err) {
      return { outcome: "FAILED", reason: err instanceof Error ? err.message : "revision_persist_failed" };
    }
  },
  interpretOutcome(result) {
    const r = result as { outcome?: string; reason?: string } | null;
    if (r?.outcome === "REVISED") return null;
    return { status: "failed", detail: r?.reason };
  },
};
