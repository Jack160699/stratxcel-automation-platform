-- Hermes runtime integration (feat/hermes-runtime-adapter): tracks the
-- authoritative run status/usage on the mission row (so a UI read doesn't
-- need to replay mission_events), and makes Hermes-sourced mission_events
-- insertion idempotent by (mission_id, run_id, sequence, event_type) —
-- normalizeHermesEvent (packages/hermes/src/event-normalization.ts) can
-- emit more than one Stratxcel event per source sequence number (e.g. a
-- tool.completed that also produces an artifact.created), so the
-- uniqueness key includes event_type, not just sequence. Existing,
-- non-Hermes mission_events rows (state_changed, compiled, admin_override,
-- ...) never set run_id/sequence and are unaffected — the unique index
-- below only applies where both are present. All additive.

alter table missions add column if not exists last_hermes_status text;
alter table missions add column if not exists last_event_at timestamptz;
alter table missions add column if not exists input_tokens integer;
alter table missions add column if not exists output_tokens integer;
alter table missions add column if not exists total_tokens integer;
alter table missions add column if not exists transcript_backfill_cursor text;

alter table mission_events add column if not exists run_id text;
alter table mission_events add column if not exists sequence integer;

create unique index if not exists mission_events_hermes_dedup_idx
  on mission_events (mission_id, run_id, sequence, event_type)
  where run_id is not null and sequence is not null;
