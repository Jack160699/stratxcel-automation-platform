-- Registers list_leads -- Hermes' third real exposure of an existing
-- StratXcel engine (the CRM) to autonomous missions, and the most directly
-- Sales-relevant one. Applied live via Supabase MCP on 2026-09-07; this
-- file makes it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:hermes_crm_read_exposure',
  'Hermes missions can now read the real CRM pipeline -- list_leads',
  'Third tool in the "expose existing StratXcel systems to Hermes" series (after check_growth_status, check_website_status), and the most directly Sales-relevant: the master brief names GET LEADS -> CONVERT LEADS -> REVENUE as the explicit north star, and a mission previously could only WRITE a lead (create_crm_lead) with no way to READ the existing pipeline first -- meaning it could not check for duplicates before creating one, nor report on pipeline state ("47 leads already qualified"). Added list_leads as Hermes'' 15th tool, reusing listLeads (@stratxcel/leads-and-crm) unmodified -- the exact same real function packages/agent-core/src/tools/admin/read-tools.ts''s own list_leads tool (WhatsApp/Admin Copilot) already calls, querying the real crm_leads table. Input is { limit? } only (1-50, default 20, enforced by the Zod schema itself, not just the handler) -- tenant comes exclusively from the verified mission context.',
  'hermes',
  'Engineering',
  'list_leads',
  'read',
  'tenant',
  'free',
  'read',
  'apps/hermes-gateway/src/__tests__/list-leads.test.ts (3 scenarios): the real listLeads function scopes to the exact tenantId and applies the given limit, the real handler source is confirmed to clamp a model-supplied limit to 50 and pass ctx.tenantId (never an input field) to listLeads, and the real Zod schema itself enforces limit bounds (1-50) and forbids a smuggled tenantId -- three independent layers, not just handler-level trust. Zero regressions across test:hermes-mission-control. Full-repo tsc --noEmit clean on the first pass (mcp-server.ts''s own description map updated in the same commit, applying the Update 74 lesson for the third time running), lint clean, real NODE_ENV=production build (exit 0).',
  'REAL_EXPOSED',
  'Third of the planned series -- see capability:hermes_growth_engine_exposure''s status_notes for the full remaining list and the deliberate scope boundary (no synthetic-principal registry bridging). A natural next step, not done here: a corresponding get_lead (single lead by id) or a real lead-status-update tool, matching create_crm_lead''s own write-side counterpart.',
  now(),
  'claude_session_2026-09-07'
);
