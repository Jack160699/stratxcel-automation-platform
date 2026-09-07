-- Connector/Capability Control Plane (master brief Section 25-32): a
-- platform-and-company-scoped governance layer over EXTERNAL capabilities
-- Hermes' own execution can use -- distinct from three real, existing,
-- narrower systems this migration deliberately does NOT duplicate:
--   - tenant_provider_connections (@stratxcel/byok): tenant BYOK AI-key
--     billing, not infra/business capability governance.
--   - search_website_connections (@stratxcel/search-discovery): a tenant's
--     own Vercel token for THEIR website deploys -- surfaced here as a
--     read-only adapter (packages/connectors/src/health.ts), never
--     re-stored.
--   - search_google_connections: a tenant's own Google OAuth for
--     GSC/GA4 -- same read-only adapter treatment.
--   - owner_source_connections (lib/owner-brain): the Founder's PERSONAL
--     data-ingestion sources (Gmail/Calendar/Notion/GitHub) for the
--     morning-brief assistant -- a different governance model entirely
--     (personal read-only ingestion, not Hermes execution capability).
--
-- Same security convention as agent_definitions: service_role-only, RLS
-- enabled with zero policies (default-deny; service_role bypasses RLS by
-- Postgres/Supabase convention) -- staff authorization is enforced at the
-- Next.js application layer (requireOwnerContext), matching every other
-- staff-only admin table in this codebase.

create table if not exists connector_definitions (
  key text primary key,
  label text not null,
  category text not null check (category in ('infrastructure', 'ai', 'messaging', 'social', 'data', 'automation')),
  auth_method text not null check (auth_method in ('api_key', 'oauth', 'service_credential', 'mcp_managed')),
  scope_level text not null check (scope_level in ('platform', 'company', 'both')),
  declared_capabilities text[] not null default '{}',
  description text not null,
  real_status_source text not null,
  required_env_vars text[] not null default '{}',
  created_at timestamptz not null default now()
);

revoke all on connector_definitions from public, anon, authenticated;
grant select, insert, update, delete on connector_definitions to service_role;
alter table connector_definitions enable row level security;

create table if not exists connector_connections (
  id uuid primary key default gen_random_uuid(),
  connector_key text not null references connector_definitions(key) on delete cascade,
  -- null = platform-level connection (e.g. StratXcel's own AWS/GitHub/Supabase infra, or a platform-wide AI key).
  tenant_id uuid references tenants(id) on delete cascade,
  status text not null default 'pending' check (status in (
    'pending', 'connected', 'healthy', 'auth_expired', 'rate_limited',
    'quota_exhausted', 'error', 'disabled', 'requires_reauth'
  )),
  -- Opaque ref into vault_secrets via @stratxcel/byok's real, already-live
  -- AES-256-GCM vault -- reused unmodified, never a second encryption
  -- implementation. Null for mcp_managed connectors (no product-stored
  -- secret) and for connectors whose real connection is surfaced read-only
  -- from an existing table (vercel/whatsapp/google_workspace, tenant-scoped).
  encrypted_secret_ref text,
  discovered_capabilities text[] not null default '{}',
  last_health_check_at timestamptz,
  last_error text,
  connected_by_user_id uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connector_key, tenant_id)
);

revoke all on connector_connections from public, anon, authenticated;
grant select, insert, update, delete on connector_connections to service_role;
alter table connector_connections enable row level security;

create index if not exists connector_connections_tenant_idx on connector_connections (tenant_id);
create index if not exists connector_connections_connector_idx on connector_connections (connector_key);

create table if not exists connector_capability_assignments (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connector_connections(id) on delete cascade,
  capability_key text not null,
  -- Denormalized for direct filtering -- must match the parent connection's
  -- tenant scope; enforced in packages/connectors/src/repository.ts, not by
  -- a DB trigger, matching this codebase's established convention of
  -- enforcing cross-row invariants in the one real writer, not in SQL.
  tenant_id uuid references tenants(id) on delete cascade,
  department text,
  agent_definition_id uuid references agent_definitions(id) on delete cascade,
  autonomy text not null default 'disabled' check (autonomy in ('read', 'prepare', 'execute', 'approval_required', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on connector_capability_assignments from public, anon, authenticated;
grant select, insert, update, delete on connector_capability_assignments to service_role;
alter table connector_capability_assignments enable row level security;

create index if not exists connector_capability_assignments_connection_idx on connector_capability_assignments (connection_id);
create index if not exists connector_capability_assignments_tenant_idx on connector_capability_assignments (tenant_id);
create index if not exists connector_capability_assignments_agent_idx on connector_capability_assignments (agent_definition_id);

-- Seed the real connector catalogue from packages/connectors/src/registry.ts
-- (kept in sync by hand -- small, stable list, same convention as
-- apps/hermes-gateway/src/mcp-server.ts's TOOL_DESCRIPTIONS map).
insert into connector_definitions (key, label, category, auth_method, scope_level, declared_capabilities, description, real_status_source, required_env_vars) values
  ('aws', 'AWS', 'infrastructure', 'mcp_managed', 'platform',
   array['infrastructure.inspect', 'infrastructure.deploy_verify'],
   'StratXcel''s own AWS infrastructure (the mission-worker EC2 host). Operated through this engineering environment''s own AWS access today -- no product-stored credential. Health is real worker-heartbeat data, never fabricated.',
   '@stratxcel/queue getWorkerHealth() against worker_heartbeats, aggregated across mission-worker/whatsapp-worker/hermes-gateway',
   array[]::text[]),
  ('github', 'GitHub', 'infrastructure', 'service_credential', 'platform',
   array['infrastructure.repo_read'],
   'StratXcel''s own source repository. A platform-level fine-grained PAT can be connected here for a real, live GitHub API health check; until then this connector is honestly pending, not fabricated as connected.',
   'GET https://api.github.com/user with the vaulted PAT, when one is connected',
   array[]::text[]),
  ('supabase', 'Supabase', 'data', 'service_credential', 'platform',
   array['data.inspect'],
   'StratXcel''s own Postgres/Supabase project. Operated through this engineering environment''s own Supabase access today -- no product-stored credential. A platform-level token can be connected for presence-based status; this connector does not live-probe the Supabase Management API in v1, and says so honestly rather than claim a health state it cannot verify.',
   'presence of a vaulted platform-level token only (no live probe in v1)',
   array[]::text[]),
  ('vercel', 'Vercel', 'infrastructure', 'api_key', 'both',
   array['website.deploy_status', 'website.domain_status'],
   'Website hosting/deployment. Company-scoped connections are NOT stored here -- they read the real, already-live search_website_connections table (a tenant''s own Vercel Personal Access Token, connected via the Website Factory''s own flow) so there is exactly one place a tenant''s Vercel token ever lives. A platform-level connection (StratXcel''s own Vercel account) can be stored here directly and is health-checked with the real validateVercelToken function.',
   'company-scoped: search_website_connections (read-only adapter); platform-scoped: validateVercelToken() against a vaulted platform token',
   array[]::text[]),
  ('whatsapp', 'WhatsApp', 'messaging', 'oauth', 'company',
   array['messaging.send', 'messaging.receive'],
   'WhatsApp Cloud API messaging for a company. NOT stored here -- reads the real, already-live phone_bindings table (connected via the existing Admin > Integrations WhatsApp flow) so a tenant''s WhatsApp credential lives in exactly one place.',
   'phone_bindings.status, read-only adapter',
   array[]::text[]),
  ('meta', 'Meta (Facebook/Instagram)', 'social', 'oauth', 'company',
   array['messaging.send', 'messaging.receive'],
   'Meta''s WhatsApp Business Cloud API messaging surface -- health tracks the SAME underlying connection as whatsapp (both are the one real Meta Cloud API binding a tenant has). Deliberately does NOT yet cover Instagram/Facebook social POSTING, which is a real, separate, already-live system (lib/social/repositories/accounts.ts''s social_accounts table, driving the onboarding ConnectorSheet flow) -- not wired into this control plane in v1 because social_accounts scopes by owner_id, whose exact relationship to tenant_id needs confirming before this reads across it (a genuine, precisely-scoped future item, not silently skipped).',
   'phone_bindings.status, read-only adapter (same signal as whatsapp) -- Instagram/Facebook posting status is a separate, not-yet-wired future item',
   array[]::text[]),
  ('google_workspace', 'Google Workspace', 'data', 'oauth', 'company',
   array['analytics.read', 'search_console.read'],
   'A company''s own Google OAuth for Search Console + GA4. NOT stored here -- reads the real, already-live search_google_connections table (the Search & Discovery engine''s own OAuth flow) so a tenant''s Google credential lives in exactly one place.',
   'search_google_connections.status, read-only adapter',
   array[]::text[]),
  ('gemini', 'Gemini (Google AI)', 'ai', 'api_key', 'platform',
   array['media.image_generation', 'media.video_generation', 'ai.text'],
   'Google AI Studio/Gemini API for AI generation -- a platform-level key (GEMINI_API_KEY), the same one @stratxcel/ai-runtime''s Google provider already uses. Health is the real, already-live probeGeminiReadiness() live HTTP check, reused unmodified.',
   '@stratxcel/ai-runtime probeGeminiReadiness() live check against GEMINI_API_KEY',
   array['GEMINI_API_KEY']),
  ('openrouter', 'OpenRouter', 'ai', 'api_key', 'platform',
   array['ai.text_escalation'],
   'OpenRouter as an opt-in AI resource pool (built this session, Update 71) -- a platform-level key. Health is the real, already-live probeOpenRouterReadiness() live HTTP check, reused unmodified. Connecting a key here is a genuine alternative to the OPENROUTER_API_KEY env var, not a duplicate of it -- see packages/connectors/src/health.ts for the real precedence.',
   '@stratxcel/ai-runtime probeOpenRouterReadiness() live check',
   array['OPENROUTER_API_KEY', 'OPENROUTER_ENABLED']),
  ('browser', 'Browser / Computer', 'automation', 'mcp_managed', 'platform',
   array[]::text[],
   'Browser/computer-use automation for Hermes missions. Declared honestly as NOT YET a real Hermes-callable capability -- no browser tool exists in Hermes'' restricted ToolName union today. This row exists so the control plane''s own completeness is honest (a real, named future BUILD item) rather than silently absent.',
   'none -- no real Hermes execution path exists yet; status is always pending',
   array[]::text[])
on conflict (key) do nothing;
