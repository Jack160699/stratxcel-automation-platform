-- Registers update_lead_status -- the mutation companion to
-- list_leads/get_lead, letting a Hermes mission move a real CRM lead
-- through the pipeline. Applied live via Supabase MCP on 2026-09-07; this
-- file makes it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:hermes_update_lead_status',
  'Hermes missions can move a real CRM lead through the pipeline -- update_lead_status',
  'The mutation companion to list_leads/get_lead (Updates 76-77): missions could read leads but not act on them -- a genuine sales-relevant gap given the master brief''s revenue north star (a mission that qualifies a lead by phone/WhatsApp had no way to record that outcome back into the real pipeline). Reuses leads-and-crm''s real updateLeadStatus(leadId, status) function unmodified. Investigated its tenant-scoping first and found it is NOT tenant-scoped internally (only filters by leadId) -- confirmed by reading its two other real callers (app/api/platform/leads/[leadId]/route.ts and packages/workforce-core/src/adapters/crm.ts''s loadOwnedLead), both of which independently re-verify tenant ownership with a separate scoped read before calling it. This handler follows the exact same established convention: it runs its own eq("tenant_id", ctx.tenantId).eq("id", leadId) existence check first and only calls updateLeadStatus if that check finds a row, refusing honestly (updated:false) otherwise -- never trusting a bare leadId. status is a Zod enum of the real 5 crm_leads pipeline values (NEW/CONTACTED/QUALIFIED/WON/LOST), matching packages/workforce-core/src/adapters/crm.ts''s own ALLOWED_LEAD_STATUSES allowlist exactly. Added to DEFAULT_TOOL_ALLOWLIST: a bounded mutation (5 allowlisted values, tenant-verified lead) with no spend and no external side effect, same default-allow class as create_crm_lead/update_mission_progress.',
  'hermes',
  'Sales',
  'update_lead_status',
  'read_write',
  'tenant',
  'free',
  'low_mutation',
  'apps/hermes-gateway/src/__tests__/update-lead-status.test.ts (3 scenarios): the real Zod schema requires leadId + an allowlisted status (rejects an invented status and wrong casing) and forbids a smuggled tenantId; the real handler source is confirmed to run its own crm_leads existence check scoped to BOTH ctx.tenantId and the requested leadId before ever calling updateLeadStatus, and to refuse (updated:false) rather than mutate when that check finds nothing; a simulation of the real two-step handler proves a real lead belonging to a different tenant is never mutated even with a guessed/leaked id, while the correct tenant''s own lead updates normally. Zero regressions across test:hermes-mission-control (11 files, all pass). Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production build (exit 0).',
  'REAL_EXPOSED',
  'Deliberately narrow: only the 5 real, pre-existing crm_leads status values are reachable (no arbitrary status string), and only a lead already verified to belong to the mission''s own tenant can ever be touched -- matches this session''s established policy of never widening a mutation''s blast radius beyond what the existing system already allows a human caller to do.',
  now(),
  'claude_session_2026-09-07'
);
