-- Automatic Audit Engine V1 — exactly-once credit fixture (non-production).
--
-- Executable coverage lives in test_automatic_audit_engine_db_e2e.sql
-- (happy path + duplicate completion + quality NEEDS_REVIEW + cancel/refund +
-- cross-tenant). Apply that file against a disposable local/non-prod database
-- that already has 20260812170000_automatic_audit_engine_v1.sql loaded.
--
-- Scenario preserved here for operators:
--   same PASS run -> complete_automatic_audit_generation_v1 twice
-- Expected:
--   Audit completed once
--   credit eligibility issued once (coalesce preserves first timestamps)
--   second call returns already_completed = true
--   platform_admin_events records complete_automated_audit once for the first success path

select 'automatic_audit_exactly_once_credit_fixture_ready' as status;
select 'see_test_automatic_audit_engine_db_e2e_sql' as executable_fixture;
