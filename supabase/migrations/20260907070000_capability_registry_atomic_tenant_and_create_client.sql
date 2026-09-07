-- Registers two related capabilities shipped in the same commit: the
-- atomic tenant+owner creation fix (a real, already-documented Blocker
-- from docs/product-design/FINAL_HARDENING_BACKLOG.md) and the new
-- create_client Founder tool that reuses it. Applied live via Supabase MCP
-- on 2026-09-07; this file makes it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:atomic_tenant_owner_creation',
  'Tenant + owner creation made atomic -- fixes an already-documented orphaned-tenant Blocker',
  'docs/product-design/FINAL_HARDENING_BACKLOG.md ("Onboarding & tenant creation" #1) already flagged this as a Blocker: createTenant() (lib/tenants/repository.ts) inserted the tenants row and the owner tenant_members row as two separate statements, not one transaction -- a failure between them orphans a tenant with no owner, unreachable through any normal membership resolution (listMyTenants, resolveCurrentTenant, the web client switcher). Every real caller inherited the risk: the onboarding wizard (app/api/platform/onboarding/route.ts), and the audit checkout/promo-redeem guest-tenant paths. Fixed with a real single-transaction Postgres RPC, create_tenant_with_owner (security definer, service_role-only, same pattern already established by claim_social_package_post/settle_social_package_post) -- lib/tenants/repository.ts''s createTenant() now calls this RPC instead of two separate inserts. Zero caller-visible behavior change: same input/output types, and a slug collision still raises Postgres'' own "duplicate key value violates unique constraint" text, which app/api/platform/onboarding/route.ts''s existing retry-with-suffixed-slug path already matches on.',
  'tenants',
  'Engineering',
  'write',
  'global',
  'free',
  'external_mutation',
  'Live transactional proof, not just reasoned about: (1) a real BEGIN/set_config(request.jwt.claim.role=service_role)/call/ROLLBACK dry-run created a real tenant + owner membership row together, joined correctly, then left zero permanent rows after rollback. (2) The actual bug being fixed, proven not to reproduce: forced the SECOND insert (tenant_members) to fail with a real NOT NULL violation (p_owner_user_id = null) -- confirmed the FIRST insert (tenants) was NOT left behind (0 leftover rows for that slug), i.e. the exact orphaned-tenant scenario the backlog named cannot happen anymore. TypeScript-level: lib/agent-core/__tests__/create-client-tool.test.ts covers createTenant''s real RPC call shape and real error-message pass-through with a fake .rpc() client. Zero regressions: re-ran onboarding-wizard.test.ts, client-app-shell.test.ts, and audit-payment-safety.test.ts (the three existing test files that cover createTenant''s real callers) -- all pass. Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production build (exit 0).',
  'REAL_EXPOSED',
  'A real, verified fix to already-documented technical debt, not new functionality -- closes docs/product-design/FINAL_HARDENING_BACKLOG.md''s "Onboarding & tenant creation" item #1 specifically (items #2 and #3 on that same list -- onboarding partial-persistence recovery and retry idempotency -- are separate, still-open items this pass did not touch).',
  now(),
  'claude_session_2026-09-07'
);

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:founder_create_client',
  'Founder can create a new company/client tenant via chat -- create_client',
  'The master brief''s own canonical agency-model example ("Create a client operation for this business") requires the Founder to actually create a new company, not just view/resolve existing ones (list_clients/get_client/resolve_client_by_name, all read-only). Built create_client (lib/agent-core/create-client-tool.ts), reusing createTenant (lib/tenants/repository.ts) unmodified -- the same function the onboarding wizard and audit checkout/promo-redeem paths already call, now atomic (capability:atomic_tenant_owner_creation, same commit). The creating principal becomes the new tenant''s real owner member (not a placeholder), so a newly-created company is immediately visible/operable through every existing surface: the Admin Web client switcher, list_clients, resolve_client_by_name -- not a special case needing its own visibility path. Gated by a new agent:mutate:clients permission, platform_owner-only (narrower than this session''s usual owner+admin symmetry, matching the identical precedent already set for agent:mutate:agent_definitions -- provisioning a new company is at least as consequential a meta-governance action).',
  'hermes',
  'Engineering',
  'create_client',
  'write',
  'global',
  'free',
  'external_mutation',
  'lib/agent-core/__tests__/create-client-tool.test.ts (4 scenarios): slugifyBusinessName produces the exact same real slug shape the onboarding wizard''s own slugify algorithm does (verified against real apostrophe/ampersand/whitespace/overlength/empty-name cases), createTenant is called with the real RPC and real params, a real RPC error message is surfaced never swallowed, and the tool refuses a missing/blank name rather than creating an unnamed company. Wiring verified via tsc --noEmit + a real NODE_ENV=production build (compiling/bundling the full ALL_EXTRA_TOOLS -> all-tools.ts -> create-client-tool.ts -> lib/tenants/repository.ts chain), the same verification discipline every other lib/agent-core/*-tool.ts file in this session has relied on. Zero regressions across test:agent-core-lib plus the three real createTenant-caller test files.',
  'REAL_EXPOSED',
  'Deliberately narrow in scope, stated precisely: creates the tenant + owner membership only. Does NOT seed Brand Brain, connect integrations, or create any missions -- those stay separate, later steps a Founder (or a subsequent mission) would still need to take, matching the tool''s own description text so the model never overclaims what one call did.',
  now(),
  'claude_session_2026-09-07'
);
