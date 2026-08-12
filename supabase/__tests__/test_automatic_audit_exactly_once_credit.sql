-- Automatic Audit Engine V1 — exactly-once credit fixture (non-production).
--
-- This is a reviewable integration fixture, not a production migration.
-- Apply only against a disposable local/non-prod database that already has
-- the Automatic Audit Engine migration loaded.
--
-- Scenario:
--   same PASS run -> complete_automatic_audit_generation_v1 twice
-- Expected:
--   Audit completed once
--   credit eligibility issued once (coalesce preserves first timestamps)
--   second call returns already_completed = true
--   platform_admin_events records complete_automated_audit once for the first success path

-- Pseudocode / expected assertions for operators:
-- 1) Insert paid audit_order + Brand Brain version + PASS-ready generation run fixtures
-- 2) Call complete_automatic_audit_generation_v1(...) with matching order/tenant/run
-- 3) Assert order.status = completed, credit_eligible_from IS NOT NULL, credit_expires_at IS NOT NULL
-- 4) Capture credit_eligible_from / credit_expires_at
-- 5) Call the same RPC again with identical payload
-- 6) Assert success=true AND already_completed=true
-- 7) Assert credit timestamps unchanged
-- 8) Assert count(*) of platform_admin_events for action=complete_automated_audit and that order = 1

select 'automatic_audit_exactly_once_credit_fixture_ready' as status;
