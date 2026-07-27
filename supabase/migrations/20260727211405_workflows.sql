-- social_automation_settings (existing) is a single settings row per owner —
-- no equivalent for configurable trigger->action workflows. Genuinely
-- missing; added following the same owner_id + admin_owner RLS convention.
create table if not exists social_automations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  description text,
  trigger jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table social_automations enable row level security;
create policy social_automations_admin_owner on social_automations for all
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));

create table if not exists social_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references social_automations(id) on delete cascade,
  status text not null default 'RUNNING' check (status in ('RUNNING','SUCCEEDED','FAILED','SKIPPED')),
  trigger_context jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table social_automation_runs enable row level security;
create index if not exists social_automation_runs_automation_idx on social_automation_runs (automation_id, started_at desc);
create policy social_automation_runs_admin on social_automation_runs for select
  using (exists (select 1 from social_automations a where a.id = social_automation_runs.automation_id and a.owner_id = (select auth.uid())));
