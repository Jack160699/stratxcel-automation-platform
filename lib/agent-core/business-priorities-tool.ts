/**
 * check_business_priorities: the real BusinessSignals -> diagnoseBusinessGrowth
 * -> deriveBottlenecks pipeline (packages/workforce-core/src/planning/
 * diagnosis.ts), wired to real inputs for the first time -- answers "what is
 * the most important thing to do next" from actual signals, not a prompt-only
 * guess. Reuses every canonical engine that already exists rather than
 * duplicating: getCurrentBrandBrain (@stratxcel/brand-brain),
 * loadIntegrationsStatusData (lib/connectors/load-integrations-data.ts, the
 * same engine check_connections already uses), computeRealBusinessSignals
 * and computeRealEntitlementSnapshot (this session's own new classifiers).
 *
 * diagnoseBusinessGrowth/deriveBottlenecks never read productsServices,
 * targetAudience (beyond brand brain's own target_audience field, wired for
 * real), businessGoals, previousPerformance, activeCampaigns,
 * availableCapabilities, budgetEnvelope, missionId, or timezone -- confirmed
 * by reading their source directly. Those fields exist only because they
 * share BusinessGrowthPlannerInput's type with the much heavier
 * planBusinessGrowth (thirty-day-planner.ts), which this tool deliberately
 * does NOT call. They are filled with honest, clearly-inert placeholders
 * (empty arrays/strings, a synthetic non-persisted missionId, a
 * zeroed MissionBudgetEnvelope) below -- never fabricated data that could
 * influence the diagnosis, since none of it is read by the functions this
 * tool actually calls.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { diagnoseBusinessGrowth, deriveBottlenecks } from "@stratxcel/workforce-core";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { loadIntegrationsStatusData } from "@/lib/connectors/load-integrations-data";
import { computeRealBusinessSignals } from "./business-signals";
import { computeRealEntitlementSnapshot } from "./business-priorities";

function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? ctx.principal.tenantId;
}

const CONNECTED_STATE = "connected";

export const BUSINESS_PRIORITIES_TOOL: AgentTool = {
  schema: {
    name: "check_business_priorities",
    description:
      "The real, evidence-gated business growth diagnosis and prioritized bottleneck list for a tenant -- answers 'what is the most important thing to do next' from actual signals (real BusinessSignals + real subscription/entitlement data + real Brand Brain + real connection state), never a guess. Every finding without real evidence is honestly marked ASSUMPTION or RESEARCH_REQUIRED, never presented as certain. Use for 'what should we do next for this client', 'what's the biggest bottleneck', 'prioritize this business'.",
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

    const [brandBrainRow, integrations, businessSignalsResult, entitlementSnapshot] = await Promise.all([
      getCurrentBrandBrain(ctx.supabase as never, tenantId),
      loadIntegrationsStatusData(ctx.supabase as never, tenantId),
      computeRealBusinessSignals(ctx.supabase as never, tenantId),
      computeRealEntitlementSnapshot(ctx.supabase as never, tenantId),
    ]);

    const brandBrain = brandBrainRow?.content ?? {};
    const connectedChannels: string[] = [];
    if (integrations.whatsapp === CONNECTED_STATE) connectedChannels.push("whatsapp");
    if (integrations.facebook === CONNECTED_STATE) connectedChannels.push("facebook");
    if (integrations.instagram === CONNECTED_STATE) connectedChannels.push("instagram");
    if (integrations.youtube === CONNECTED_STATE) connectedChannels.push("youtube");
    if (integrations.google === CONNECTED_STATE) connectedChannels.push("google");
    if (integrations.google_analytics === CONNECTED_STATE) connectedChannels.push("google_analytics");
    if (integrations.google_search_console === CONNECTED_STATE) connectedChannels.push("google_search_console");
    if (integrations.threads === CONNECTED_STATE) connectedChannels.push("threads");
    if (integrations.linkedin === CONNECTED_STATE) connectedChannels.push("linkedin");

    const diagnosis = diagnoseBusinessGrowth({
      tenantId,
      // Synthetic, non-persisted -- this is a read-only diagnostic call, not
      // a funded mission. Never written to the missions table, never read by
      // diagnoseBusinessGrowth/deriveBottlenecks.
      missionId: `priority-check:${tenantId}`,
      timezone: "UTC",
      currentDateIso: new Date().toISOString(),
      brandBrain,
      productsServices: (brandBrain.services ?? brandBrain.products ?? []).map((s) => s.name).filter(Boolean),
      targetAudience: brandBrain.target_audience ?? "",
      geography: "",
      positioning: "",
      connectedChannels,
      businessGoals: [],
      previousPerformance: [],
      existingResearchEvidence: [],
      activeCampaigns: [],
      availableCapabilities: [],
      entitlementSnapshot,
      budgetEnvelope: { estimatedCents: null, reservedCents: 0, actualCents: null },
      businessSignals: businessSignalsResult.signals,
    });

    const bottlenecks = deriveBottlenecks(diagnosis);

    return {
      tenantId,
      entryMode: diagnosis.entryMode,
      executiveSummary: diagnosis.executiveSummary,
      strongestAssets: diagnosis.strongestAssets,
      researchGaps: diagnosis.researchGaps,
      findings: diagnosis.findings,
      bottlenecks,
      topPriority: bottlenecks[0] ?? null,
      note:
        bottlenecks.length === 0
          ? "No prioritized bottleneck could be derived -- likely too little real signal data yet (no site_projects/search_opportunities/crm_leads/subscription rows for this tenant). This is an honest 'not enough evidence' result, not an error."
          : `${bottlenecks.length} real, evidence-gated bottleneck(s) found, ranked by priorityScore. Highest: ${bottlenecks[0]!.description}`,
    };
  },
};
