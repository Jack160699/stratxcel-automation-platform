-- Records a verification-only finding: the Company/Organization model was
-- re-checked end-to-end against the master brief's "check before building"
-- discipline and found genuinely mature, with no code change made. Applied
-- live via Supabase MCP on 2026-09-07; this file makes it reproducible from
-- a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:company_organization_model_verification',
  'Company/Organization model verified mature -- no new gap found, deliberately no code change',
  'Per the master brief''s own "check before building" discipline: re-verified the Company/Organization model end-to-end rather than assume it needs work. Findings, each checked against real code: (1) create -- create_client tool, atomic create_tenant_with_owner RPC (Update 73). (2) list/get -- list_clients/get_client admin tools (id/slug/name/created_at/memberCount). (3) name resolution -- resolve_client_by_name (Update 70), prevents tenantId-guessing. (4) per-company rich overview -- the web admin page (app/admin/(shell)/clients/[tenantId]/page.tsx) uses lib/tenants/admin-repository.ts''s loadAgencyClientOverview (tenant+missions+approvals+wallet+bindings), and initially looked like a chat-parity gap (that composed function itself is not chat-tool-exposed) -- but tracing its own individual pieces found packages/agent-core/src/tools/admin/read-tools.ts already exposes list_missions, list_approvals, and finance_summary (wallet+subscription+invoices+entitlements, actually richer than the web page''s bare wallet) as real, tenant-scoped chat tools -- so a staff Founder already has full chat-reachable parity with the web overview via 3-4 existing tool calls, just not a single-call aggregator. (5) company-ops layer -- packages/workforce-core/src/company-ops/ (customer-success, engineering, finance, offboarding, operations, observability/reconstruction, views/admin+customer contracts) is extensive and real, built on tenant_id throughout. (6) departments/roles/capabilities -- packages/workforce-core''s planning/roles/capability-registry already mature (Update 72''s own investigation). Conclusion: this is genuinely ~90%+ built, not a gap needing new code -- the one true absence (a single-call get_client_overview convenience aggregator) is a nice-to-have, not a functional gap, since every piece it would compose is already independently callable. Deliberately not built to avoid manufacturing busywork against a clean area.',
  'workforce',
  'Engineering',
  'list_clients, get_client, resolve_client_by_name, list_missions, list_approvals, finance_summary',
  'read_write',
  'tenant',
  'free',
  'read',
  'Read-only investigation: traced every referenced function/tool against its real source (read-tools.ts, admin-repository.ts, company-ops/*, planning/*) to confirm each capability is real and reachable, not assumed from memory of prior sessions. No code changed as a result -- this row exists to make the verification itself part of the durable, queryable record per this session''s own established convention (every real finding gets a row, including a confirmed-clean one), so a future session does not re-investigate the same ground from scratch.',
  'REAL_EXPOSED',
  'Not a capability itself but a verification checkpoint -- status REAL_EXPOSED reflects that every piece it checked is independently REAL_EXPOSED. If a Founder specifically asks for a single-call cross-company or per-company dashboard view (chat or web), that is a real, well-scoped, buildable follow-up -- deliberately not built speculatively.',
  now(),
  'claude_session_2026-09-07'
);
