/**
 * check_revenue_diagnostics: the first real production caller of
 * packages/revenue-ops's runRevenueWorkflow (previously REAL_NOT_EXPOSED --
 * see capability:revenue_ops_workflow_pipeline, called only by its own test
 * suite). Wires real leads (crm_leads), real message timing and consent
 * (whatsapp_messages, contact_consent), and real Brand Brain services
 * (getCurrentBrandBrain) into the full response-time -> lead intelligence ->
 * qualification -> CRM follow-up plan -> WhatsApp sequence draft ->
 * conversion diagnosis -> human-handoff pipeline. Read-only: runRevenueWorkflow
 * itself never sends anything or writes to the CRM (productionMutations and
 * sendAttempts are always returned empty by its own design) -- this tool
 * only drafts and diagnoses.
 *
 * Two real inputs are honestly NOT sourced here and are left for
 * runRevenueWorkflow's own optional-field handling: `events` for
 * diagnoseConversion (no analytics-conversion-event table has been verified
 * yet -- conversion diagnosis will honestly report no data rather than
 * fabricate a conversion rate) and conversationByLeadId's automationMode/
 * insideSessionWindow/approvedTemplates (a different subsystem not traced in
 * this pass). Both are confirmed-optional fields in their respective types,
 * never silently defaulted to something invented.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { runRevenueWorkflow } from "@stratxcel/revenue-ops";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { computeRealLeadRows, computeRealMessageDerivedFacts, computeRealConsentByLeadId } from "./revenue-diagnostics";

function resolveTenantId(ctx: { principal: { kind: string; tenantId: string | null } }, args: Record<string, unknown>): string | null {
  if (ctx.principal.kind === "client") return ctx.principal.tenantId;
  const argTenantId = typeof args.tenantId === "string" && args.tenantId ? args.tenantId : null;
  return argTenantId ?? ctx.principal.tenantId;
}

export const REVENUE_DIAGNOSTICS_TOOL: AgentTool = {
  schema: {
    name: "check_revenue_diagnostics",
    description:
      "Real revenue/CRM diagnosis for a tenant: response-time performance, per-lead intelligence, qualification, drafted CRM follow-up plans, drafted WhatsApp follow-up sequences, and human-handoff recommendations -- all computed from real crm_leads, whatsapp_messages, and contact_consent rows. Read-only: nothing is sent or written, everything returned is a draft/diagnosis for review. Use for 'how is our lead response time', 'diagnose our CRM', 'draft follow-ups for open leads', 'which leads need a human'.",
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

    const leads = await computeRealLeadRows(ctx.supabase as never, tenantId);
    if (leads.length === 0) {
      return { tenantId, available: true, note: "No crm_leads rows for this tenant yet -- nothing to diagnose.", leadCount: 0 };
    }

    const [{ timingSamples, latestInboundBodyByLeadId }, consentByLeadId, brandBrainRow] = await Promise.all([
      computeRealMessageDerivedFacts(
        ctx.supabase as never,
        tenantId,
        leads.map((l) => ({ id: l.id, status: l.status, created_at: l.created_at, next_follow_up_at: l.next_follow_up_at })),
      ),
      computeRealConsentByLeadId(ctx.supabase as never, tenantId),
      getCurrentBrandBrain(ctx.supabase as never, tenantId),
    ]);

    const consentInput: Record<string, { optedIn: boolean | null; optedOut: boolean; provenance: string | null }> = {};
    for (const [leadId, c] of Object.entries(consentByLeadId)) consentInput[leadId] = c;

    const offeredServices = (brandBrainRow?.content.services ?? brandBrainRow?.content.products ?? [])
      .map((s) => s.name)
      .filter(Boolean);

    const result = runRevenueWorkflow({
      tenantId,
      leads,
      timingSamples,
      consentByLeadId: consentInput,
      latestCustomerMessageByLeadId: latestInboundBodyByLeadId,
      businessContext: offeredServices.length > 0 ? { offeredServices } : undefined,
    });

    return {
      tenantId,
      available: true,
      leadCount: leads.length,
      responseTimeDiagnosis: result.response,
      qualifications: result.qualifications,
      followUpPlans: result.followUpPlans,
      whatsappSequenceDrafts: result.whatsappSequences,
      conversionDiagnosis: result.conversion,
      handoffRecommendations: result.handoffs,
      audit: result.audit,
      note:
        "responseTimeDiagnosis, qualifications, and followUpPlans are computed from real crm_leads/whatsapp_messages/contact_consent evidence. whatsappSequenceDrafts are drafts only -- nothing was sent (sendAttempts is always empty). conversionDiagnosis has no real analytics-event source wired yet, so it will honestly report no data rather than a fabricated rate.",
    };
  },
};
