/**
 * Shared real BusinessGrowthPlannerInput assembly -- extracted from
 * business-priorities-tool.ts (Update 38) so check_business_priorities and
 * the new preview_growth_plan tool (Update 55, planBusinessGrowth) call
 * exactly one implementation, not two that could drift. Every field is
 * built from a real source (computeRealBusinessSignals,
 * computeRealEntitlementSnapshot, getCurrentBrandBrain,
 * loadIntegrationsStatusData) or is an honest, clearly-inert placeholder
 * for a field diagnoseBusinessGrowth/deriveBottlenecks never read (see
 * business-priorities-tool.ts's own header comment for the full
 * confirmation of which fields those are).
 */
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { loadIntegrationsStatusData } from "@/lib/connectors/load-integrations-data";
import { computeRealBusinessSignals } from "./business-signals";
import { computeRealEntitlementSnapshot } from "./business-priorities";
import type { BusinessGrowthPlannerInput } from "@stratxcel/workforce-core";

const CONNECTED_STATE = "connected";

export async function assembleBusinessGrowthPlannerInput(
  supabase: unknown,
  tenantId: string,
  missionId: string,
): Promise<BusinessGrowthPlannerInput> {
  const [brandBrainRow, integrations, businessSignalsResult, entitlementSnapshot] = await Promise.all([
    getCurrentBrandBrain(supabase as never, tenantId),
    loadIntegrationsStatusData(supabase as never, tenantId),
    computeRealBusinessSignals(supabase as never, tenantId),
    computeRealEntitlementSnapshot(supabase as never, tenantId),
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

  return {
    tenantId,
    missionId,
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
  };
}
