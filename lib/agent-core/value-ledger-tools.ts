/**
 * Bridges the now-real, Postgres-backed ValueLedgerService
 * (lib/reporting/value-ledger.ts) into the agent tool registry -- closes
 * capability:monthly_value_ledger_engine, found unwired and in-memory
 * during the final rescan (Update 60), fixed to real DB persistence in the
 * same pass. Two tools, matching the service's own two real operations:
 *
 * - record_service_deliverable: a real, tenant-scoped write -- staff
 *   records a real completed deliverable for a client. low_mutation
 *   (reversible in the sense that a mis-recorded entry can be excluded via
 *   customerVisible; there is no delete path, matching "immutable
 *   deliverables" per the service's own header comment).
 * - get_monthly_value_report: real, read-only aggregation of a tenant's
 *   recorded deliverables for a cycle month -- the same
 *   generateMonthlyValueReport a real "26th Monthly Work & Value Report"
 *   delivery would use, callable on demand.
 *
 * MonthlyRenewalEngine (lib/billing/monthly-cycle.ts), which composes this
 * service with plan-proposal generation into a fuller renewal recap
 * package, is deliberately NOT bridged here -- its own generatedRecapCache
 * is still an in-memory Map, and building a real caller for the full
 * renewal-recap flow (versus just the value ledger itself) is a distinct,
 * larger piece of work than this pass's scope.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { valueLedgerService } from "@/lib/reporting/value-ledger";

function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? process.env.STRATXCEL_PLATFORM_TENANT_ID ?? null;
}

function currentCycleMonth(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

export const RECORD_SERVICE_DELIVERABLE_TOOL: AgentTool = {
  schema: {
    name: "record_service_deliverable",
    description:
      "Records a real, immutable deliverable/outcome receipt for a client into the Value Ledger -- e.g. 'published 3 SEO articles', 'fixed 5 technical issues', 'grew organic traffic 20%'. Feeds get_monthly_value_report. Use only for work actually completed, never speculatively.",
    parameters: {
      type: "object",
      properties: {
        serviceKey: { type: "string", description: "Short service area key, e.g. 'seo', 'social', 'website', 'crm'." },
        deliverableTitle: { type: "string", description: "Short title of what was delivered." },
        deliverableSummary: { type: "string", description: "One or two sentences describing the deliverable." },
        resultMetric: { type: "string", description: "Optional -- a real metric name this deliverable moved, e.g. 'organic_traffic'." },
        resultValue: { type: "string", description: "Optional -- the real value/change for that metric, e.g. '+20%'." },
        cycleMonth: { type: "string", description: "Optional -- 'YYYY-MM'. Defaults to the current month." },
        tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." },
      },
      required: ["serviceKey", "deliverableTitle", "deliverableSummary"],
    },
  },
  mutating: true,
  risk: "low_mutation",
  requiredPermission: "agent:mutate:missions",
  async execute(ctx, args) {
    const tenantId = resolveTenantId(ctx, args);
    const serviceKey = typeof args.serviceKey === "string" ? args.serviceKey.trim() : "";
    const deliverableTitle = typeof args.deliverableTitle === "string" ? args.deliverableTitle.trim() : "";
    const deliverableSummary = typeof args.deliverableSummary === "string" ? args.deliverableSummary.trim() : "";
    if (!tenantId || !serviceKey || !deliverableTitle || !deliverableSummary) {
      return { outcome: "FAILED", reason: "missing_input" };
    }
    const cycleMonth = typeof args.cycleMonth === "string" && args.cycleMonth ? args.cycleMonth : currentCycleMonth();

    try {
      const recorded = await valueLedgerService.recordDeliverable({
        tenantId,
        cycleMonth,
        serviceKey,
        deliverableTitle,
        deliverableSummary,
        resultMetric: typeof args.resultMetric === "string" ? args.resultMetric : undefined,
        resultValue: typeof args.resultValue === "string" ? args.resultValue : undefined,
      });
      return { outcome: "RECORDED", id: recorded.id, cycleMonth: recorded.cycleMonth };
    } catch (err) {
      return { outcome: "FAILED", reason: err instanceof Error ? err.message : "record_failed" };
    }
  },
  interpretOutcome(result) {
    const r = result as { outcome?: string; reason?: string } | null;
    if (r?.outcome === "RECORDED") return null;
    return { status: "failed", detail: r?.reason };
  },
};

export const GET_MONTHLY_VALUE_REPORT_TOOL: AgentTool = {
  schema: {
    name: "get_monthly_value_report",
    description:
      "Real, aggregated monthly Work & Value report for a client -- what was delivered, key outcomes, and any recorded metric results, compiled from real record_service_deliverable entries for that cycle month. Use for 'what did we deliver this month', 'prove our value', 'monthly recap'. Read-only.",
    parameters: {
      type: "object",
      properties: {
        cycleMonth: { type: "string", description: "Optional -- 'YYYY-MM'. Defaults to the current month." },
        tenantId: { type: "string", description: "Optional -- a specific client's tenant id. Defaults to Stratxcel's own." },
      },
    },
  },
  mutating: false,
  risk: "read",
  requiredPermission: "agent:read:missions",
  async execute(ctx, args) {
    const tenantId = resolveTenantId(ctx, args);
    if (!tenantId) return { available: false, reason: "no_tenant_resolved" };
    const cycleMonth = typeof args.cycleMonth === "string" && args.cycleMonth ? args.cycleMonth : currentCycleMonth();
    try {
      const report = await valueLedgerService.generateMonthlyValueReport(tenantId, cycleMonth);
      return { available: true, report };
    } catch (err) {
      return { available: false, reason: err instanceof Error ? err.message : "report_generation_failed" };
    }
  },
};

export const VALUE_LEDGER_TOOLS: AgentTool[] = [RECORD_SERVICE_DELIVERABLE_TOOL, GET_MONTHLY_VALUE_REPORT_TOOL];
