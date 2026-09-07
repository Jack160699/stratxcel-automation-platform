-- Registers get_lead -- Hermes' fourth real tool, completing the CRM read
-- pair with list_leads (Update 76). Applied live via Supabase MCP on
-- 2026-09-07; this file makes it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:hermes_crm_single_lead_read',
  'Hermes missions can now look up a single real CRM lead by id -- get_lead',
  'Fourth tool in the "expose existing StratXcel systems to Hermes" series, completing the CRM read pair with list_leads (Update 76): a mission that lists leads then wants detail on one specific lead previously had no way to do so. Added get_lead as Hermes'' 16th tool, mirroring packages/agent-core/src/tools/admin/read-tools.ts''s own get_lead tool -- a direct crm_leads query filtered on BOTH tenant_id (the verified mission context) AND id (the requested lead), so a guessed or leaked lead id from a different real tenant structurally cannot resolve, even though the row genuinely exists. No new package dependency -- a direct table query.',
  'hermes',
  'Engineering',
  'get_lead',
  'read',
  'tenant',
  'free',
  'read',
  'apps/hermes-gateway/src/__tests__/get-lead.test.ts (3 scenarios): the real schema requires leadId and forbids a smuggled tenantId, the real handler source is confirmed to filter on both tenant_id and id (not just one), and a simulated cross-tenant lookup (a real row that exists but belongs to a different tenant) is proven to never resolve. Zero regressions across test:hermes-mission-control. Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production build (exit 0).',
  'REAL_EXPOSED',
  'Fourth of the ongoing series -- see capability:hermes_growth_engine_exposure for the full list and scope boundary. generate_image (Creative Studio) was investigated and deliberately deferred this pass: its real underlying chain (lib/social/agent/generate-image-tool.ts) is deeper and involves real financial spend per call, warranting its own careful pass rather than the same fast cadence as these read-only additions -- recorded honestly as a real next candidate, not silently dropped.',
  now(),
  'claude_session_2026-09-07'
);
