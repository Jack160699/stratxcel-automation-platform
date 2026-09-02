import { requireTenantReadContext, requireTenantReadPermission } from "@/lib/tenants/tenant-context";
import { diagnoseBusinessGrowth, deriveBottlenecks } from "@stratxcel/workforce-core";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { loadIntegrationsStatusData } from "@/lib/connectors/load-integrations-data";
import { computeRealBusinessSignals } from "@/lib/agent-core/business-signals";
import { computeRealEntitlementSnapshot } from "@/lib/agent-core/business-priorities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/growth/priorities?tenantId=...
 *
 * Customer-facing counterpart to check_business_priorities (the agent tool,
 * Update 38) -- same real pipeline, same real functions, exposed to the
 * customer-facing /app/growth page instead of only WhatsApp/Admin Chat.
 * "Same brain across interfaces" (master brief section 23): a customer
 * asking their Growth page "what's most important" gets the exact same
 * evidence-gated answer a staff member asking Copilot would.
 *
 * Read-only, on the real session client (ctx.supabase) under RLS -- no
 * service-role dependency, matching every other real customer-facing read
 * route in this codebase (see app/api/platform/missions/route.ts's own
 * header comment for the same discipline).
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  requireTenantReadPermission(ctx, "brand_brain:view");

  try {
    const [brandBrainRow, integrations, businessSignalsResult, entitlementSnapshot] = await Promise.all([
      getCurrentBrandBrain(ctx.supabase as never, tenantId),
      loadIntegrationsStatusData(ctx.supabase as never, tenantId),
      computeRealBusinessSignals(ctx.supabase as never, tenantId),
      computeRealEntitlementSnapshot(ctx.supabase as never, tenantId),
    ]);
    const brandBrain = brandBrainRow?.content ?? {};
    const connectedChannels: string[] = [];
    if (integrations.whatsapp === "connected") connectedChannels.push("whatsapp");
    if (integrations.facebook === "connected") connectedChannels.push("facebook");
    if (integrations.instagram === "connected") connectedChannels.push("instagram");
    if (integrations.google === "connected") connectedChannels.push("google");

    const diagnosis = diagnoseBusinessGrowth({
      tenantId,
      missionId: `customer-growth-priorities:${tenantId}`,
      timezone: "UTC",
      currentDateIso: new Date().toISOString(),
      brandBrain,
      productsServices: [],
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

    return Response.json(
      { tenantId, bottlenecks, executiveSummary: diagnosis.executiveSummary },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "priorities_computation_failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
