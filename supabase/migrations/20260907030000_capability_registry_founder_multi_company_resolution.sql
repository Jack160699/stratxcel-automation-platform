-- Registers resolve_client_by_name -- deterministic company-name -> tenantId
-- resolution for staff/Founder multi-company routing (the master brief's own
-- canonical "find leads for my friend's solar company" example). Applied
-- live via Supabase MCP on 2026-09-07; this file makes it reproducible from
-- a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:founder_multi_company_name_resolution',
  'Deterministic company-name -> tenantId resolution for staff/Founder multi-company routing',
  'The master brief''s own canonical example ("find leads for my friend''s solar company") requires Hermes to route a company NAMED in natural language to the correct real tenant, never a guessed one. Found the platform already has the raw capability (list_clients/get_client, already real and staff-permission-gated) but zero instruction telling the model to use it before calling a tenantId-requiring tool, and zero deterministic (non-LLM) matching logic -- meaning a wrong guess could write real data (a mission, a CRM lead) to the wrong real business. Built resolve_client_by_name (packages/agent-core/src/tools/admin/resolve-client.ts): pure, dependency-free string matching (exact case-insensitive match wins outright; substring match only when no exact match exists; multiple/no matches are returned explicitly for the model to ask the user, never silently narrowed to a guess) wrapped as a new ADMIN_READ_TOOLS entry, gated by the same agent:read:clients permission list_clients already uses. Reinforced at two layers: create_mission''s own tool description now points to it, and buildBrainContext''s staff-only system prompt now carries a general "resolve tenantId by name via this tool, never guess" instruction covering every current and future tenantId-taking admin tool.',
  'hermes',
  'Engineering',
  'resolve_client_by_name',
  'read',
  'global',
  'free',
  'read',
  'packages/agent-core/src/__tests__/resolve-client-by-name.test.ts (8 scenarios: exact case-insensitive match on name, exact match on slug, single unambiguous substring match, a near-miss correctly returning no_match rather than a hopeful partial guess, multiple substring matches returned as candidates not silently narrowed, an exact match winning over a broader overlapping substring match, a genuine no-match, empty/whitespace query, zero-candidate input) -- all pass, wired into the tracked test:agent-core npm script. Zero regressions across the full test:agent-core suite (16 files) including brain.test.ts/brain-orchestrator.test.ts which exercise buildBrainContext directly. Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production npm run build (exit 0).',
  'REAL_EXPOSED',
  'Reuses 100% existing infrastructure (the tenants table, the existing agent:read:clients permission, the existing ADMIN_READ_TOOLS registry, the existing runAgentTurn multi-round tool-calling loop) -- no new table, no new adapter, no schema migration. This is the first real piece of the master brief''s "Founder principal model" P1 item: it is what makes ACT-BY-DEFAULT multi-company routing on WhatsApp/Admin Copilot actually safe rather than either refusing to guess (bad UX) or letting the model invent a tenantId (a real cross-tenant-contamination risk). Scope stated precisely: this resolves a company NAME to a tenantId; it does not yet build a persisted "Founder''s active company" default (analogous to the web''s ACTIVE_TENANT_COOKIE) for a channel with no cookie concept like WhatsApp -- each turn re-resolves by name when needed, which is correct and safe, just not yet optimized to remember a prior turn''s resolution across a fresh session.',
  now(),
  'claude_session_2026-09-07'
);
