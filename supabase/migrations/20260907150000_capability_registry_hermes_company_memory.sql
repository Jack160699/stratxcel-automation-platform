-- Registers remember_company_fact / recall_company_memory -- Hermes'
-- exposure to the real, shared company-memory store (agent_memories).
-- Depends on 20260907140000_agent_memories_hermes_source_channel.sql
-- (widens the source_channel CHECK to allow 'hermes'). Applied live via
-- Supabase MCP on 2026-09-07; this file makes it reproducible from a
-- fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:hermes_company_memory',
  'Hermes missions can now write and recall durable company memory -- remember_company_fact / recall_company_memory',
  'A real gap distinct from the "expose existing systems" tool series: the master brief lists "update company memory" as one of Hermes'' top-level responsibilities (alongside creating missions, delegating agents, measuring outcomes). Before this, a mission''s real findings only ever landed in mission_artifacts/mission_events -- there was no way for a mission''s verified research (e.g. "solar is viable, verified supplier: SolarTech Bhilai, Rs 42/watt") to become durable, company-scoped knowledge a FUTURE mission or WhatsApp/Admin Copilot turn could recall. Investigated reusing @stratxcel/agent-core''s existing rememberAgentFact/listAgentMemories directly and found a real structural mismatch: their scopeFilter requires a full AgentPrincipal, and only a CLIENT principal may write "workspace" (tenant-scoped) memory -- a Hermes mission is structurally staff-shaped (created via a staff-only admin tool), so it cannot legitimately construct a client principal, and "personal"/"agency" scopes are the wrong shape (not tenant-scoped, or platform-wide respectively -- either would either fail to represent company memory or leak across tenants). Rather than force-fit a synthetic principal into a security boundary designed for live human sessions, or invent a competing memory table, this writes/reads directly to the SAME REAL agent_memories table with Hermes'' own already-verified ctx.tenantId (matching every other tool in this series), reusing assertSafeMemoryValue (the real secret-pattern guard) unmodified. Required one real, narrow migration: agent_memories'' source_channel CHECK constraint only allowed admin_web/client_web/whatsapp -- widened to include "hermes" so a mission''s writes are honestly labeled, not mislabeled as a human channel.',
  'hermes',
  'Engineering',
  'remember_company_fact, recall_company_memory',
  'read_write',
  'tenant',
  'free',
  'low_mutation',
  'apps/hermes-gateway/src/__tests__/company-memory.test.ts (4 scenarios): the real schemas enforce agent_memories'' own key(<=120)/value(<=1200) length CHECK constraints and forbid a smuggled tenantId; the real remember_company_fact handler source is confirmed to reuse assertSafeMemoryValue, write workspace-scope with the verified ctx.tenantId, label source_channel honestly as "hermes", attribute to the real mission creator (refusing when absent), and UPDATE rather than duplicate an existing key; the real recall_company_memory handler is confirmed scoped to workspace + the verified tenant, excluding soft-deleted rows. A direct functional check confirmed assertSafeMemoryValue genuinely throws on a real secret-shaped value and allows a real non-secret fact. The migration itself was live-verified with a real transactional dry-run insert (source_channel=''hermes'', workspace scope, real tenant_id) before being treated as correct. Zero regressions across test:hermes-mission-control and packages/agent-core''s own brain-orchestrator.test.ts (the one existing test touching the memory system). Full-repo tsc --noEmit clean on the first pass, lint clean, real NODE_ENV=production build (exit 0).',
  'REAL_EXPOSED',
  'Deliberately additive-only: no forget/delete capability exposed to Hermes -- erasing durable company memory stays a human-initiated action via the existing WhatsApp/Admin Copilot remember_fact/forget_fact tools, a genuine, stated scope boundary. Also stated honestly: this does NOT add the confidence/provenance classification (FACT/VERIFIED/OBSERVATION/INFERENCE/PREFERENCE/EXPERIMENT/UNKNOWN) the master brief''s Section 25 separately calls for -- the existing agent_memories table has no such column for ANY caller (WhatsApp/Admin Copilot included), so adding it is a real, separate, larger schema change affecting the whole memory system, not scope-creeped into this pass. Recorded as a genuine future task.',
  now(),
  'claude_session_2026-09-07'
);
