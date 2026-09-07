import type { ToolName } from "../types.ts";

/**
 * One-line, human-readable description per restricted tool — the only way
 * a model learns what these names mean, since neither adapter gives it
 * anything else to go on. Extracted from http-adapter.ts (where this
 * originated) so native-adapter.ts shares the exact same descriptions
 * instead of hand-maintaining a second copy that could drift.
 */
export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  get_brand_context: "Fetch this tenant's current Brand Brain (voice, offers, facts). No input.",
  get_service_definition: "Fetch this mission's service catalogue entry (label/description). No input.",
  create_draft_artifact: "Save a draft output artifact. Input: { kind, storageRef, metadata? }.",
  update_mission_progress: "Report a human-readable progress update. Input: { message, data? }.",
  request_approval: "Ask a human to approve a sensitive action before taking it. Input: { kind, subject }.",
  get_approval_status: "Check a previously requested approval's status. Input: { approvalId }.",
  create_human_handoff: "Hand this mission off to a human when blocked. Input: { reason, contextSnapshot }.",
  query_publication_status: "Check publication status of a prior Social submission. Input: { reference }. Resolved via Social Department against tenant-scoped publishing jobs/queue (never fabricates status; never returns provider credentials).",
  submit_publish_request: "Not available to Hermes — publishing stays StratExcel-controlled.",
  create_website_change_request: "Not available to Hermes — website changes stay StratExcel-controlled.",
  create_crm_lead: "Record a new CRM lead. Input: { contactName?, contactPhone?, contactEmail?, metadata? }.",
  attach_research_evidence: "Attach a cited source to this mission's research trail. Input: { artifactId, sourceUrl?, summary }.",
  check_growth_status: "Real, currently-stored SEO/AEO/GEO opportunities, recommendations, actions, and measurement snapshots for this mission's tenant -- the same data the Search Growth dashboard shows. Never re-crawls; reads what's already computed. No input.",
};
