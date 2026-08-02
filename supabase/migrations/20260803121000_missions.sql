-- Mission lifecycle. States match the master brief exactly so lib/missions'
-- state machine and this constraint never drift apart.
create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_by uuid,
  goal_text text not null,
  service_key text,
  state text not null default 'DRAFT' check (state in (
    'DRAFT', 'ESTIMATING', 'AWAITING_FUNDS', 'READY', 'QUEUED', 'RUNNING',
    'AWAITING_INPUT', 'AWAITING_APPROVAL', 'HUMAN_HANDOFF', 'RESUMED',
    'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'
  )),
  estimated_cost_cents integer,
  hermes_profile text,
  hermes_run_id text,
  brand_brain_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table missions enable row level security;
create index if not exists missions_tenant_idx on missions (tenant_id, created_at desc);

-- Append-only progress/events log — this is what a refreshed dashboard tab
-- replays to reconstruct "what has happened on this mission so far" instead
-- of relying on an in-memory stream that dies on reload, per the brief's
-- "refresh-safe progress" requirement.
create table if not exists mission_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table mission_events enable row level security;
create index if not exists mission_events_mission_idx on mission_events (mission_id, created_at asc);

create table if not exists mission_artifacts (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  kind text not null,
  storage_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table mission_artifacts enable row level security;
create index if not exists mission_artifacts_mission_idx on mission_artifacts (mission_id);

create policy missions_tenant_read on missions for select
  using (exists (select 1 from tenant_members m where m.tenant_id = missions.tenant_id and m.user_id = (select auth.uid())));
create policy mission_events_tenant_read on mission_events for select
  using (exists (select 1 from missions ms join tenant_members m on m.tenant_id = ms.tenant_id
                 where ms.id = mission_events.mission_id and m.user_id = (select auth.uid())));
create policy mission_artifacts_tenant_read on mission_artifacts for select
  using (exists (select 1 from missions ms join tenant_members m on m.tenant_id = ms.tenant_id
                 where ms.id = mission_artifacts.mission_id and m.user_id = (select auth.uid())));

grant select, insert, update, delete on missions, mission_events, mission_artifacts to service_role;
grant select on missions, mission_events, mission_artifacts to authenticated;
