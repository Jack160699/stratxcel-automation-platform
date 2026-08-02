import { getCurrentBrandBrain, getBrandBrainVersion, type ServiceClient as BrandBrainClient } from "@stratxcel/brand-brain";
import { getServiceCatalogueEntry, type MissionRow } from "@stratxcel/missions";
import { missionToContextInput, type MissionScopedContext, type ToolName } from "./types.ts";

const DEFAULT_TOOL_ALLOWLIST: ToolName[] = [
  "get_brand_context",
  "get_service_definition",
  "create_draft_artifact",
  "update_mission_progress",
  "request_approval",
  "get_approval_status",
  "create_human_handoff",
  "query_publication_status",
  "create_crm_lead",
  "attach_research_evidence",
];

/**
 * submit_publish_request and create_website_change_request are
 * deliberately excluded from the default allowlist — publishing and
 * production deployment "remain StratExcel-controlled actions" per the
 * master brief, so Hermes only gets those two tools when a mission's
 * compiled service explicitly requires them (a future refinement; for now
 * every mission gets the same restricted default set, which already
 * excludes the two highest-blast-radius tools).
 */
export async function compileMissionContext(
  supabase: BrandBrainClient,
  mission: MissionRow
): Promise<MissionScopedContext> {
  const base = missionToContextInput(mission);

  let brandBrain = null;
  if (mission.brand_brain_version) {
    const version = await getBrandBrainVersion(supabase, mission.tenant_id, mission.brand_brain_version);
    brandBrain = version?.content ?? null;
  } else {
    const current = await getCurrentBrandBrain(supabase, mission.tenant_id);
    brandBrain = current?.content ?? null;
  }

  return {
    ...base,
    brandBrain,
    allowedTools: DEFAULT_TOOL_ALLOWLIST,
  };
}

export function getServiceDefinitionForContext(serviceKey: string | null) {
  if (!serviceKey) return null;
  return getServiceCatalogueEntry(serviceKey) ?? null;
}
