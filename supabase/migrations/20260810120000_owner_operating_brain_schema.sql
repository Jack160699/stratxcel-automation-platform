-- Migration: Owner Operating Brain — private owner memory/DR system.
-- Additive only. Touches no existing table. Follows the same owner-scoped
-- RLS convention as social_autopilot_schema_delta.sql: rows are gated by
-- `owner_id = auth.uid() AND EXISTS(stratxcel_admins)` for admin-authored
-- tables, and by a read-only admin policy (service_role writes, bypassing
-- RLS) for tables background jobs populate (owner_events, owner_sync_runs,
-- owner_event_entities). This is single-owner data (Shriyansh's own
-- operating brain), not per-client tenant data — there is deliberately no
-- tenant_id anywhere in this schema.
--
-- Memory types are a fixed enum (see MEMORY_POLICY note below) — an
-- inference must never silently become a FACT; confirmation_state tracks
-- that transition explicitly instead.

-- ============================================================
-- 1. SOURCE REGISTRY
-- ============================================================

create table if not exists owner_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  source_key text not null check (source_key in (
    'gmail', 'google_calendar', 'google_drive', 'notion', 'github',
    'stratxcel_internal', 'stratxcel_admin_ui', 'voice_notes',
    'desktop_companion', 'chat_platforms'
  )),
  display_name text not null,
  category text not null check (category in (
    'communication', 'calendar', 'docs', 'code', 'notes',
    'internal', 'voice', 'desktop', 'chat'
  )),
  status text not null default 'UNAVAILABLE' check (status in (
    'CONNECTED', 'AUTH_REQUIRED', 'PERMISSION_REQUIRED', 'UNAVAILABLE', 'ERROR', 'PAUSED'
  )),
  enabled boolean not null default false,
  scopes text[] not null default '{}'::text[],
  permission_level text,
  data_categories text[] not null default '{}'::text[],
  retention_days integer not null default 180 check (retention_days > 0),
  last_sync_at timestamptz,
  last_success_at timestamptz,
  sync_cursor jsonb not null default '{}'::jsonb,
  health jsonb not null default '{}'::jsonb,
  last_error text,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, source_key)
);
alter table owner_sources enable row level security;
create index if not exists owner_sources_owner_idx on owner_sources (owner_id);
create policy owner_sources_admin_owner on owner_sources for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_sources to service_role;

-- Per-connection detail (a source can in principle have more than one
-- connected account, e.g. two Google identities) — kept separate from
-- owner_sources so the registry row stays stable while connections churn.
create table if not exists owner_source_connections (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references owner_sources(id) on delete cascade,
  owner_id uuid not null,
  provider_account_label text,
  -- Opaque ref into the existing @stratxcel/byok vault_secrets table.
  -- The raw OAuth refresh token / integration secret is NEVER stored here.
  encrypted_token_ref text,
  scopes text[] not null default '{}'::text[],
  status text not null default 'AUTH_REQUIRED' check (status in (
    'CONNECTED', 'AUTH_REQUIRED', 'ERROR', 'REVOKED'
  )),
  connected_at timestamptz,
  revoked_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table owner_source_connections enable row level security;
create index if not exists owner_source_connections_source_idx on owner_source_connections (source_id);
create policy owner_source_connections_admin_owner on owner_source_connections for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_source_connections to service_role;

-- Sync job/run history — written by the sync worker (service_role), read
-- by the admin UI. Same read-only-for-admin / write-for-service-role
-- pattern as social_health_checks.
create table if not exists owner_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references owner_sources(id) on delete cascade,
  owner_id uuid not null,
  status text not null default 'PENDING' check (status in (
    'PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL'
  )),
  trigger text not null default 'cron' check (trigger in ('cron', 'manual', 'backfill')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  cursor_before jsonb,
  cursor_after jsonb,
  events_ingested integer not null default 0,
  error jsonb,
  created_at timestamptz not null default now()
);
alter table owner_sync_runs enable row level security;
create index if not exists owner_sync_runs_source_idx on owner_sync_runs (source_id, started_at desc);
create policy owner_sync_runs_admin_read on owner_sync_runs for select to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_sync_runs to service_role;

-- ============================================================
-- 2. NORMALIZED EVENTS
-- ============================================================

create table if not exists owner_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  source_id uuid not null references owner_sources(id) on delete cascade,
  external_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  -- Bounded, sanitized projection only — never raw email bodies, tokens, or
  -- unbounded payloads. Adapters are responsible for redaction before this
  -- table is written.
  payload jsonb not null default '{}'::jsonb,
  raw_ref text,
  created_at timestamptz not null default now(),
  unique (source_id, external_id)
);
alter table owner_events enable row level security;
create index if not exists owner_events_owner_time_idx on owner_events (owner_id, occurred_at desc);
create index if not exists owner_events_type_idx on owner_events (event_type, occurred_at desc);
create policy owner_events_admin_read on owner_events for select to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_events to service_role;

create table if not exists owner_event_entities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references owner_events(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'person', 'project', 'decision', 'task', 'mood', 'topic', 'tool'
  )),
  entity_value text not null,
  confidence numeric(3,2) not null default 0.50 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);
alter table owner_event_entities enable row level security;
create index if not exists owner_event_entities_event_idx on owner_event_entities (event_id);
create policy owner_event_entities_admin_read on owner_event_entities for select to authenticated
  using (exists (select 1 from owner_events e where e.id = owner_event_entities.event_id and e.owner_id = (select auth.uid()))
    and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_event_entities to service_role;

-- ============================================================
-- 3. MEMORY
-- ============================================================

create table if not exists owner_memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  category text not null,
  statement text not null,
  memory_type text not null check (memory_type in (
    'FACT', 'EXPLICIT_PREFERENCE', 'SELF_REPORTED_STATE', 'INFERRED_WORK_PATTERN',
    'TEMPORARY_CONTEXT', 'DECISION', 'LESSON', 'OPEN_LOOP'
  )),
  confidence numeric(3,2) not null default 0.50 check (confidence >= 0 and confidence <= 1),
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  confirmation_state text not null default 'UNCONFIRMED' check (confirmation_state in (
    'UNCONFIRMED', 'CONFIRMED', 'REJECTED'
  )),
  superseded_by uuid references owner_memories(id) on delete set null,
  correction_history jsonb not null default '[]'::jsonb,
  retention_policy text not null default 'standard',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table owner_memories enable row level security;
create index if not exists owner_memories_owner_idx on owner_memories (owner_id, category);
create index if not exists owner_memories_type_idx on owner_memories (owner_id, memory_type, confirmation_state);
create index if not exists owner_memories_expiry_idx on owner_memories (expires_at) where expires_at is not null;
create policy owner_memories_admin_owner on owner_memories for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_memories to service_role;

create table if not exists owner_memory_sources (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references owner_memories(id) on delete cascade,
  event_id uuid references owner_events(id) on delete set null,
  source_id uuid references owner_sources(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
alter table owner_memory_sources enable row level security;
create index if not exists owner_memory_sources_memory_idx on owner_memory_sources (memory_id);
create policy owner_memory_sources_admin on owner_memory_sources for all to authenticated
  using (exists (select 1 from owner_memories m where m.id = owner_memory_sources.memory_id and m.owner_id = (select auth.uid()))
    and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from owner_memories m where m.id = owner_memory_sources.memory_id and m.owner_id = (select auth.uid()))
    and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_memory_sources to service_role;

create table if not exists owner_memory_feedback (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references owner_memories(id) on delete cascade,
  owner_id uuid not null,
  action text not null check (action in ('ACCEPT', 'CORRECT', 'FORGET', 'MARK_TEMPORARY', 'MARK_WRONG')),
  previous_statement text,
  new_statement text,
  created_at timestamptz not null default now()
);
alter table owner_memory_feedback enable row level security;
create index if not exists owner_memory_feedback_memory_idx on owner_memory_feedback (memory_id, created_at desc);
create policy owner_memory_feedback_admin_owner on owner_memory_feedback for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_memory_feedback to service_role;

-- ============================================================
-- 4. DECISIONS
-- ============================================================

create table if not exists owner_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null,
  project_domain text,
  decision_date date not null default current_date,
  alternatives jsonb not null default '[]'::jsonb,
  stated_reason text,
  expected_result text,
  confidence numeric(3,2) check (confidence >= 0 and confidence <= 1),
  related_evidence jsonb not null default '[]'::jsonb,
  status text not null default 'DECIDED' check (status in ('OPEN', 'DECIDED', 'REVERSED')),
  reversed_at timestamptz,
  reversed_reason text,
  lesson text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table owner_decisions enable row level security;
create index if not exists owner_decisions_owner_idx on owner_decisions (owner_id, decision_date desc);
create policy owner_decisions_admin_owner on owner_decisions for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_decisions to service_role;

create table if not exists owner_decision_options (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references owner_decisions(id) on delete cascade,
  label text not null,
  pros text,
  cons text,
  chosen boolean not null default false,
  created_at timestamptz not null default now()
);
alter table owner_decision_options enable row level security;
create index if not exists owner_decision_options_decision_idx on owner_decision_options (decision_id);
create policy owner_decision_options_admin on owner_decision_options for all to authenticated
  using (exists (select 1 from owner_decisions d where d.id = owner_decision_options.decision_id and d.owner_id = (select auth.uid()))
    and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from owner_decisions d where d.id = owner_decision_options.decision_id and d.owner_id = (select auth.uid()))
    and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_decision_options to service_role;

create table if not exists owner_decision_outcomes (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references owner_decisions(id) on delete cascade,
  outcome_date date not null default current_date,
  outcome_summary text not null,
  success_rating smallint check (success_rating between 1 and 5),
  notes text,
  created_at timestamptz not null default now()
);
alter table owner_decision_outcomes enable row level security;
create index if not exists owner_decision_outcomes_decision_idx on owner_decision_outcomes (decision_id);
create policy owner_decision_outcomes_admin on owner_decision_outcomes for all to authenticated
  using (exists (select 1 from owner_decisions d where d.id = owner_decision_outcomes.decision_id and d.owner_id = (select auth.uid()))
    and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from owner_decisions d where d.id = owner_decision_outcomes.decision_id and d.owner_id = (select auth.uid()))
    and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_decision_outcomes to service_role;

-- ============================================================
-- 5. PATTERN ANALYTICS
-- ============================================================

create table if not exists owner_communication_patterns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  pattern_type text not null,
  description text not null,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(3,2) not null default 0.50 check (confidence >= 0 and confidence <= 1),
  sample_count integer not null default 0,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CORRECTED', 'FORGOTTEN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table owner_communication_patterns enable row level security;
create index if not exists owner_communication_patterns_owner_idx on owner_communication_patterns (owner_id, pattern_type);
create policy owner_communication_patterns_admin_owner on owner_communication_patterns for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_communication_patterns to service_role;

create table if not exists owner_work_patterns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  pattern_type text not null,
  description text not null,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(3,2) not null default 0.50 check (confidence >= 0 and confidence <= 1),
  period_start date,
  period_end date,
  created_at timestamptz not null default now()
);
alter table owner_work_patterns enable row level security;
create index if not exists owner_work_patterns_owner_idx on owner_work_patterns (owner_id, pattern_type, period_end desc);
create policy owner_work_patterns_admin_owner on owner_work_patterns for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_work_patterns to service_role;

-- ============================================================
-- 6. REVIEWS, PLANS, OPEN LOOPS
-- ============================================================

create table if not exists owner_daily_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  review_date date not null,
  done text,
  problems text,
  decisions text,
  communication text,
  mood_energy jsonb not null default '{}'::jsonb,
  health text,
  social_family text,
  learned text,
  open_loops jsonb not null default '[]'::jsonb,
  tomorrow_top3 jsonb not null default '[]'::jsonb,
  source text not null default 'manual' check (source in ('manual', 'auto_prompted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, review_date)
);
alter table owner_daily_reviews enable row level security;
create index if not exists owner_daily_reviews_owner_idx on owner_daily_reviews (owner_id, review_date desc);
create policy owner_daily_reviews_admin_owner on owner_daily_reviews for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_daily_reviews to service_role;

create table if not exists owner_daily_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  plan_date date not null,
  top3 jsonb not null default '[]'::jsonb,
  deep_work jsonb not null default '[]'::jsonb,
  light_tasks jsonb not null default '[]'::jsonb,
  communication jsonb not null default '[]'::jsonb,
  health jsonb not null default '{}'::jsonb,
  social_family jsonb not null default '{}'::jsonb,
  what_to_avoid text,
  open_loops jsonb not null default '[]'::jsonb,
  based_on_review_id uuid references owner_daily_reviews(id) on delete set null,
  generated_by text not null default 'manual' check (generated_by in ('manual', 'hermes', 'rules')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, plan_date)
);
alter table owner_daily_plans enable row level security;
create index if not exists owner_daily_plans_owner_idx on owner_daily_plans (owner_id, plan_date desc);
create policy owner_daily_plans_admin_owner on owner_daily_plans for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_daily_plans to service_role;

create table if not exists owner_open_loops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  item text not null,
  loop_owner text,
  due_date date,
  source_id uuid references owner_sources(id) on delete set null,
  event_id uuid references owner_events(id) on delete set null,
  status text not null default 'OPEN' check (status in ('OPEN', 'DONE', 'DROPPED')),
  next_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table owner_open_loops enable row level security;
create index if not exists owner_open_loops_owner_idx on owner_open_loops (owner_id, status, due_date);
create policy owner_open_loops_admin_owner on owner_open_loops for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_open_loops to service_role;

-- ============================================================
-- 7. VOICE NOTES
-- ============================================================

create table if not exists owner_voice_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  audio_storage_ref text not null,
  duration_seconds numeric,
  recorded_at timestamptz not null default now(),
  status text not null default 'UPLOADED' check (status in ('UPLOADED', 'TRANSCRIBING', 'TRANSCRIBED', 'FAILED')),
  last_error text,
  created_at timestamptz not null default now()
);
alter table owner_voice_notes enable row level security;
create index if not exists owner_voice_notes_owner_idx on owner_voice_notes (owner_id, recorded_at desc);
create policy owner_voice_notes_admin_owner on owner_voice_notes for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_voice_notes to service_role;

create table if not exists owner_transcripts (
  id uuid primary key default gen_random_uuid(),
  voice_note_id uuid not null references owner_voice_notes(id) on delete cascade,
  text_content text not null,
  language text,
  provider text,
  confidence numeric(3,2) check (confidence >= 0 and confidence <= 1),
  structured_extraction jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table owner_transcripts enable row level security;
create index if not exists owner_transcripts_voice_note_idx on owner_transcripts (voice_note_id);
create policy owner_transcripts_admin on owner_transcripts for all to authenticated
  using (exists (select 1 from owner_voice_notes v where v.id = owner_transcripts.voice_note_id and v.owner_id = (select auth.uid()))
    and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from owner_voice_notes v where v.id = owner_transcripts.voice_note_id and v.owner_id = (select auth.uid()))
    and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_transcripts to service_role;

-- ============================================================
-- 8. RECOMMENDATIONS ("I noticed...") + DESKTOP DEVICE PAIRING
-- ============================================================

create table if not exists owner_recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  kind text not null,
  statement text not null,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(3,2) not null default 0.50 check (confidence >= 0 and confidence <= 1),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REJECTED', 'CORRECTED')),
  related_memory_id uuid references owner_memories(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table owner_recommendations enable row level security;
create index if not exists owner_recommendations_owner_idx on owner_recommendations (owner_id, status, created_at desc);
create policy owner_recommendations_admin_owner on owner_recommendations for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_recommendations to service_role;

-- Desktop companion device pairing. No credentials live here — pairing_
-- token_hash is a SHA-256 of a one-time pairing code, never the bearer
-- token the paired device subsequently authenticates with (that bearer
-- token is vault-stored, referenced by encrypted_token_ref, same pattern
-- as OAuth connections).
create table if not exists owner_desktop_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  device_name text not null,
  pairing_token_hash text,
  encrypted_token_ref text,
  status text not null default 'PENDING_PAIRING' check (status in ('PENDING_PAIRING', 'PAIRED', 'REVOKED')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table owner_desktop_devices enable row level security;
create index if not exists owner_desktop_devices_owner_idx on owner_desktop_devices (owner_id, status);
create policy owner_desktop_devices_admin_owner on owner_desktop_devices for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_desktop_devices to service_role;
