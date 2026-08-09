-- Migration: fix missing `authenticated` table-level grants on every
-- owner_* table. Same root-cause class of bug as
-- 20260727214817_grant_role_privileges.sql: RLS policies restrict ROWS,
-- they are not a substitute for the base Postgres table-level GRANT — and
-- per that migration's own documented convention ("Table-specific
-- authenticated grants are defined per-migration instead" — the project
-- deliberately does NOT auto-grant `authenticated` to future tables via
-- ALTER DEFAULT PRIVILEGES, to avoid silently bypassing whatever RLS a
-- new table ships with), the original owner_operating_brain_schema
-- migration should have included these and did not. Caught live: a real
-- authenticated Supabase client got `42501 permission denied for table
-- owner_sources` despite a correct, passing RLS policy — confirmed via
-- scripts/verify-owner-brain-rls.mjs against the real project.
--
-- Every RLS policy on these tables already scopes rows correctly (see
-- supabase/__tests__/owner-brain-rls-coverage.test.ts); this migration
-- only unblocks the table-level privilege check that RLS sits behind.

grant select, insert, update, delete on
  owner_sources,
  owner_source_connections,
  owner_memories,
  owner_memory_sources,
  owner_memory_feedback,
  owner_decisions,
  owner_decision_options,
  owner_decision_outcomes,
  owner_communication_patterns,
  owner_work_patterns,
  owner_daily_reviews,
  owner_daily_plans,
  owner_open_loops,
  owner_voice_notes,
  owner_transcripts,
  owner_recommendations,
  owner_desktop_devices
to authenticated;

-- Admin-read-only tables (owner_sync_runs, owner_events,
-- owner_event_entities) only ever need SELECT for `authenticated` — their
-- RLS policy is `for select` only, writes are service_role-only by
-- design (see the schema migration's own comments on these three).
grant select on owner_sync_runs, owner_events, owner_event_entities to authenticated;
