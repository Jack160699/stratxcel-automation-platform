/**
 * commit_growth_plan: the first real write to workforce_plans anywhere in
 * this codebase (confirmed by repo-wide grep before building this: the
 * table's only prior reference was a tenant-offboarding delete path, never
 * an INSERT). Closes the real remaining piece of capability:preview_growth_plan_tool
 * and the upstream dependency for engine:learning_loop -- persisting a real,
 * mission-linked BusinessGrowthPlan so a future revision cycle has
 * something real to revise.
 *
 * Deliberately requires a real, already-existing missionId -- never creates
 * one itself. Mission creation stays create_mission's own job (already
 * real, already confirm-gated). This tool only persists the plan
 * planBusinessGrowth computes for that real mission, using the exact same
 * real input assembly check_business_priorities and preview_growth_plan
 * already use (assembleBusinessGrowthPlannerInput).
 *
 * A real tenant-isolation check runs before any write: the supplied
 * missionId's own tenant_id must match the resolved caller tenant, or the
 * write is refused outright -- never silently reassigned to "whichever
 * tenant the plan was computed for" instead.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { planBusinessGrowth } from "@stratxcel/workforce-core";
import { getMission } from "@stratxcel/missions";
import { assembleBusinessGrowthPlannerInput } from "./business-growth-input";

function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? ctx.principal.tenantId;
}

export const GROWTH_PLAN_COMMIT_TOOL: AgentTool = {
  schema: {
    name: "commit_growth_plan",
    description:
      "Persists a real 30-day growth plan (weekly strategy, staged work items) for an EXISTING real mission -- writes a real workforce_plans row for the first time in this system. Requires a real missionId from a prior create_mission call; never creates a mission itself. Recomputes the plan fresh from real current signals (does not reuse a stale preview_growth_plan result). Use only after the human has explicitly agreed to commit a plan, not speculatively.",
    parameters: {
      type: "object",
      properties: {
        missionId: { type: "string", description: "A real mission id from a prior create_mission call. Never invent one." },
        tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." },
      },
      required: ["missionId"],
    },
  },
  mutating: true,
  // Comparable real-world weight to create_mission itself (external_mutation,
  // confirm-gated on every channel) -- this durably commits a real business
  // strategy record, not a read-only preview.
  risk: "external_mutation",
  requiredPermission: "agent:mutate:missions",
  async execute(ctx, args) {
    const tenantId = resolveTenantId(ctx, args);
    const missionId = typeof args.missionId === "string" ? args.missionId : "";
    if (!tenantId || !missionId) return { outcome: "FAILED", reason: "missing_input" };

    let mission;
    try {
      mission = await getMission(ctx.supabase as never, missionId);
    } catch (err) {
      return { outcome: "FAILED", reason: `mission_not_found: ${err instanceof Error ? err.message : "unknown_error"}` };
    }
    if (mission.tenant_id !== tenantId) {
      return { outcome: "FAILED", reason: "mission_tenant_mismatch" };
    }

    try {
      const plannerInput = await assembleBusinessGrowthPlannerInput(ctx.supabase, tenantId, missionId);
      const plan = planBusinessGrowth(plannerInput);

      const { data: inserted, error } = await (ctx.supabase as never as {
        from(table: string): {
          insert(row: Record<string, unknown>): { select(columns: string): { single(): Promise<{ data: unknown; error: { message: string } | null }> } };
        };
      })
        .from("workforce_plans")
        .insert({
          tenant_id: tenantId,
          mission_id: missionId,
          objective: plan.primaryObjective,
          business_outcome: plan.businessOutcomeTarget,
          entitlement_snapshot: plannerInput.entitlementSnapshot,
          capability_snapshot: plannerInput.availableCapabilities,
          strategy_payload: {
            entryMode: plan.entryMode,
            secondaryObjectives: plan.secondaryObjectives,
            messagingThemes: plan.messagingThemes,
            weeklyStrategy: plan.weeklyStrategy,
            workforcePlan: plan.workforcePlan,
            customerFacing: plan.customerFacing,
            bottlenecks: plan.bottlenecks,
          },
          budget_envelope: plannerInput.budgetEnvelope,
        })
        .select("id, tenant_id, mission_id, version, status, created_at")
        .single();

      if (error) return { outcome: "FAILED", reason: error.message };

      return {
        outcome: "COMMITTED",
        plan: inserted,
        primaryObjective: plan.primaryObjective,
        businessOutcomeTarget: plan.businessOutcomeTarget,
      };
    } catch (err) {
      return { outcome: "FAILED", reason: err instanceof Error ? err.message : "plan_commit_failed" };
    }
  },
  interpretOutcome(result) {
    const r = result as { outcome?: string; reason?: string } | null;
    if (r?.outcome === "COMMITTED") return null;
    return { status: "failed", detail: r?.reason };
  },
};
