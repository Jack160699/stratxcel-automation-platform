-- Real Postgres-backed cache for runWebsiteIntelligencePipeline
-- (lib/intelligence/website-intelligence.ts), fixing capability:analyze_website_no_cache
-- (master brief section 27, cost optimization). Global, not tenant-scoped --
-- analyze_website can be pointed at any public website, not just a
-- Stratxcel customer's own -- so this is a shared cache keyed by URL, not
-- per-tenant data. Service-role-only RLS, matching capability_registry's
-- own established pattern. Applied live via Supabase MCP on 2026-09-02;
-- this file makes that reproducible from a fresh database.
create table if not exists public.website_intelligence_cache (
  normalized_url text primary key,
  intelligence jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.website_intelligence_cache enable row level security;

create policy website_intelligence_cache_service_role_only
  on public.website_intelligence_cache
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists website_intelligence_cache_expires_at_idx
  on public.website_intelligence_cache (expires_at);
