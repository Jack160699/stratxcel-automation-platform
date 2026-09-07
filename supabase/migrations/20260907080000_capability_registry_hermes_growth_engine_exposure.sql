-- Registers check_growth_status -- Hermes' first real exposure of an
-- existing StratXcel business engine (the Growth/Priority Engine) to
-- autonomous missions, reusing listSearchState (@stratxcel/search-discovery)
-- unmodified. Applied live via Supabase MCP on 2026-09-07; this file makes
-- it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:hermes_growth_engine_exposure',
  'Hermes missions can now read the real Growth/Priority Engine -- check_growth_status',
  'The master brief repeatedly names "expose existing StratXcel systems to Hermes" (Brand Brain, Growth Engine, Website Factory, Social Autopilot, ...) as a required integration layer. Checked the actual state: Hermes'' own restricted tool vocabulary (packages/hermes/src/tools/contracts.ts) had exactly 12 names, none of them touching the real Growth/Priority/SEO/AEO/GEO engine that WhatsApp/Admin Copilot staff already reach via check_growth_status (lib/agent-core/growth-media-tools.ts). A Hermes mission built today (Native Hermes adapter) could reason and call StratExcel-controlled meta-tools (create_crm_lead, request_approval, ...) but had zero visibility into the platform''s own real business intelligence -- a genuine, concrete instance of the "expose existing systems" gap, not a hypothetical one. Added check_growth_status as a 13th Hermes tool: real contract (contracts.ts), real Zod schema (schemas.ts, z.object({}).strict() -- no input, so a model cannot smuggle a tenantId; the verified mission context is the only source), real JSON function-calling schema (json-schemas.ts, for the native adapter), and a real handler (apps/hermes-gateway/src/tool-handlers.ts) that calls listSearchState (@stratxcel/search-discovery) UNMODIFIED -- the exact same real function the WhatsApp/Copilot version and the Search Growth dashboard itself already call, not a reimplementation. Added to context.ts''s DEFAULT_TOOL_ALLOWLIST, so every mission gets it by default (read-only, no risk).',
  'hermes',
  'Engineering',
  'check_growth_status',
  'read',
  'tenant',
  'free',
  'read',
  'apps/hermes-gateway/src/__tests__/check-growth-status.test.ts (2 scenarios): the real Zod schema structurally rejects any model-supplied tenantId (proving the mission''s own verified tenant context is the only possible source, not a smuggled argument), and the real listSearchState function (not a stand-in) scopes every one of its 6 real queries to the exact tenantId passed in. tsc --noEmit caught a real, would-have-shipped-broken defect: apps/hermes-gateway/src/mcp-server.ts keeps its own separate, hand-maintained McpCallableName description map for the http/MCP transport, which the new tool name was initially missing from -- fixed in the same commit, confirming why the full-repo typecheck step is non-negotiable even for a change that looked contained to 5 files. Zero regressions across test:hermes-mission-control, test:agent-core-lib, and worker-safety.test.ts. Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production build (exit 0).',
  'REAL_EXPOSED',
  'First of what should become several: the same pattern (contract + schema + description + json-schema + a real handler reusing an existing agent-core tool''s own underlying function, never a reimplementation) is how the rest of "expose existing systems to Hermes" should be closed -- website status, creative/image generation, CRM reads, etc. -- one real, reviewed, tested tool at a time, not a wholesale registry-bridging rewrite. Deliberately did not attempt the larger, riskier alternative (giving native-mode missions direct access to packages/agent-core''s full ADMIN_READ_TOOLS/ADMIN_MUTATION_TOOLS/ALL_EXTRA_TOOLS registry via a synthetic principal) -- that would bypass the existing mission-token/capability-boundary security model Hermes was deliberately built with, a real architecture change warranting its own deliberate review, not a side effect of a Resource-Manager pass.',
  now(),
  'claude_session_2026-09-07'
);
