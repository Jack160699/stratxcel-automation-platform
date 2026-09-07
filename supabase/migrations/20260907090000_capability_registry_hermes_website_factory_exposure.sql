-- Registers check_website_status -- Hermes' second real exposure of an
-- existing StratXcel engine (the Website Factory) to autonomous missions.
-- Applied live via Supabase MCP on 2026-09-07; this file makes it
-- reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:hermes_website_factory_exposure',
  'Hermes missions can now read the real Website Factory -- check_website_status',
  'Second real tool in the "expose existing StratXcel systems to Hermes" series (after capability:hermes_growth_engine_exposure). Added check_website_status as Hermes'' 14th tool: real contract, real Zod schema (z.object({}).strict(), no input -- the mission''s own verified tenant is the only possible source), real JSON function-calling schema, and a real handler (apps/hermes-gateway/src/tool-handlers.ts) that queries the real site_projects table with the exact same columns lib/agent-core/growth-media-tools.ts''s own check_website_status tool and the Admin Website page already read -- no new package dependency needed, a direct table query matching the existing pattern. Added to context.ts''s DEFAULT_TOOL_ALLOWLIST.',
  'hermes',
  'Engineering',
  'check_website_status',
  'read',
  'tenant',
  'free',
  'read',
  'apps/hermes-gateway/src/__tests__/check-website-status.test.ts (3 scenarios): the real schema structurally rejects a smuggled tenantId, the real handler source is confirmed to query site_projects scoped to ctx.tenantId (never an input field), and the select().eq().order() query-chain shape is exercised correctly. Applied the lesson from the prior tool (capability:hermes_growth_engine_exposure): checked and updated apps/hermes-gateway/src/mcp-server.ts''s own separate hand-maintained tool-description map in the same pass, so tsc caught zero missing-property errors this time. Zero regressions across test:hermes-mission-control. Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production build (exit 0).',
  'REAL_EXPOSED',
  'Second of the planned series -- see capability:hermes_growth_engine_exposure''s own status_notes for the full list of what remains (creative/image generation, CRM reads, ...) and why the broader synthetic-principal registry-bridging approach was deliberately not taken.',
  now(),
  'claude_session_2026-09-07'
);
