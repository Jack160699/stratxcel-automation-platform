-- Social Autopilot Copilot — execution telemetry.
-- Additive only. The existing social_agent_sessions/messages/actions tables
-- only capture coarse session status and discrete tool-call rows recorded
-- AFTER a tool call finished (succeeded/failed/queued for approval) — there
-- is no fine-grained "what is happening right now" timeline a client could
-- read while a turn is executing. These two tables add exactly that, using
-- the same conventions as the existing agent tables: ownership traced
-- through joins (never a duplicated owner_id column on child rows), RLS
-- enabled with real policies, UPPERCASE status enums.

create table if not exists social_agent_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references social_agent_sessions(id) on delete cascade,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'COMPLETED', 'FAILED')),
  error_reason text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table social_agent_runs enable row level security;
create index if not exists social_agent_runs_session_idx on social_agent_runs (session_id, started_at desc);
create policy social_agent_runs_admin on social_agent_runs for all to authenticated
  using (exists (
    select 1 from social_agent_sessions s
    where s.id = social_agent_runs.session_id and s.owner_id = (select auth.uid())
  ));

-- type is the canonical execution-event model: RUN_STARTED, UNDERSTANDING_REQUEST,
-- PROVIDER_REQUEST_STARTED, PROVIDER_RESPONSE_RECEIVED, TOOL_STARTED, TOOL_COMPLETED,
-- TOOL_FAILED, APPROVAL_REQUIRED, APPROVAL_APPROVED, APPROVAL_REJECTED, RUN_COMPLETED, RUN_FAILED.
-- label is a pre-rendered, human-readable, non-technical string (e.g. "Reading Brand Brain").
-- meta only ever holds safe, already-public-to-the-owner data (counts, durations, tool name) —
-- never provider payloads, prompts, or secrets.
create table if not exists social_agent_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references social_agent_runs(id) on delete cascade,
  type text not null check (type in (
    'RUN_STARTED', 'UNDERSTANDING_REQUEST',
    'PROVIDER_REQUEST_STARTED', 'PROVIDER_RESPONSE_RECEIVED',
    'TOOL_STARTED', 'TOOL_COMPLETED', 'TOOL_FAILED',
    'APPROVAL_REQUIRED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED',
    'RUN_COMPLETED', 'RUN_FAILED'
  )),
  label text not null,
  tool_name text,
  status text not null default 'INFO' check (status in ('INFO', 'SUCCESS', 'FAILED', 'PENDING')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table social_agent_run_events enable row level security;
create index if not exists social_agent_run_events_run_idx on social_agent_run_events (run_id, created_at);
create policy social_agent_run_events_admin on social_agent_run_events for all to authenticated
  using (exists (
    select 1 from social_agent_runs r
    join social_agent_sessions s on s.id = r.session_id
    where r.id = social_agent_run_events.run_id and s.owner_id = (select auth.uid())
  ));
