/**
 * Real agent tool wrapping computeRealBusinessSignals (business-signals.ts).
 * Read-only, tenant-scoped exactly like check_connections/check_growth_status
 * (growth-media-tools.ts) -- same resolveTenantId discipline: a client
 * principal always gets their own tenant; staff may pass a specific
 * tenantId or default to Stratxcel's own.
 *
 * Deliberately does NOT call diagnoseBusinessGrowth/deriveBottlenecks
 * (packages/workforce-core/src/planning/diagnosis.ts) here: their shared
 * input type, BusinessGrowthPlannerInput, also requires a real
 * entitlementSnapshot with a full AllocationPolicy -- billing/allocation
 * data this tool has no honest source for. Fabricating one to satisfy the
 * type would violate the same "real data or nothing" rule this classifier
 * exists to uphold. Wiring the full diagnosis pipeline into a production
 * route belongs with the mission-creation flow that already owns a real
 * entitlementSnapshot, not here. This tool exposes exactly what it can
 * honestly compute: the BusinessSignals themselves.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { computeRealBusinessSignals } from "./business-signals.ts";

function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? ctx.principal.tenantId;
}

export const BUSINESS_SIGNALS_TOOL: AgentTool = {
  schema: {
    name: "check_business_signals",
    description:
      "Real, evidence-backed business health signals for a tenant -- website presence, search visibility, CRM follow-up strength, monthly inquiry volume, and post-contact conversion strength -- computed live from site_projects, search_opportunities, and crm_leads. Every populated field carries a real row id as evidence; fields with no real data source (ad spend, response-time-to-first-contact, lead-capture-form completion, analytics attribution, social presence) are honestly omitted rather than guessed. Use for 'what do we actually know about this client's business', 'is their CRM follow-up healthy', 'do they have open search visibility problems'.",
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
    const { signals, sourceCounts } = await computeRealBusinessSignals(ctx.supabase as never, tenantId);
    const populatedFields = Object.keys(signals).filter((k) => k !== "signalEvidenceIds");
    return {
      tenantId,
      signals,
      sourceCounts,
      note:
        populatedFields.length === 0
          ? "No real signal could be computed yet -- this tenant has no site_projects, search_opportunities, or crm_leads rows."
          : `${populatedFields.length} of 11 possible signal fields computed from real data; the rest have no honest data source yet and are omitted.`,
    };
  },
};
