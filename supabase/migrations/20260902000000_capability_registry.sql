-- Master Brain brief, section 2/22: the canonical Capability Registry.
-- A durable, queryable CATALOG -- not a second tool registry. Execution
-- remains exactly resolveAgentTools()/runAgentTurn (packages/agent-core);
-- this table is descriptive, answering "what can the ecosystem do right
-- now" honestly, including capabilities that are real-but-not-yet-exposed,
-- broken, not built, or blocked on an external party. Seeded from this
-- session's own capability audit, not auto-generated -- deliberately, so a
-- false "REAL_EXPOSED" entry is a real editorial claim someone made, not a
-- guess a script produced.
create table public.capability_registry (
  id uuid primary key default gen_random_uuid(),
  capability_key text not null unique,
  name text not null,
  description text not null,
  category text not null,
  skill text,
  -- Exact name in resolveAgentTools()'s live tool arrays when status is
  -- REAL_EXPOSED -- lets a consistency check confirm the claim, not just
  -- trust it (see the accompanying test).
  agent_tool_name text,
  package_or_module text,
  department text,
  connection text,
  required_permission text,
  read_write text not null check (read_write in ('read', 'write', 'read_write')),
  tenant_scope text not null check (tenant_scope in ('global', 'tenant', 'platform_only')),
  cost_profile text,
  risk text check (risk in ('read', 'low_mutation', 'external_mutation', 'high_risk')),
  verification_method text,
  status text not null check (status in ('REAL_EXPOSED', 'REAL_NOT_EXPOSED', 'PARTIAL', 'BROKEN', 'NOT_BUILT', 'EXTERNAL_REQUIRED')),
  status_notes text,
  external_blocker text,
  last_verified_at timestamptz,
  last_verified_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index capability_registry_category_idx on public.capability_registry (category);
create index capability_registry_status_idx on public.capability_registry (status);

-- Service-role only, same as every other platform-staff-scoped table this
-- codebase already uses this pattern for (e.g. platform_staff_users) --
-- this is ecosystem-wide operational metadata, never tenant data, so RLS by
-- tenant_id makes no sense here; access is gated entirely by the
-- agent-core permission on the read tool that queries it (agent:read:capabilities).
alter table public.capability_registry enable row level security;
create policy capability_registry_service_role_only on public.capability_registry
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

grant select on public.capability_registry to service_role;

insert into public.capability_registry
  (capability_key, name, description, category, skill, agent_tool_name, package_or_module, department, connection, required_permission, read_write, tenant_scope, cost_profile, risk, verification_method, status, status_notes, external_blocker, last_verified_at, last_verified_by)
values
  ('agent_tool:analyze_website', 'Analyze a public website', 'Fetch and analyze any public website -- business identity, services, audience, positioning, SEO signals, conversion strengths/weaknesses.', 'research', 'website research/crawl', 'analyze_website', 'lib/intelligence/website-intelligence.ts + packages/search-discovery/crawler.ts', 'Research', null, 'agent:read:research', 'read', 'global', 'free (compute only)', 'read', 'none (read-only)', 'REAL_EXPOSED', 'Live-verified against tajwebsolutions.com, real 4-page crawl.', null, now(), 'claude_session_2026-09-01'),
  ('agent_tool:stratxcel_service_catalog', 'Stratxcel commercial catalog', 'The real, current pillars/pricing/trust-claims catalog, for grounding sales/partnership recommendations.', 'sales', 'commercial catalog lookup', 'stratxcel_service_catalog', 'lib/commercial/catalog.ts', 'Sales', null, 'agent:read:research', 'read', 'global', 'free', 'read', 'none (read-only)', 'REAL_EXPOSED', null, null, now(), 'claude_session_2026-09-01'),
  ('agent_tool:check_growth_status', 'Check SEO/AEO/GEO growth status', 'Real, currently-stored search opportunities/recommendations/actions/measurements for a tenant -- same data as the Search Growth dashboard.', 'growth', 'SEO/AEO/GEO opportunity read', 'check_growth_status', 'packages/search-discovery (listSearchState)', 'Growth', null, 'agent:read:research', 'read', 'tenant', 'free (reads persisted data)', 'read', 'none (read-only)', 'REAL_EXPOSED', 'Live-verified for the Stratxcel tenant itself.', null, now(), 'claude_session_2026-09-01'),
  ('agent_tool:check_connections', 'Check connection status', 'Real, current state of Google/GBP/Search Console/GA4/Vercel/WhatsApp/social connections -- same data as the Integrations page.', 'integrations', 'connection status read', 'check_connections', 'lib/connectors/load-integrations-data.ts', 'Operations', 'google,google_business,search_console,ga4,vercel,whatsapp,social', 'agent:read:integrations', 'read', 'tenant', 'free', 'read', 'none (read-only)', 'REAL_EXPOSED', 'Live-verified: correctly reported GBP setup-required, not fabricated as connected.', null, now(), 'claude_session_2026-09-01'),
  ('agent_tool:generate_image', 'Generate an image/creative', 'Real, brand-grounded, budget-gated image generation via the existing Social Copilot image engine.', 'media', 'AI image generation', 'generate_image', 'lib/social/agent/generate-image-tool.ts', 'Content', 'openai', 'agent:mutate:media', 'write', 'tenant', 'metered_ai (real $ per image)', 'low_mutation', 'interpretOutcome:generate_image', 'REAL_EXPOSED', 'Live-verified end to end incl. real confirm-code flow and a real (external) OpenAI 429 -- outcome correctly surfaced after Update 10.', null, now(), 'claude_session_2026-09-01'),
  ('agent_tool:send_whatsapp_message_to_contact', 'Outbound WhatsApp outreach', 'Boss-initiated, one-to-one real WhatsApp outreach to a new or existing external contact for a stated purpose.', 'outreach', 'targeted outbound messaging', 'send_whatsapp_message_to_contact', 'packages/agent-core/tools/admin/mutation-tools.ts + packages/whatsapp', 'Sales', 'whatsapp', 'agent:mutate:outreach', 'write', 'platform_only', 'free (send) — real Meta send', 'low_mutation', 'interpretOutcome:send_whatsapp_message_to_contact', 'PARTIAL', 'Fully built and deployed; a cold first contact needs an approved Meta template.', 'Meta template review (stratxcel_outreach_intro, id 2295702371188444) pending as of last check.', now(), 'claude_session_2026-09-01'),
  ('engine:website_vercel_orchestration', 'Website creation / Vercel deployment', 'Real, stateful multi-step website build + Vercel deployment orchestration.', 'website', 'website/domain orchestration', null, 'packages/websites-and-domains (orchestrator.ts, site-builder.ts, vercel-domains.ts)', 'Engineering', 'vercel', null, 'write', 'tenant', 'metered_provider', 'external_mutation', 'not yet bridged', 'REAL_NOT_EXPOSED', 'Real, mature package; not a one-shot function -- a real deployment state machine. Needs a dedicated bridging pass, not a rushed wrapper.', null, now(), 'claude_session_2026-09-01'),
  ('engine:audit_engine', 'Structured audit generation', 'Evidence-packet-based audit pipeline (budget-aware, provider-context-aware).', 'audit', 'audit generation', null, 'packages/audit-engine', 'Growth', null, null, 'read', 'tenant', 'metered_ai (likely)', null, 'not yet bridged', 'REAL_NOT_EXPOSED', 'Real package found; not traced deeply enough this pass to confirm which of it or lib/audit/v1 is canonical for prospect audits (WhatsApp currently synthesizes an audit from analyze_website''s data directly, which works but bypasses this engine).', null, now(), 'claude_session_2026-09-01'),
  ('engine:revenue_ops', 'Revenue/growth-signal intelligence', 'Conversion, growth-signals, CRM-workflow, and audit-intelligence logic.', 'finance', 'revenue intelligence', null, 'packages/revenue-ops', 'Finance', 'razorpay', null, 'read', 'tenant', 'free (compute)', null, 'not yet bridged', 'REAL_NOT_EXPOSED', 'Real package found (capability-requirements.ts, growth-signals.ts, conversion.ts); not traced or bridged this pass -- the real foundation for an Economic Brain capability.', null, now(), 'claude_session_2026-09-01'),
  ('engine:hermes_missions', 'Mission execution (Hermes)', 'Real, adapter-based mission execution with budget/context tracking.', 'operations', 'mission execution', 'create_mission', 'packages/hermes', 'Operations', null, 'agent:mutate:missions', 'write', 'tenant', 'metered_ai/provider', 'external_mutation', 'partial (create_mission exists; hermes_mode=disabled in production)', 'PARTIAL', 'create_mission tool exists and is exposed; production /api/health reports hermesMode: disabled, so created missions do not currently execute.', 'Hermes mode is disabled in production configuration -- an owner decision, not an engineering gap.', now(), 'claude_session_2026-09-01'),
  ('capability:market_company_discovery', 'Find N companies matching a description', '"Find 10 agencies offering SEO in India"-style multi-result business discovery.', 'research', 'business discovery', null, null, 'Sales', null, null, 'read', 'global', null, null, 'none', 'NOT_BUILT', 'No existing multi-result business-search infrastructure found in this repository to adapt.', null, now(), 'claude_session_2026-09-01'),
  ('capability:cross_platform_ecosystem_brain', 'Ascendory/Jandarpan ecosystem context', 'Shared Brain context across Stratxcel, Ascendory, and Jandarpan.', 'ecosystem', null, null, null, 'Executive', null, null, 'read', 'global', null, null, 'none', 'EXTERNAL_REQUIRED', 'Zero references to Ascendory or Jandarpan exist anywhere in this repository -- no code, data, or credentials are reachable from here.', 'Repository/database/credential access to Ascendory and Jandarpan has not been provided.', now(), 'claude_session_2026-09-01');
