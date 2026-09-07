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
  check_website_status: "Real, currently-stored Stratxcel-built websites for this mission's tenant -- name, slug, status (draft/live/etc.), custom domain, framework, template, timestamps. The same data the Website page's list reads. No input.",
  list_leads: "Real CRM leads for this mission's tenant, most recent first -- check before creating a new lead with create_crm_lead to avoid duplicates, or to report on the current pipeline. Input: { limit? } (default 20, max 50).",
  get_lead: "Get a single real CRM lead by id (tenant-scoped) -- use a leadId from a prior list_leads or create_crm_lead call, never invent one. Input: { leadId }.",
  generate_image: "Generate a real, brand-grounded image/poster/creative using Stratxcel's existing image engine -- real cost (checked against this mission's own budget before every call, on top of the tenant's own real monthly AI budget), real brand context. One brief per call. Only call when the goal genuinely requires an image, never speculatively. Input: { brief, aspectRatio? } (e.g. '1:1', '4:5', '9:16'; defaults to '1:1').",
  check_domain_status: "Real live domain status for a website's custom domain: real public DNS records (A/CNAME/AAAA/nameservers, read-only, no changes made) AND Vercel's own verification/SSL status. Use a domain from a prior check_website_status result. Input: { domain }.",
  remember_company_fact: "Save a durable, company-scoped fact this mission found (e.g. 'verified_supplier_1: SolarTech Bhilai, quoted Rs 42/watt, 2-week delivery') so future missions and WhatsApp/Admin Copilot for this same company can recall it later -- call recall_company_memory first to avoid duplicating an existing key. Only for real, verified findings -- never a guess or an unconfirmed assumption dressed up as a fact. Input: { key, value } (key <=120 chars, value <=1200 chars).",
  recall_company_memory: "Recall this mission's tenant's durable company memory -- prior verified facts saved by this or earlier missions, or by WhatsApp/Admin Copilot. Call before researching something that may already be known, and before remember_company_fact to avoid saving a duplicate key. No input.",
};
