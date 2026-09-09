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
  create_website: "Create a new website from scratch -- initializes project shell, generates code via Antigravity, sets up GitHub repo and Vercel preview. Input: { businessName?, purpose?, designPreference?, domain? }.",
  list_leads: "Real CRM leads for this mission's tenant, most recent first -- check before creating a new lead with create_crm_lead to avoid duplicates, or to report on the current pipeline. Input: { limit? } (default 20, max 50).",
  get_lead: "Get a single real CRM lead by id (tenant-scoped) -- use a leadId from a prior list_leads or create_crm_lead call, never invent one. Input: { leadId }.",
  generate_image: "Generate a real, brand-grounded image/poster/creative using Stratxcel's existing image engine -- real cost (checked against this mission's own budget before every call, on top of the tenant's own real monthly AI budget), real brand context. One brief per call. Only call when the goal genuinely requires an image, never speculatively. Input: { brief, aspectRatio? } (e.g. '1:1', '4:5', '9:16'; defaults to '1:1').",
  check_domain_status: "Real live domain status for a website's custom domain: real public DNS records (A/CNAME/AAAA/nameservers, read-only, no changes made) AND Vercel's own verification/SSL status. Use a domain from a prior check_website_status result. Input: { domain }.",
  remember_company_fact: "Save a durable, company-scoped fact this mission found (e.g. 'verified_supplier_1: SolarTech Bhilai, quoted Rs 42/watt, 2-week delivery') so future missions and WhatsApp/Admin Copilot for this same company can recall it later -- call recall_company_memory first to avoid duplicating an existing key. Always set confidence honestly (FACT/VERIFIED/OBSERVATION/INFERENCE/PREFERENCE/EXPERIMENT/UNKNOWN) -- never omit it to make an unconfirmed assumption look like a verified fact; omitting it defaults to UNKNOWN, not FACT. Input: { key, value, confidence? } (key <=120 chars, value <=1200 chars).",
  recall_company_memory: "Recall this mission's tenant's durable company memory -- prior verified facts saved by this or earlier missions, or by WhatsApp/Admin Copilot. Call before researching something that may already be known, and before remember_company_fact to avoid saving a duplicate key. No input.",
  update_lead_status: "Move a real CRM lead to a new pipeline status -- tenant-scoped, and the lead must already exist for this tenant (use a leadId from a prior list_leads or get_lead call, never invent one). status must be exactly one of NEW, CONTACTED, QUALIFIED, WON, LOST. Input: { leadId, status }.",
  browser_navigate: "Navigate the Founder Computer browser environment to a designated URL. Input: { url, sessionKey?, timeoutMs?, waitUntil? }.",
  browser_click: "Click a button, link, or element by CSS selector or coordinates. Input: { selector?, coordinates?, button?, clickCount?, sessionKey? }.",
  browser_type: "Type text into an input field or active element. NEVER used for passwords. Input: { selector?, text, delayMs?, clearExisting?, sessionKey? }.",
  browser_key: "Press a keyboard key (e.g. Enter, Tab, ArrowDown, Escape). Input: { key, count?, sessionKey? }.",
  browser_scroll: "Scroll the browser viewport in a direction (up, down, top, bottom). Input: { direction, amount?, sessionKey? }.",
  browser_select: "Select a dropdown option by value. Input: { selector, value, sessionKey? }.",
  browser_wait: "Wait for a selector, navigation, network idle, or timeout. Input: { condition, target?, timeoutMs?, sessionKey? }.",
  browser_read: "Extract text or HTML content from the active page or element. Input: { selector?, mode?, maxChars?, sessionKey? }.",
  browser_screenshot: "Capture a full-page or element screenshot from the Founder Computer browser. Input: { fullPage?, selector?, quality?, sessionKey? }.",
  browser_upload: "Upload a file to a file input element. Input: { selector, fileRef, sessionKey? }.",
  browser_download: "Trigger a file download by clicking an element and capture the file. Input: { triggerSelector, destinationPath?, sessionKey? }.",
  browser_tabs: "List, create, close, or switch browser tabs. Input: { action: 'list'|'new'|'close'|'switch', tabIndex?, url?, sessionKey? }.",
  computer_open_app: "Launch or open a desktop application. Input: { appName, args? }.",
  computer_click: "Perform a desktop mouse click. Input: { x?, y?, selector?, button? }.",
  computer_type: "Type text into the active desktop window. Input: { text }.",
  computer_key: "Press a desktop keyboard key or shortcut. Input: { key, modifiers? }.",
  computer_screenshot: "Capture a desktop screenshot. Input: { fullScreen? }.",
  computer_wait: "Wait for a specified duration in milliseconds. Input: { ms }.",
  discover_capabilities: "Discover all verified capabilities across connected providers (Google Founder Browser, Google AI Pro, Claude, etc.). Input: { providerFilter?, refresh? }.",
  get_capability_status: "Inspect the current live status, health, and requirements of a specific capability. Input: { capabilityKey, connectorKey? }.",
  select_best_resource: "Evaluate candidate providers/resources for a task capability and select the best legitimate execution path with fallbacks. Input: { capabilityKey, requireAutonomous? }.",
  execute_capability: "Execute a capability through the authorized connector control plane. Input: { capabilityKey, payload?, connectorKey? }.",
  get_resource_health: "Check the health and connection status of an underlying connector resource. Input: { connectorKey }.",
  execute_core_mcp: "Execute a capability across the Core Six Fleet (AWS, Meta, Supabase, Vercel, GitHub, Google). Input: { capabilityKey, payload?, targetEnvironment? }.",
  route_natural_language_command: "Decompose and route a natural language instruction across the Core Six Fleet. Input: { query, confirmedByFounder? }.",
};
