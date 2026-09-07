-- Registers the missing write half of the Agent Factory's disable/enable
-- safety property: setAgentDefinitionStatus + set_agent_definition_status
-- (lib/agent-core/agent-definitions.ts, agent-factory-tools.ts). Applied
-- live via Supabase MCP on 2026-09-07; this file makes it reproducible from
-- a fresh database. No table/schema migration needed -- agent_definitions
-- already allows status='disabled' and already grants UPDATE to
-- service_role (see 20260902530000_agent_definitions.sql).

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:agent_factory_disable_enable',
  'Agent Factory: real disable/re-enable for dynamically-created agents',
  'capability:agent_factory_dynamic_composition (Update 61) shipped real agent creation/listing but was honestly recorded as v1-scoped: "create/list only (no edit/disable tool yet)". Checked resolveAgentDispatch (agent-dispatch.ts) and found the READ half of the safety property already real: it refuses to dispatch any agent whose status is not exactly "active". But nothing in the codebase could ever actually SET a row to "disabled" -- agent_definitions.status has allowed the value since its very first migration, but the check was structurally unreachable in practice; a misbehaving or mistakenly-created dynamic agent had no real off switch. Built the missing write half: setAgentDefinitionStatus (lib/agent-core/agent-definitions.ts, a real UPDATE against the existing agent_definitions table -- already granted to service_role, no new migration needed for the table itself) and set_agent_definition_status (lib/agent-core/agent-factory-tools.ts), gated by the same agent:mutate:agent_definitions permission (platform_owner only) create_agent_definition already uses -- disabling another agent''s dispatch surface is the same meta-governance action as creating one.',
  'hermes',
  'Engineering',
  'set_agent_definition_status',
  'write',
  'global',
  'free',
  'low_mutation',
  'lib/agent-core/__tests__/agent-factory-status.test.ts (3 scenarios, all executable and real -- no mocked-away logic): setAgentDefinitionStatus updates the real row, returns null (not a throw) for an unknown key, and -- the actual safety property, not just a field flipping in isolation -- disabling an agent makes the real resolveAgentDispatch function (the exact one WhatsApp/Admin Copilot both call on every dispatch) refuse it end-to-end, with re-enabling restoring it through the same real path. Found and fixed a second real instance of the exact defect class Update 71 found (an extensionless relative import that resolves under Next.js''s bundler but throws ERR_MODULE_NOT_FOUND under plain node) in agent-dispatch.ts -- two lines, scoped narrowly rather than fixing the wider, pre-existing extensionless-import convention across all of lib/agent-core/''s ~15 other files with the same style, which this one change did not take on. The new tool wrapper itself (set_agent_definition_status) is verified via tsc --noEmit + a real NODE_ENV=production build (which does compile/bundle its full transitive chain through Next.js) rather than a standalone unit test -- the identical verification create_agent_definition itself has always relied on, no new inconsistency introduced. Zero regressions across the full test:agent-core-lib suite. Full-repo tsc --noEmit clean, lint clean, real production build (exit 0).',
  'REAL_EXPOSED',
  'Closes the exact gap capability:agent_factory_dynamic_composition''s own status_notes already named honestly rather than glossing over. Still v1-scoped exactly as that capability is: staff-only (platform_owner), no client-created/disabled agents yet -- unchanged scope, this only adds the missing lifecycle action for what already exists.',
  now(),
  'claude_session_2026-09-07'
);
