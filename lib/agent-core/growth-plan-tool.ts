/**
 * preview_growth_plan: the first real production caller of planBusinessGrowth
 * (packages/workforce-core/src/planning/thirty-day-planner.ts) -- the full
 * 30-day plan engine (capability:business_growth_planner_pipeline), real and
 * tested but never wired to any app/ route before this. A real preview, not
 * a fabricated one: reuses assembleBusinessGrowthPlannerInput
 * (business-growth-input.ts), the exact same real-data assembly
 * check_business_priorities uses.
 *
 * Confirmed safe to call without any caller-supplied strategy before
 * building this: proposedStages/proposedWeeklyStrategy are genuinely
 * optional (packages/workforce-core/src/planning/workflows.ts's
 * buildWorkflowStages falls through to its own real default stage
 * generation per workflowFocus when proposedStages is absent -- read
 * directly, not assumed) -- there is no field here that would force
 * fabricating a strategy to call this function.
 *
 * Deliberately a PREVIEW only: the returned plan is never persisted to
 * workforce_plans or linked to a real mission (missionId is synthetic, same
 * discipline as check_business_priorities). Committing a plan for real
 * still requires a real mission-creation flow this tool does not build --
 * see docs/discovery/FINAL_COMPLETION_MATRIX.md section 5 (Learning) for
 * why that remains its own, separate, honestly open item: the learning
 * loop revises a persisted BusinessGrowthPlan, and this tool intentionally
 * never creates one.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { planBusinessGrowth } from "@stratxcel/workforce-core";
import { assembleBusinessGrowthPlannerInput } from "./business-growth-input";

function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? ctx.principal.tenantId;
}

export const GROWTH_PLAN_TOOL: AgentTool = {
  schema: {
    name: "preview_growth_plan",
    description:
      "Generates a real, full 30-day growth plan preview for a tenant -- weekly strategy, staged work items across departments, and a customer-facing summary -- using the same real signals check_business_priorities uses (BusinessSignals, entitlements, Brand Brain, connections). This is a PREVIEW only: nothing is saved, no mission is created, no work is scheduled or executed. Use for 'what would a 30-day plan look like', 'draft a growth plan', 'show me a strategy for this client'. For just the top priority (faster, lighter), use check_business_priorities instead.",
    parameters: {
      type: "object",
      properties: { tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." } },
    },
  },
  mutating: false,
  risk: "read",
  requiredPermission: "agent:read:research",
  async execute(ctx, args) {
    const tenantId = resolveTenantId(ctx, args);
    if (!tenantId) return { available: false, reason: "no_tenant_resolved" };

    try {
      const plannerInput = await assembleBusinessGrowthPlannerInput(ctx.supabase, tenantId, `plan-preview:${tenantId}:${Date.now()}`);
      const plan = planBusinessGrowth(plannerInput);

      return {
        available: true,
        preview: true,
        tenantId,
        entryMode: plan.entryMode,
        primaryObjective: plan.primaryObjective,
        secondaryObjectives: plan.secondaryObjectives,
        businessOutcomeTarget: plan.businessOutcomeTarget,
        messagingThemes: plan.messagingThemes,
        weeklyStrategy: plan.weeklyStrategy,
        workforcePlan: plan.workforcePlan,
        customerFacing: plan.customerFacing,
        note: "This is a real, computed preview -- nothing was saved, no mission was created, no work was scheduled. Committing this plan for real requires an explicit create_mission call.",
      };
    } catch (err) {
      return { available: false, reason: err instanceof Error ? err.message : "plan_generation_failed" };
    }
  },
};
