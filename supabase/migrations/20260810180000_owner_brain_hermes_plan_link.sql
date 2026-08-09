-- Migration: link owner_daily_plans to an optional real Hermes mission.
-- Additive only. hermes_mission_id references the existing missions table
-- (packages/missions) — the Owner Operating Brain's Hermes-assisted
-- planning creates a REAL mission under the real "stratxcel" internal
-- tenant via the unmodified createAndEstimateMission/mission-worker
-- pipeline (see lib/owner-brain/hermes/morning-plan-hermes.ts); this
-- column is just the pointer back to it. hermes_suggestion caches the
-- last-read completion summary so the UI doesn't need to re-query
-- mission_events on every page load.

alter table owner_daily_plans
  add column if not exists hermes_mission_id uuid references missions(id) on delete set null,
  add column if not exists hermes_suggestion jsonb;

create index if not exists owner_daily_plans_hermes_mission_idx on owner_daily_plans (hermes_mission_id) where hermes_mission_id is not null;
