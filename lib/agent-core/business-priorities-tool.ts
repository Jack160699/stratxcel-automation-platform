/**
 * check_business_priorities: the real BusinessSignals -> diagnoseBusinessGrowth
 * -> deriveBottlenecks pipeline (packages/workforce-core/src/planning/
 * diagnosis.ts), wired to real inputs for the first time -- answers "what is
 * the most important thing to do next" from actual signals, not a prompt-only
 * guess. Real input assembly now lives in business-growth-input.ts
 * (assembleBusinessGrowthPlannerInput), shared with preview_growth_plan
 * (growth-plan-tool.ts, Update 55) so both call exactly one implementation.
 *
 * diagnoseBusinessGrowth/deriveBottlenecks never read productsServices,
 * targetAudience (beyond brand brain's own target_audience field, wired for
 * real), businessGoals, previousPerformance, activeCampaigns,
 * availableCapabilities, budgetEnvelope, missionId, or timezone -- confirmed
 * by reading their source directly. Those fields exist only because they
 * share BusinessGrowthPlannerInput's type with the much heavier
 * planBusinessGrowth (thirty-day-planner.ts), which THIS tool deliberately
 * does not call (preview_growth_plan does, separately, as its own explicit
 * capability). assembleBusinessGrowthPlannerInput fills them with honest,
 * clearly-inert placeholders (empty arrays/strings, a zeroed
 * MissionBudgetEnvelope) -- never fabricated data that could influence this
 * tool's diagnosis, since none of it is read by the functions this tool
 * actually calls.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { diagnoseBusinessGrowth, deriveBottlenecks, decideAutonomyLevel, type RiskLevel } from "@stratxcel/workforce-core";
import { assembleBusinessGrowthPlannerInput } from "./business-growth-input";

const BOTTLENECK_SEVERITY_TO_RISK: Record<string, RiskLevel> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "low",
};

function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? ctx.principal.tenantId;
}

export const BUSINESS_PRIORITIES_TOOL: AgentTool = {
  schema: {
    name: "check_business_priorities",
    description:
      "The real, evidence-gated business growth diagnosis and prioritized bottleneck list for a tenant -- answers 'what is the most important thing to do next' from actual signals (real BusinessSignals + real subscription/entitlement data + real Brand Brain + real connection state), never a guess. Every finding without real evidence is honestly marked ASSUMPTION or RESEARCH_REQUIRED, never presented as certain. Also returns missionRecommendation -- a real governance decision (AUTO/LOW_RISK_APPROVAL/OWNER_APPROVAL/BLOCKED) on whether the top priority is worth turning into a mission, plus a real suggested goalText -- but never creates anything itself; call create_mission separately if the human agrees. For the full 30-day plan (weekly strategy, staged work items), use preview_growth_plan instead. Use for 'what should we do next for this client', 'what's the biggest bottleneck', 'prioritize this business', 'should we create a mission for this'.",
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

    // Synthetic, non-persisted -- this is a read-only diagnostic call, not
    // a funded mission. Never written to the missions table, never read by
    // diagnoseBusinessGrowth/deriveBottlenecks.
    const plannerInput = await assembleBusinessGrowthPlannerInput(ctx.supabase, tenantId, `priority-check:${tenantId}`);
    const diagnosis = diagnoseBusinessGrowth(plannerInput);
    const bottlenecks = deriveBottlenecks(diagnosis);
    const topPriority = bottlenecks[0] ?? null;

    // Master brief section 14 (Hermes/Missions integration): "the Brain
    // should be able to determine when a mission should be created."
    // create_mission (packages/agent-core/src/tools/client/tools.ts and
    // admin/mutation-tools.ts) already exists, already real, already
    // confirm-gated (risk: "external_mutation") -- the missing piece was
    // never mission creation itself, it was connecting a real priority to a
    // real governance decision about whether creating one makes sense.
    // decideAutonomyLevel (Update 39) does exactly that, composed here with
    // the top bottleneck's own real severity/confidence -- never invents a
    // cost estimate (omitted, honestly unknown at this stage) and never
    // creates anything itself; a human or agent turn still calls
    // create_mission separately with this description as the goalText.
    const missionRecommendation = topPriority
      ? {
          suggestedGoalText: topPriority.description,
          decision: decideAutonomyLevel({
            executable: true,
            riskLevel: BOTTLENECK_SEVERITY_TO_RISK[topPriority.severity] ?? "medium",
            approvalRequired: false,
            externalMutation: true,
            confidence: topPriority.confidence,
            reversible: true, // missions can be cancelled (mission:cancel)
          }),
        }
      : null;

    return {
      tenantId,
      entryMode: diagnosis.entryMode,
      executiveSummary: diagnosis.executiveSummary,
      strongestAssets: diagnosis.strongestAssets,
      researchGaps: diagnosis.researchGaps,
      findings: diagnosis.findings,
      bottlenecks,
      topPriority,
      missionRecommendation,
      note:
        bottlenecks.length === 0
          ? "No prioritized bottleneck could be derived -- likely too little real signal data yet (no site_projects/search_opportunities/crm_leads/subscription rows for this tenant). This is an honest 'not enough evidence' result, not an error."
          : `${bottlenecks.length} real, evidence-gated bottleneck(s) found, ranked by priorityScore. Highest: ${bottlenecks[0]!.description}`,
    };
  },
};
