-- Registers check_domain_status -- Hermes' sixth real tool, exposing live
-- domain DNS/SSL status. Applied live via Supabase MCP on 2026-09-07; this
-- file makes it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:hermes_domain_status_exposure',
  'Hermes missions can now check real live domain DNS/SSL status -- check_domain_status',
  'Sixth tool in the "expose existing StratXcel systems to Hermes" series. Reuses inspectDomainDns/getVercelDomainStatus (@stratxcel/websites-and-domains) unmodified -- the exact same real functions lib/agent-core/growth-media-tools.ts''s own check_domain_status tool already calls, real public DNS resolution (A/CNAME/AAAA/nameservers) plus Vercel''s own verification/SSL-certificate status, run concurrently. Domain-scoped rather than tenant-row-scoped (a public DNS lookup + "does Vercel know this domain" carries no cross-tenant data-exposure risk, matching the existing agent-core tool''s own behavior exactly -- no new security precedent). Complements check_website_status (Update 75, which only reads the stored custom_domain value, not its live state).',
  'hermes',
  'Engineering',
  'check_domain_status',
  'read',
  'global',
  'free',
  'read',
  'apps/hermes-gateway/src/__tests__/check-domain-status.test.ts (2 scenarios): the real schema requires domain and forbids a smuggled tenantId, and the real handler source is confirmed to call both real functions (inspectDomainDns, getVercelDomainStatus) concurrently via Promise.all with a real per-call .catch() so either lookup failing degrades gracefully rather than crashing the whole tool call. Zero regressions across test:hermes-mission-control. Full-repo tsc --noEmit clean on the first pass, lint clean, real NODE_ENV=production build (exit 0).',
  'REAL_EXPOSED',
  'Sixth of the ongoing series -- see capability:hermes_growth_engine_exposure for the running list and scope boundary. Hermes'' restricted tool vocabulary is now 18 real tools, up from 12 at the start of this series.',
  now(),
  'claude_session_2026-09-07'
);
