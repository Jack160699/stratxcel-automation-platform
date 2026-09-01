-- Deepens the engine:priority_recommendations finding from Update 18 (full
-- pipeline traced: the real blocker is a missing BusinessSignals classifier,
-- not "untraced") and records a new, distinct finding: a real but
-- session-scoped (not agent-bridgeable without new work) paid-audit PDF
-- report generator, on a table separate from public_audit_requests.
-- Applied live via Supabase MCP on 2026-09-02; this file makes that
-- reproducible from a fresh database.

update public.capability_registry
set status_notes = 'Fully traced this pass (autonomous-convergence-loop mission, section 4): the real pipeline exists end-to-end -- diagnoseBusinessGrowth -> deriveBottlenecks -> buildGrowthRecommendations -> buildPlanRecommendations, all pure and real. The genuine, specific blocker: no function anywhere in the repository computes BusinessGrowthPlannerInput''s required BusinessSignals (websiteTrafficStrength/searchVisibilityStrength/crmFollowUpStrength etc, each a none/low/medium/high classification) from real tenant data -- grepped, confirmed absent. Writing that classifier myself would mean inventing new business judgment (deciding what raw numbers count as "low" vs "medium" search visibility), a real risk of fabricating a false-confidence signal the mission''s own anti-fabrication rule forbids. Correctly stays REAL_NOT_EXPOSED until that classifier is built as its own real, evidence-based unit -- not rushed here.',
    last_verified_at = now(),
    last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'engine:priority_recommendations';

insert into public.capability_registry
  (capability_key, name, description, category, skill, agent_tool_name, package_or_module, department, connection, required_permission, read_write, tenant_scope, cost_profile, risk, verification_method, status, status_notes, external_blocker, last_verified_at, last_verified_by)
values
  ('capability:paid_audit_pdf_report', 'Paid audit order PDF report', 'A real, working PDF generator (app/api/platform/audit/report/pdf/route.ts, hand-rolled minimal PDF writer, no external dependency) exists for a SEPARATE, paid, tenant-scoped audit system (audit_orders table) -- distinct from public_audit_requests, the free/prospect lead-capture flow check_audit_status (Update 15) already covers. Traced this pass: the route is cookie-session-scoped (createSupabaseServerClient + auth.getUser(), via ownedCompletedAudit()) with no auditId/tenantId parameter at all -- it resolves "the caller''s own current completed audit" from their browser session. A service-role agent call has no browser session, so this cannot be bridged as a thin wrapper the way every other REAL_EXPOSED row in this table was -- doing so honestly would require a new signed-URL or token-based download mechanism (real new engineering, not a rushed one-line wrapper).', 'audit', null, null, 'app/api/platform/audit/report/pdf/route.ts + app/api/platform/audit/report/_owned.ts (audit_orders table)', 'Engineering', null, null, 'read', 'tenant', 'free', 'read', 'none (not yet bridged)', 'REAL_NOT_EXPOSED', null, null, now(), 'claude_session_2026-09-02')
on conflict (capability_key) do nothing;
