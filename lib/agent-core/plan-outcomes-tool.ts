/**
 * check_plan_outcomes: the real read-only half of the Learning loop
 * (engine:learning_loop) -- surfaces real measured outcomes since a
 * committed workforce_plans row, via plan-outcomes.ts's
 * computePlanOutcomeObservations (real search_measurement_snapshots
 * GA4/Search Console data, honest missing-baseline handling, never
 * fabricated). Read-only; commits nothing. See revise_growth_plan
 * (growth-plan-revision-tool.ts) for the confirm-gated write half that
 * consumes this same real evidence.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { computePlanOutcomeObservations } from "./plan-outcomes";

function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? process.env.STRATXCEL_PLATFORM_TENANT_ID ?? null;
}

export const CHECK_PLAN_OUTCOMES_TOOL: AgentTool = {
  schema: {
    name: "check_plan_outcomes",
    description:
      "Real measured outcomes since a committed 30-day growth plan (from commit_growth_plan) -- actual GA4/Search Console traffic and search metrics captured since the plan's commit date, compared honestly against the closest snapshot captured before it. Explicitly reports when no baseline exists yet or nothing has been measured since commit -- never invents a comparison. Use for 'did the plan work', 'what changed since we committed this plan', 'check plan results'. Read-only.",
    parameters: {
      type: "object",
      properties: {
        planId: { type: "string", description: "A real workforce_plans id from a prior commit_growth_plan call." },
        tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." },
      },
      required: ["planId"],
    },
  },
  mutating: false,
  risk: "read",
  requiredPermission: "agent:read:missions",
  async execute(ctx, args) {
    const tenantId = resolveTenantId(ctx, args);
    const planId = typeof args.planId === "string" ? args.planId : "";
    if (!tenantId || !planId) return { available: false, reason: "missing_input" };

    const supabase = ctx.supabase as never as {
      from(table: string): {
        select(columns: string): {
          eq(column: string, value: string): { eq(column: string, value: string): { maybeSingle(): Promise<{ data: { id: string; tenant_id: string; created_at: string; objective: string } | null }> } };
        };
      };
    };
    const { data: plan } = await supabase.from("workforce_plans").select("id, tenant_id, created_at, objective").eq("id", planId).eq("tenant_id", tenantId).maybeSingle();
    if (!plan) return { available: false, reason: "plan_not_found" };

    try {
      const observations = await computePlanOutcomeObservations(ctx.supabase, tenantId, plan.created_at);
      return {
        available: true,
        planId: plan.id,
        objective: plan.objective,
        committedAt: plan.created_at,
        observations,
        hasMeasurements: observations.length > 0,
      };
    } catch (err) {
      return { available: false, reason: err instanceof Error ? err.message : "outcome_read_failed" };
    }
  },
};
